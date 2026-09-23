-- supabase/migrations/20260927120000_match_check_in.sql
--
-- Per-ASSIGNMENT player check-in + "Contact TD" for elimination matches.
--
-- A player who gets a "Table Assigned" push can acknowledge it (Check In) or raise an issue
-- (Contact TD). Both are scoped to the exact assignment: the row identity carries assigned_at and
-- draw_number, so a check-in can never carry into a later assignment of the same match. Nothing
-- here is automatic: check-in never gates Start Match, and no penalty/forfeit logic exists yet.
--
-- Objects:
--   1. match_player_status — one row per (tournament, match, registration, assignment).
--      RLS: a player reads their own rows, a tournament manager reads the event's rows. NO client
--      insert/update/delete: both writes go through the narrow SECURITY DEFINER RPCs below, so a
--      client can never write live_settings wholesale or another player's status.
--   2. _match_player_context(tid, match_id) — shared, private resolver: maps auth.uid() to their
--      registration in that tournament and returns the match's current assignment identity
--      (assigned_at / draw_number / table) using the SAME bracket resolver and participant rule
--      as submit_match_state.
--   3. match_check_in(tid, match_id)                       — idempotent self check-in.
--   4. match_contact_td(tid, match_id, reason, message)    — records the issue and notifies the
--      people responsible for THIS event (director + active venue owners/directors) in-app;
--      global Compete admins are deliberately NOT notified (they still see it in the manager UI).
--   5. _match_issue_recipients(tid) — the recipient rule, isolated so it can be tested.
--
-- Not touched: bracket advancement, scoring, race, Auto Assign, Match Order, queue pins, the
-- Clear Table hold, assignment-notification recipients, push-token ownership.

create table if not exists public.match_player_status (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  match_id text not null,
  registration_id bigint not null references public.tournament_players(id) on delete cascade,
  -- assignment identity: a new table (or any re-assignment) produces a new assigned_at, and a
  -- redraw a new draw_number, so old rows can never be mistaken for the current assignment.
  assigned_at timestamptz not null,
  draw_number integer not null default 0,
  checked_in_at timestamptz,
  issue_reason text check (issue_reason in ('running_late', 'table_missing', 'equipment', 'other')),
  issue_message text check (issue_message is null or char_length(issue_message) <= 280),
  issue_at timestamptz,
  issue_pushed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, match_id, registration_id, assigned_at, draw_number)
);

create index if not exists match_player_status_match_idx
  on public.match_player_status (tournament_id, match_id);

alter table public.match_player_status enable row level security;

drop policy if exists "Players read their own match status" on public.match_player_status;
create policy "Players read their own match status"
  on public.match_player_status for select to authenticated
  using (exists (
    select 1
    from public.tournament_players tp
    join public.profiles p on p.id_auto = tp.player_id
    where tp.id = match_player_status.registration_id
      and (p.id = auth.uid() or tp.player_uuid = public.current_player_id())
  ));

drop policy if exists "Managers read match status" on public.match_player_status;
create policy "Managers read match status"
  on public.match_player_status for select to authenticated
  using (public.can_manage_tournament(match_player_status.tournament_id));

