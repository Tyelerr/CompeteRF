-- supabase/migrations/20260929120000_check_in_timer.sql
--
-- Match check-in timer + player Start Match.
--
-- Product model: the timer starts at the server's assignedAt, keeps running while the match is
-- assigned / waiting / checked in but not started, and stops at Start Match. Check In and Contact
-- TD never stop it — tapping Check In does not prove anyone is at the table. Thresholds are
-- tournament settings (live_settings.checkIn, no schema needed); a TD may extend ONE assignment.
-- Nothing is ever automatic: no penalty, no forfeit. The TD decides.
--
-- Contents:
--   1. 'opponent_not_here' joins the Contact TD reasons.
--   2. match_player_status gains checked_in_by / checked_in_source (who confirmed presence).
--   3. match_assignment_status — ONE row per assignment for match-level timer facts: the TD's
--      extension and the once-per-assignment Forfeit Review alert stamps. (Per-player facts stay
--      in match_player_status; keying both on assigned_at + draw_number is what makes every reset
--      rule automatic — clear/reassign/table change/new draw simply has no row yet.)
--   4. submit_match_state: participants may no longer patch status / startedAt / completedAt.
--      A player starts a match ONLY through match_player_start, which validates properly.
--      Managers keep their existing authority.
--   5. match_player_start(tid, match)                       — participant, safe start.
--   6. match_mark_checked_in(tid, match, reg, checked_in)   — manager marks presence (guest /
--      no phone / verbal confirmation), or undoes it.
--   7. match_extend_deadline(tid, match, minutes)           — manager, current assignment only.
--   8. _match_review_sweep() + cron — in-app Forfeit Review alert for the event's managers, once
--      per assignment, ONLY while the match is still unstarted, then a pg_net kick so the
--      notify-match-review Edge Function can push. Works with no screen open.
--
-- Untouched: Auto Assign, Match Order, queuePins, the Clear Table hold, bracket advancement,
-- scoring, race, assignment-notification recipients, push-token ownership.
--
-- Setup after applying (secrets never live in git):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-match-review', 'elim_review_url');
--   supabase functions deploy notify-match-review --no-verify-jwt

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 1 + 2. Reasons and presence provenance
-- ════════════════════════════════════════════════════════════════════════════════════════
alter table public.match_player_status drop constraint if exists match_player_status_issue_reason_check;
alter table public.match_player_status add constraint match_player_status_issue_reason_check
  check (issue_reason in ('running_late', 'table_missing', 'equipment', 'opponent_not_here',
                          'dispute', 'watch_shot', 'other'));

alter table public.match_player_status add column if not exists checked_in_by uuid;
alter table public.match_player_status add column if not exists checked_in_source text;
alter table public.match_player_status drop constraint if exists match_player_status_checked_in_source_check;
alter table public.match_player_status add constraint match_player_status_checked_in_source_check
  check (checked_in_source is null or checked_in_source in ('player', 'manager'));

-- match_contact_td learns the new reason (the constraint above is not enough — the RPC has its
-- own whitelist and label map).
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
  -- pre-match AND mid-match reasons
  if p_reason is null or p_reason not in ('running_late', 'table_missing', 'equipment', 'opponent_not_here', 'dispute', 'watch_shot', 'other') then
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
    -- NOTE: checked_in_at is deliberately NOT touched — raising an issue never un-checks a player.
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
    when 'opponent_not_here' then 'Opponent not here'
    when 'dispute' then 'Dispute / Need TD'
    when 'watch_shot' then 'Need shot watched'
    else 'Needs help' end;

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

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. Match-level assignment facts (timer extension + alert dedupe)
-- ════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.match_assignment_status (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  match_id text not null,
  assigned_at timestamptz not null,
  draw_number integer not null default 0,
  -- TD "Extend Time" for THIS assignment only; tournament defaults are never changed.
  extended_minutes integer not null default 0 check (extended_minutes between 0 and 240),
  extended_by uuid,
  extended_at timestamptz,
  -- Forfeit Review: stamped once per assignment so cron cannot alert every minute.
  review_alert_at timestamptz,
  review_pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, match_id, assigned_at, draw_number)
);

