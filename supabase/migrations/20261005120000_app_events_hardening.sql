-- supabase/pending/20261005120000_app_events_hardening.sql   (PENDING — not applied)
--
-- app_events security hardening — STEP 1A.
--
-- Rollout: 1A (this) → next native build (log_app_event + aggregate RPC readers) → 1B
-- (…125000, removes the temporary director/owner raw-read bridge) → 2 (…130000, removes direct
-- INSERT). 1B and 2 stay pending until the new native build has propagated.
--
-- Closes:
--   • identity spoofing on write: the "Anyone can insert events WITH CHECK (true)" policy let
--     anyone (incl. logged-out) insert an event attributed to ANY user_id, of any type/shape;
--   • the read leak: "Directors and owners can read own tournament events" had
--     `entity_id IS NULL OR …`, so EVERY signed-in user could read every app_opened /
--     filters_changed row (4k+ rows incl. other users' user_id + activity timelines);
--   • directors / bar owners reading anything beyond their own tournaments. Their dashboards only
--     ever used counts: new clients use get_tournament_event_counts() (no user_id, no metadata,
--     no individual timestamps), scoped server-side to tournaments they direct or whose venue they
--     actively own. A TEMPORARY raw-read bridge (below) keeps native builds already in the field
--     working on exactly those tournament rows until STEP 1B;
--   • "Users can read own events" — no screen reads it; dropped.
-- Adds the narrow, rate-limited write path log_app_event(). Direct client INSERT stays for now
-- (own/anonymous + known shapes + same rate limit) so native builds already in the field keep
-- logging; STEP 2 (…130000) removes it once the RPC-based native build has propagated.
--
-- Admins (compete_admin / super_admin) keep full raw SELECT ("Admins can read all events",
-- unchanged).

-- ── Allowed shapes (shared by the insert policies and log_app_event) ────────────────────────
-- Event types = the 12 the app defines (9 in use + search_performed / push_opened / error_logged).
create or replace function public._app_event_shape_ok(p_event_type text, p_entity_type text, p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_event_type in (
           'tournament_viewed', 'directions_clicked', 'venue_contact_clicked', 'tournament_shared',
           'tournament_favorited', 'tournament_unfavorited', 'search_performed', 'filters_changed',
           'giveaway_viewed', 'push_opened', 'error_logged', 'app_opened')
     and (p_entity_type is null or p_entity_type in ('tournament', 'venue', 'giveaway', 'push_notification'))
     and (p_metadata is null or (jsonb_typeof(p_metadata) = 'object' and octet_length(p_metadata::text) <= 2048))
$$;
revoke all on function public._app_event_shape_ok(text, text, jsonb) from public;
grant execute on function public._app_event_shape_ok(text, text, jsonb) to anon, authenticated;

-- ── Rate limit (fail-soft: over the limit the event is simply not recorded) ─────────────────
-- Per signed-in user: 60 events / rolling minute (prod peak ever: 22). Anonymous events have no
-- per-caller identity (no IP/device fingerprinting by design), so they share one global bucket:
-- 120 / rolling minute (prod peak ever: 7). A flood can only starve anonymous analytics, never UX.
-- The caller is always auth.uid() (no argument), so nobody can probe another user's activity.
-- A signed-in caller counts against their own bucket even when inserting user_id = null.
-- SECURITY DEFINER because callers have no SELECT on app_events; returns only a boolean.
create index if not exists idx_app_events_user_created on public.app_events (user_id, created_at);

create or replace function public._app_event_rate_ok()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is not null then
      (select count(*) from public.app_events
        where user_id = auth.uid() and created_at > now() - interval '1 minute') < 60
    else
      (select count(*) from public.app_events
        where user_id is null and created_at > now() - interval '1 minute') < 120
  end
$$;
revoke all on function public._app_event_rate_ok() from public;
grant execute on function public._app_event_rate_ok() to anon, authenticated;

-- ── Writes: no spoofing, only known event shapes, rate-limited (old clients keep working) ───
drop policy if exists "Anyone can insert events" on public.app_events;
drop policy if exists "Anon can insert events" on public.app_events;
drop policy if exists "Users can insert own events" on public.app_events;

-- Logged-out visitors: anonymous events only.
create policy "Anon can insert anonymous events" on public.app_events
  as permissive for insert to anon
  with check (user_id is null
              and public._app_event_shape_ok(event_type, entity_type, metadata)
              and public._app_event_rate_ok());

-- Signed-in users: only as themselves (or anonymous), only known shapes.
create policy "Users can insert own events" on public.app_events
  as permissive for insert to authenticated
  with check ((user_id is null or user_id = auth.uid())
              and public._app_event_shape_ok(event_type, entity_type, metadata)
              and public._app_event_rate_ok());

-- ── Reads ───────────────────────────────────────────────────────────────────────────────────
drop policy if exists "Users can read own events" on public.app_events;
drop policy if exists "Directors and owners can read own tournament events" on public.app_events;
-- "Admins can read all events" (compete_admin / super_admin) is unchanged.

-- TEMPORARY compatibility bridge for native builds that still count rows directly
-- (`.from('app_events').in('entity_id', myTournamentIds)`). Tournament-entity rows only, and only
-- for tournaments the caller directs or at venues they actively own — no entity_id-null rows
-- (app_opened / filters_changed), no giveaway/venue rows, no other tournaments. Still exposes the
-- viewer user_id on those rows, which is accepted only until STEP 1B drops this policy.
create policy "TEMP compat: directors and owners read own tournament events" on public.app_events
  as permissive for select to authenticated
  using (
    entity_type = 'tournament'
    and entity_id in (
      select t.id from public.tournaments t
       where t.director_id = public._authz_my_id_auto()
      union
      select t.id from public.tournaments t
        join public.venue_owners vo on vo.venue_id = t.venue_id
       where vo.owner_id = public._authz_my_id_auto() and vo.archived_at is null)
  );

-- ── Grants: nothing may update / delete / truncate; anon never reads ────────────────────────
revoke all on table public.app_events from anon;
grant insert on table public.app_events to anon;
revoke update, delete, truncate, references, trigger on table public.app_events from authenticated;
-- authenticated keeps SELECT (admin + temporary director/owner policy; the latter removed in
-- STEP 1B) and INSERT (policy above; removed in STEP 2).

-- ── The narrow write path (new clients use this) ────────────────────────────────────────────
-- Identity is derived from auth — there is no user_id parameter. Logged-out callers are allowed
-- and are always recorded as anonymous. Unknown event/entity types, oversized or non-object
-- metadata, and over-limit calls are dropped. Returns true when recorded; never raises for those.
create or replace function public.log_app_event(
  p_event_type text, p_entity_type text default null, p_entity_id integer default null, p_metadata jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public._app_event_shape_ok(p_event_type, p_entity_type, coalesce(p_metadata, '{}'::jsonb)) then
    return false;
  end if;
  if not public._app_event_rate_ok() then
    return false;
  end if;
  insert into public.app_events (event_type, entity_type, entity_id, user_id, metadata)
  values (p_event_type, p_entity_type, p_entity_id, v_uid, coalesce(p_metadata, '{}'::jsonb));
  return true;
end
$$;
revoke all on function public.log_app_event(text, text, integer, jsonb) from public;
grant execute on function public.log_app_event(text, text, integer, jsonb) to anon, authenticated;

-- ── Aggregate read path for director / bar-owner dashboards ─────────────────────────────────
-- Returns one row per (tournament, event type) with a count — never user_id, metadata or
-- individual timestamps. p_tournament_ids is intersected server-side with what the caller may
-- see: tournaments they direct, tournaments at venues they actively own, or everything for
-- admins. IDs outside that set are silently ignored (no error, no count). p_since optionally
-- windows by created_at (the dashboards' Today / This Week / This Month / period filters).
-- Only tournament-entity events are counted.
create or replace function public.get_tournament_event_counts(
  p_tournament_ids integer[], p_event_types text[], p_since timestamptz default null)
returns table (entity_id integer, event_type text, event_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select public._authz_my_id_auto() as id_auto, public._authz_is_admin() as is_admin
  ),
  allowed as (
    select t.id
      from public.tournaments t, me
     where t.id = any(p_tournament_ids)
       and (me.is_admin
            or t.director_id = me.id_auto
            or exists (select 1 from public.venue_owners vo
                        where vo.venue_id = t.venue_id
                          and vo.owner_id = me.id_auto
                          and vo.archived_at is null))
  )
  select e.entity_id, e.event_type, count(*)::bigint
    from public.app_events e
    join allowed a on a.id = e.entity_id
   where e.entity_type = 'tournament'
     and e.event_type = any(p_event_types)
     and (p_since is null or e.created_at >= p_since)
   group by e.entity_id, e.event_type
$$;
-- Supabase default privileges grant EXECUTE to anon directly, so revoke it explicitly.
revoke all on function public.get_tournament_event_counts(integer[], text[], timestamptz) from public, anon;
grant execute on function public.get_tournament_event_counts(integer[], text[], timestamptz) to authenticated;