revoke all on public.match_player_status from public, anon, authenticated;
grant select on public.match_player_status to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. Shared resolver: who is calling, and what is this match's CURRENT assignment?
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._match_player_context(p_tournament_id bigint, p_match_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     bigint;
  v_player  uuid;
  v_ls      jsonb;
  v_ms      jsonb;
  v_who     jsonb;
  v_reg     bigint;
  v_status  text;
begin
  select p.id_auto into v_uid from public.profiles p where p.id = auth.uid();
  v_player := public.current_player_id();
  if v_uid is null and v_player is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select t.live_settings into v_ls
  from public.tournaments t
  where t.id = p_tournament_id and t.tournament_format <> 'chip-tournament';
  if v_ls is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  v_who := public._elim_resolve(v_ls) -> p_match_id;
  if v_who is null or not coalesce((v_who ->> 'real')::boolean, false) then
    raise exception 'match_not_playable' using errcode = 'P0001';
  end if;

  -- the caller must BE one of this match's two players
  select tp.id into v_reg
  from public.tournament_players tp
  where tp.tournament_id = p_tournament_id
    and (tp.player_id = v_uid or tp.player_uuid = v_player)
    and tp.status not in ('cancelled', 'no_show')
    and tp.id::text in (v_who ->> 'p1', v_who ->> 'p2');
  if v_reg is null then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  v_ms := coalesce(v_ls #> array['matchState', p_match_id], '{}'::jsonb);
  v_status := coalesce(v_ms ->> 'status', 'scheduled');
  if v_status = 'completed' then
    raise exception 'match_completed' using errcode = 'P0001';
  end if;
  -- NOTE: jsonb_typeof() is NULL for a missing key, and NULL <> 'x' is NULL (not true), so these
  -- MUST use "is distinct from" or an unassigned match would slip through.
  if jsonb_typeof(v_ms -> 'tableId') is distinct from 'number'
     or jsonb_typeof(v_ms -> 'assignedAt') is distinct from 'string' then
    raise exception 'match_not_assigned' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'registrationId', v_reg,
    'assignedAt', v_ms ->> 'assignedAt',
    'drawNumber', coalesce((v_ls #>> '{bracket,drawNumber}')::int, 0),
    'tableId', (v_ms ->> 'tableId')::bigint,
    'status', v_status);
end;
$$;

revoke all on function public._match_player_context(bigint, text) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. Check in (self only, idempotent)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.match_check_in(p_tournament_id bigint, p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ctx jsonb;
  v_row public.match_player_status;
begin
  v_ctx := public._match_player_context(p_tournament_id, p_match_id);

  insert into public.match_player_status (
    tournament_id, match_id, registration_id, assigned_at, draw_number, checked_in_at)
  values (
    p_tournament_id, p_match_id, (v_ctx ->> 'registrationId')::bigint,
    (v_ctx ->> 'assignedAt')::timestamptz, (v_ctx ->> 'drawNumber')::int, now())
  on conflict (tournament_id, match_id, registration_id, assigned_at, draw_number) do update
    -- idempotent: repeat taps keep the FIRST check-in time
    set checked_in_at = coalesce(public.match_player_status.checked_in_at, excluded.checked_in_at),
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'status', 'checked_in',
    'registrationId', v_row.registration_id,
    'assignedAt', v_row.assigned_at,
    'checkedInAt', v_row.checked_in_at);
end;
$$;

revoke all on function public.match_check_in(bigint, text) from public, anon;
grant execute on function public.match_check_in(bigint, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. Who is notified about a match issue: the people running THIS event.
--    Director + active venue owners + active venue directors. NOT global Compete admins (they
--    still see the ? in the manager UI) and never other players.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._match_issue_recipients(p_tournament_id bigint)
returns table (id_auto bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct r.id_auto from (
    select t.director_id::bigint as id_auto from public.tournaments t where t.id = p_tournament_id
    union
    select vo.owner_id::bigint from public.tournaments t
      join public.venue_owners vo on vo.venue_id = t.venue_id and vo.archived_at is null
     where t.id = p_tournament_id
    union
    select vd.director_id::bigint from public.tournaments t
      join public.venue_directors vd on vd.venue_id = t.venue_id and vd.archived_at is null
     where t.id = p_tournament_id
  ) r
  where r.id_auto is not null;
$$;

revoke all on function public._match_issue_recipients(bigint) from public, anon, authenticated;
-- the notify-match-issue Edge Function (service role) reads the recipient list for the push
grant execute on function public._match_issue_recipients(bigint) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 5. Contact TD (match-scoped, no chat system)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.match_contact_td(
  p_tournament_id bigint,
  p_match_id text,
  p_reason text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ctx      jsonb;
  v_row      public.match_player_status;
  v_msg      text := nullif(btrim(coalesce(p_message, '')), '');
  v_name     text;
  v_tname    text;
  v_label    text;
  v_n        int := 0;
  r          record;
begin
  if p_reason is null or p_reason not in ('running_late', 'table_missing', 'equipment', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  if v_msg is not null and char_length(v_msg) > 280 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  v_ctx := public._match_player_context(p_tournament_id, p_match_id);

  insert into public.match_player_status (
    tournament_id, match_id, registration_id, assigned_at, draw_number,
    issue_reason, issue_message, issue_at, resolved_at)
  values (
    p_tournament_id, p_match_id, (v_ctx ->> 'registrationId')::bigint,
    (v_ctx ->> 'assignedAt')::timestamptz, (v_ctx ->> 'drawNumber')::int,
    p_reason, v_msg, now(), null)
  on conflict (tournament_id, match_id, registration_id, assigned_at, draw_number) do update
    set issue_reason = excluded.issue_reason,
        issue_message = excluded.issue_message,
        issue_at = excluded.issue_at,
        issue_pushed_at = null,
        resolved_at = null,
        updated_at = now()
  returning * into v_row;

  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.user_name, tp.guest_name, 'A player')
  into v_name
  from public.tournament_players tp
  left join public.profiles p on p.id_auto = tp.player_id
  where tp.id = v_row.registration_id;
  select t.name into v_tname from public.tournaments t where t.id = p_tournament_id;

  v_label := case p_reason
    when 'running_late' then 'Running late'
    when 'table_missing' then 'Can''t find table'
    when 'equipment' then 'Equipment issue'
    else 'Needs help' end;

  -- In-app (durable) for the event's managers. Push is sent by the notify-match-issue Edge
  -- Function right after this returns; it is best-effort and never part of this transaction.
  for r in select * from public._match_issue_recipients(p_tournament_id) loop
    insert into public.notifications (user_id, title, body, category, data, status, sent_at)
    values (
      r.id_auto,
      coalesce(v_tname, 'Compete'),
      v_name || ' — ' || v_label || coalesce(': ' || v_msg, ''),
      'tournament_update',
      jsonb_build_object(
        'type', 'match_issue', 'tournament_id', p_tournament_id, 'match_id', p_match_id,
        'registration_id', v_row.registration_id, 'assigned_at', v_row.assigned_at,
        'reason', p_reason,
        'deep_link', '/(tabs)/admin/manage-tournament/' || p_tournament_id::text),
      'sent', now());
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object(
    'status', 'sent', 'statusId', v_row.id, 'recipients', v_n,
    'registrationId', v_row.registration_id, 'assignedAt', v_row.assigned_at, 'reason', p_reason);
end;
$$;

revoke all on function public.match_contact_td(bigint, text, text, text) from public, anon;
grant execute on function public.match_contact_td(bigint, text, text, text) to authenticated;