create index if not exists match_assignment_status_lookup
  on public.match_assignment_status (tournament_id, match_id);

alter table public.match_assignment_status enable row level security;

drop policy if exists "Managers read assignment status" on public.match_assignment_status;
create policy "Managers read assignment status"
  on public.match_assignment_status for select to authenticated
  using (public.can_manage_tournament(match_assignment_status.tournament_id));

-- Players need the extension to render their own countdown honestly.
drop policy if exists "Players read assignment status of their match" on public.match_assignment_status;
create policy "Players read assignment status of their match"
  on public.match_assignment_status for select to authenticated
  using (exists (
    select 1
    from public.tournament_players tp
    join public.profiles p on p.id_auto = tp.player_id
    where tp.tournament_id = match_assignment_status.tournament_id
      and (p.id = auth.uid() or tp.player_uuid = public.current_player_id())
      and tp.status not in ('cancelled', 'no_show')
  ));

revoke all on public.match_assignment_status from public, anon, authenticated;
grant select on public.match_assignment_status to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. submit_match_state — close the participant start loophole
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Before: the whitelist was applied BEFORE the manager check, so an ordinary participant could
-- patch status/startedAt/completedAt directly (starting or completing a match with no table
-- check, no check-in rule and a client-supplied timestamp). Now those three fields are
-- manager-only; a participant keeps exactly the scoring fields. Everything else is unchanged.
create or replace function public.submit_match_state(
  p_tournament_id bigint,
  p_match_id text,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      bigint;
  v_player   uuid;
  v_is_mgr   boolean;
  v_ls       jsonb;
  v_existing jsonb;
  v_clean    jsonb;
  v_who      jsonb;
  v_key      text;
  v_val      jsonb;
  v_allowed  text[];
begin
  select p.id_auto into v_uid
  from public.profiles p
  where p.id = auth.uid();
  v_player := public.current_player_id();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  v_is_mgr := public.can_manage_tournament(p_tournament_id);

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid patch' using errcode = '22023';
  end if;

  -- Lifecycle fields are MANAGER-ONLY. A participant scores; starting a match goes through
  -- match_player_start (table + not-started + check-in rules + server-stamped startedAt).
  v_allowed := case when v_is_mgr
    then array['status', 'winner', 'p1Score', 'p2Score', 'startedAt', 'completedAt', 'result']
    else array['winner', 'p1Score', 'p2Score', 'result'] end;
  if not v_is_mgr and (p_patch ? 'status' or p_patch ? 'startedAt' or p_patch ? 'completedAt') then
    raise exception 'Only a tournament manager can change the match lifecycle' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_clean
  from jsonb_each(p_patch)
  where key = any(v_allowed);

  for v_key, v_val in select key, value from jsonb_each(v_clean) loop
    if (v_key = 'status' and not (jsonb_typeof(v_val) = 'string'
          and (v_val #>> '{}') in ('scheduled', 'in_progress', 'completed')))
       or (v_key = 'winner' and not (jsonb_typeof(v_val) = 'null' or v_val in ('1'::jsonb, '2'::jsonb)))
       or (v_key in ('p1Score', 'p2Score') and jsonb_typeof(v_val) <> 'null' and not (
             jsonb_typeof(v_val) = 'number' and (v_val #>> '{}') ~ '^[0-9]+$'
             and (v_val #>> '{}')::numeric <= 999))
       or (v_key = 'result' and not (jsonb_typeof(v_val) = 'null' or (jsonb_typeof(v_val) = 'string'
             and (v_val #>> '{}') in ('normal', 'forfeit', 'withdraw'))))
       or (v_key in ('startedAt', 'completedAt') and jsonb_typeof(v_val) not in ('null', 'string'))
    then
      raise exception 'Invalid value for %', v_key using errcode = '22023';
    end if;
    if v_key in ('startedAt', 'completedAt') and jsonb_typeof(v_val) = 'string' then
      begin
        perform (v_val #>> '{}')::timestamptz;
      exception when others then
        raise exception 'Invalid value for %', v_key using errcode = '22023';
      end;
    end if;
  end loop;

  select coalesce(t.live_settings, '{}'::jsonb)
  into v_ls
  from public.tournaments t
  where t.id = p_tournament_id
  for update;

  if v_ls is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  v_ls := jsonb_set(v_ls, '{matchState}', coalesce(v_ls -> 'matchState', '{}'::jsonb), true);
  v_existing := coalesce(v_ls #> array['matchState', p_match_id], '{}'::jsonb);

  if not v_is_mgr then
    v_who := public._elim_resolve(v_ls) -> p_match_id;
    if v_who is null
       or not coalesce((v_who ->> 'real')::boolean, false)
       or not exists (
         select 1 from public.tournament_players tp
         where tp.tournament_id = p_tournament_id
           and (tp.player_id = v_uid or tp.player_uuid = v_player)
           and tp.status not in ('cancelled', 'no_show')
           and tp.id::text in (v_who ->> 'p1', v_who ->> 'p2')
       ) then
      raise exception 'Not allowed to score this match' using errcode = '42501';
    end if;
    if (v_existing ->> 'status') = 'completed' then
      raise exception 'Match is final and locked' using errcode = '42501';
    end if;
  end if;

  v_ls := jsonb_set(v_ls, array['matchState', p_match_id], v_existing || v_clean, true);

  update public.tournaments
  set live_settings = v_ls,
      updated_at = now()
  where id = p_tournament_id;

  return v_ls;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 5. Player Start Match
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Reuses _elim_apply_one's 'start' op — the SAME validation and server-stamped startedAt the TD
-- path uses — and flips live_state on the first real start exactly like elim_live_apply.
create or replace function public.match_player_start(p_tournament_id bigint, p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ctx      jsonb;
  v_row      record;
  v_ls       jsonb;
  v_ms       jsonb;
  v_ids      text[];
  v_step     jsonb;
  v_state    text;
  v_required boolean;
  v_present  int;
  v_reg      bigint;
begin
  -- Participant + current-assignment checks (same resolver as check-in): the caller must be one
  -- of THIS match's two players, the match must be playable, assigned and not completed.
  v_ctx := public._match_player_context(p_tournament_id, p_match_id);
  v_reg := (v_ctx ->> 'registrationId')::bigint;
  if (v_ctx ->> 'status') = 'in_progress' then
    raise exception 'match_in_progress' using errcode = 'P0001';
  end if;

  select t.live_settings, t.live_state, t.status, t.tournament_format
  into v_row
  from public.tournaments t
  where t.id = p_tournament_id
  for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  v_ls := coalesce(v_row.live_settings, '{}'::jsonb);

  -- Check-in gate: only when the TD requires it. Each side must be present, by their own tap or a
  -- manager's manual mark — the opponent can never check someone in.
  v_required := coalesce((v_ls #>> '{checkIn,required}')::boolean, false);
  if v_required then
    select count(*) into v_present
    from public.match_player_status s
    where s.tournament_id = p_tournament_id
      and s.match_id = p_match_id
      and s.assigned_at = (v_ctx ->> 'assignedAt')::timestamptz
      and s.draw_number = (v_ctx ->> 'drawNumber')::int
      and s.checked_in_at is not null;
    if v_present < 2 then
      raise exception 'waiting_for_check_in' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(array_agg(n ->> 'id'), '{}') into v_ids
  from jsonb_array_elements(v_ls #> '{bracket,graph}') n;
  v_ms := case when jsonb_typeof(v_ls -> 'matchState') = 'object' then v_ls -> 'matchState' else '{}'::jsonb end;

  -- Same op, same validation, same server timestamp as the TD path.
  v_step := public._elim_apply_one(p_tournament_id, v_ids, v_ms,
                                   jsonb_build_object('op', 'start', 'matchId', p_match_id));
  v_ls := jsonb_set(v_ls, '{matchState}', v_step -> 'ms', true);

  v_state := v_row.live_state;
  if coalesce(v_row.live_state, '') not in ('in_progress', 'finished')
     and coalesce(v_row.status, '') not in ('completed', 'archived') then
    v_state := 'in_progress';
  end if;

  update public.tournaments
  set live_settings = v_ls, live_state = v_state, updated_at = now()
  where id = p_tournament_id;

  return jsonb_build_object('status', 'started', 'matchId', p_match_id,
                            'startedBy', v_reg, 'liveState', v_state);
end;
$$;

revoke all on function public.match_player_start(bigint, text) from public, anon;
grant execute on function public.match_player_start(bigint, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 6. Manager marks a player present (or undoes it)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.match_mark_checked_in(
  p_tournament_id bigint,
  p_match_id text,
  p_registration_id bigint,
  p_checked_in boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ls   jsonb;
  v_ms   jsonb;
  v_who  jsonb;
  v_at   timestamptz;
  v_draw int;
  v_row  public.match_player_status;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not allowed to manage this tournament' using errcode = '42501';
  end if;

  select coalesce(t.live_settings, '{}'::jsonb) into v_ls
  from public.tournaments t where t.id = p_tournament_id and t.tournament_format <> 'chip-tournament';
  if v_ls is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  -- The registration must really be one of this match's two sides, on the CURRENT assignment.
  v_who := public._elim_resolve(v_ls) -> p_match_id;
  if v_who is null or not coalesce((v_who ->> 'real')::boolean, false)
     or p_registration_id::text not in (v_who ->> 'p1', v_who ->> 'p2') then
    raise exception 'not_in_match' using errcode = 'P0001';
  end if;
  v_ms := coalesce(v_ls #> array['matchState', p_match_id], '{}'::jsonb);
  if jsonb_typeof(v_ms -> 'assignedAt') is distinct from 'string' then
    raise exception 'match_not_assigned' using errcode = 'P0001';
  end if;
  v_at := (v_ms ->> 'assignedAt')::timestamptz;
  v_draw := coalesce((v_ls #>> '{bracket,drawNumber}')::int, 0);

  if p_checked_in then
    insert into public.match_player_status (
      tournament_id, match_id, registration_id, assigned_at, draw_number,
      checked_in_at, checked_in_by, checked_in_source)
    values (p_tournament_id, p_match_id, p_registration_id, v_at, v_draw, now(), auth.uid(), 'manager')
    on conflict (tournament_id, match_id, registration_id, assigned_at, draw_number) do update
      set checked_in_at = coalesce(public.match_player_status.checked_in_at, excluded.checked_in_at),
          checked_in_by = coalesce(public.match_player_status.checked_in_by, excluded.checked_in_by),
          checked_in_source = coalesce(public.match_player_status.checked_in_source, excluded.checked_in_source),
          updated_at = now()
    returning * into v_row;
  else
    -- Undo: clears presence only. An open Contact TD message is left exactly as it is.
    update public.match_player_status s
    set checked_in_at = null, checked_in_by = null, checked_in_source = null, updated_at = now()
    where s.tournament_id = p_tournament_id and s.match_id = p_match_id
      and s.registration_id = p_registration_id
      and s.assigned_at = v_at and s.draw_number = v_draw
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'status', case when p_checked_in then 'checked_in' else 'cleared' end,
    'registrationId', p_registration_id,
    'checkedInAt', v_row.checked_in_at,
    'source', v_row.checked_in_source);
end;
$$;

revoke all on function public.match_mark_checked_in(bigint, text, bigint, boolean) from public, anon;
grant execute on function public.match_mark_checked_in(bigint, text, bigint, boolean) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 7. Extend Time (this assignment only)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.match_extend_deadline(
  p_tournament_id bigint,
  p_match_id text,
  p_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ls   jsonb;
  v_ms   jsonb;
  v_at   timestamptz;
  v_draw int;
  v_row  public.match_assignment_status;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not allowed to manage this tournament' using errcode = '42501';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 120 then
    raise exception 'invalid_minutes' using errcode = 'P0001';
  end if;

  select coalesce(t.live_settings, '{}'::jsonb) into v_ls
  from public.tournaments t where t.id = p_tournament_id;
  if v_ls is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  v_ms := coalesce(v_ls #> array['matchState', p_match_id], '{}'::jsonb);
  if jsonb_typeof(v_ms -> 'assignedAt') is distinct from 'string' then
    raise exception 'match_not_assigned' using errcode = 'P0001';
  end if;
  v_at := (v_ms ->> 'assignedAt')::timestamptz;
  v_draw := coalesce((v_ls #>> '{bracket,drawNumber}')::int, 0);

  insert into public.match_assignment_status (
    tournament_id, match_id, assigned_at, draw_number, extended_minutes, extended_by, extended_at)
  values (p_tournament_id, p_match_id, v_at, v_draw, least(p_minutes, 240), auth.uid(), now())
  on conflict (tournament_id, match_id, assigned_at, draw_number) do update
    -- extensions accumulate for this assignment; a new assignment starts at 0 (no row)
    set extended_minutes = least(public.match_assignment_status.extended_minutes + excluded.extended_minutes, 240),
        extended_by = excluded.extended_by,
        extended_at = now(),
        -- the deadline moved, so the Forfeit Review alert may fire again later
        review_alert_at = null,
        review_pushed_at = null,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object('status', 'extended', 'extendedMinutes', v_row.extended_minutes,
                            'assignedAt', v_row.assigned_at);
end;
$$;

revoke all on function public.match_extend_deadline(bigint, text, integer) from public, anon;
grant execute on function public.match_extend_deadline(bigint, text, integer) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 8. Forfeit Review sweep — one alert per assignment, only while still unstarted
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._match_review_sweep()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t        record;
  m        record;
  v_at     timestamptz;
  v_draw   int;
  v_ext    int;
  v_due    timestamptz;
  v_alerted timestamptz;
  v_label  text;
  v_n      int := 0;
  r        record;
  v_kicked boolean;
begin
  for t in
    select tt.id, tt.name, tt.live_settings,
           coalesce((tt.live_settings #>> '{checkIn,forfeitReviewAfterMinutes}')::int, 10) review_min,
           coalesce((tt.live_settings #>> '{bracket,drawNumber}')::int, 0) draw
    from public.tournaments tt
    where tt.live_state = 'in_progress'
      and not coalesce(tt.is_paused, false)
      and tt.tournament_format <> 'chip-tournament'
      and coalesce(tt.live_settings #>> '{checkIn,required}', 'false') = 'true'
      and jsonb_typeof(tt.live_settings -> 'matchState') = 'object'
  loop
    v_kicked := false;
    for m in
      select key match_id, value ms
      from jsonb_each(t.live_settings -> 'matchState')
      where jsonb_typeof(value) = 'object'
        -- still waiting: assigned, has a table, NOT started and not finished
        and jsonb_typeof(value -> 'assignedAt') = 'string'
        and jsonb_typeof(value -> 'tableId') = 'number'
        and coalesce(value ->> 'status', 'scheduled') = 'scheduled'
    loop
      v_at := (m.ms ->> 'assignedAt')::timestamptz;
      v_draw := t.draw;
      select coalesce(a.extended_minutes, 0), a.review_alert_at
      into v_ext, v_alerted
      from public.match_assignment_status a
      where a.tournament_id = t.id and a.match_id = m.match_id
        and a.assigned_at = v_at and a.draw_number = v_draw;
      v_ext := coalesce(v_ext, 0);
      v_due := v_at + make_interval(mins => greatest(t.review_min, 1) + v_ext);
      if v_alerted is not null or now() < v_due then
        continue;
      end if;

      -- Stamp FIRST (unique per assignment) so cron can never alert twice.
      insert into public.match_assignment_status (
        tournament_id, match_id, assigned_at, draw_number, review_alert_at)
      values (t.id, m.match_id, v_at, v_draw, now())
      on conflict (tournament_id, match_id, assigned_at, draw_number) do update
        set review_alert_at = now(), updated_at = now()
        where public.match_assignment_status.review_alert_at is null;
      if not found then
        continue;  -- another sweep won the race
      end if;

      select case when count(*) filter (where s.checked_in_at is not null) >= 2
                  then 'not started' else 'players not checked in' end
      into v_label
      from public.match_player_status s
      where s.tournament_id = t.id and s.match_id = m.match_id
        and s.assigned_at = v_at and s.draw_number = v_draw;

      -- In-app for the people running THIS event (same recipients + per-user dedupe as an issue).
      for r in select * from public._match_issue_recipients(t.id) loop
        insert into public.notifications (user_id, title, body, category, data, status, sent_at)
        values (
          r.id_auto,
          coalesce(t.name, 'Compete'),
          'Forfeit Review — ' || m.match_id || ' (' || coalesce(v_label, 'not started') || ')',
          'tournament_update',
          jsonb_build_object(
            'type', 'match_review', 'tournament_id', t.id, 'match_id', m.match_id,
            'assigned_at', v_at,
            'deep_link', '/(tabs)/admin/manage-tournament/' || t.id::text ||
                         '?reviewMatch=' || m.match_id),
          'sent', now());
      end loop;
      v_n := v_n + 1;
      v_kicked := true;
    end loop;

    -- One kick per tournament; the Edge Function pushes whatever is still unpushed.
    if v_kicked then
      perform public._match_review_kick(t.id);
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public._match_review_sweep() from public, anon, authenticated;

-- pg_net kick (same pattern as the Auto Assign kick: Vault-held URL + shared secret, never raises)
create or replace function public._match_review_kick(p_tournament_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url    text;
  v_secret text;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'elim_review_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'elim_auto_assign_secret';
  if v_url is null or v_secret is null then
    return;  -- not configured: the in-app alert still stands, only the push is skipped
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('tournament_id', p_tournament_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-auto-assign-secret', v_secret),
    timeout_milliseconds := 5000);
exception when others then
  raise warning 'match review kick failed for tournament %: %', p_tournament_id, sqlerrm;
end;
$$;

revoke all on function public._match_review_kick(bigint) from public, anon, authenticated;

-- The push function marks rows pushed through this service-role-only helper.
create or replace function public.match_review_pending(p_tournament_id bigint)
returns table (match_id text, assigned_at timestamptz, draw_number integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.match_id, a.assigned_at, a.draw_number
  from public.match_assignment_status a
  where a.tournament_id = p_tournament_id
    and a.review_alert_at is not null
    and a.review_pushed_at is null;
$$;

revoke all on function public.match_review_pending(bigint) from public, anon, authenticated;
grant execute on function public.match_review_pending(bigint) to service_role;

create or replace function public.match_review_mark_pushed(
  p_tournament_id bigint, p_match_id text, p_assigned_at timestamptz, p_draw_number integer)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.match_assignment_status
  set review_pushed_at = now(), updated_at = now()
  where tournament_id = p_tournament_id and match_id = p_match_id
    and assigned_at = p_assigned_at and draw_number = p_draw_number;
$$;

revoke all on function public.match_review_mark_pushed(bigint, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.match_review_mark_pushed(bigint, text, timestamptz, integer) to service_role;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'match-review-sweep';
select cron.schedule('match-review-sweep', '* * * * *', 'select public._match_review_sweep()');
