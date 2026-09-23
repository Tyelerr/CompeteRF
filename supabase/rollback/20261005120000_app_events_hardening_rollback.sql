-- supabase/rollback/20261005120000_app_events_hardening_rollback.sql
--
-- Reverts STEP 1A to the exact pre-hardening production state (policy bodies verbatim from prod
-- pg_policies, captured 2026-09-23; grants back to ALL for anon/authenticated).
-- ⚠ EMERGENCY USE ONLY: re-opens identity spoofing and the entity_id IS NULL read leak.
-- Roll back STEP 2 and STEP 1B first if applied. Clients using log_app_event() /
-- get_tournament_event_counts() would fail (logging silently; director/owner dashboard counts
-- show 0) — revert the client too.

drop function if exists public.log_app_event(text, text, integer, jsonb);
drop function if exists public.get_tournament_event_counts(integer[], text[], timestamptz);

drop policy if exists "Anon can insert anonymous events" on public.app_events;
drop policy if exists "Users can insert own events" on public.app_events;
drop policy if exists "Directors and owners can read own tournament events" on public.app_events;
drop policy if exists "TEMP compat: directors and owners read own tournament events" on public.app_events;

create policy "Anyone can insert events" on public.app_events as permissive for insert to anon, authenticated
  with check (true);
create policy "Anon can insert events" on public.app_events as permissive for insert to anon
  with check ((user_id IS NULL));
create policy "Users can insert own events" on public.app_events as permissive for insert to authenticated
  with check (((user_id = auth.uid()) OR (user_id IS NULL)));
create policy "Users can read own events" on public.app_events as permissive for select to authenticated
  using ((auth.uid() = user_id));
create policy "Directors and owners can read own tournament events" on public.app_events as permissive for select to authenticated
  using (((entity_id IS NULL) OR (entity_id IN ( SELECT t.id
   FROM tournaments t
  WHERE (t.director_id = ( SELECT profiles.id_auto
           FROM profiles
          WHERE (profiles.id = auth.uid())))
UNION
 SELECT t.id
   FROM (tournaments t
     JOIN venue_owners vo ON ((vo.venue_id = t.venue_id)))
  WHERE ((vo.owner_id = ( SELECT profiles.id_auto
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (vo.archived_at IS NULL))))));

grant all on table public.app_events to anon, authenticated;

drop function if exists public._app_event_shape_ok(text, text, jsonb);
drop function if exists public._app_event_rate_ok();
drop index if exists public.idx_app_events_user_created;
