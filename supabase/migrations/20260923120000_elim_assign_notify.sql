-- supabase/migrations/20260923120000_elim_assign_notify.sql
--
-- Scheduler phase 4 — Auto Assign enable flag, Play Next (preferredTableId), assignment
-- timestamps, and assignment-notification dedupe. Builds on 20260922120000_elim_live_apply.
--
-- Changes (functions are replaced with the SAME signatures; grants are re-stated):
--   1. _elim_apply_one
--      • assign: optional "ifUnassigned": true → refuse ('match_assigned') when the match is
--        already on a table (Auto Assign uses it, so two TD devices can't move each other's
--        assignments). Stamps assignedAt (server time) when the table actually changes; a
--        no-op re-assign to the same table keeps the original assignedAt. Clears
--        preferredTableId (the preference is fulfilled once the match has a table).
--      • unassign: also clears assignedAt.
--      • patch_match: whitelist adds preferredTableId (Play Next). assignedAt is NOT
--        client-settable; it is stamped/cleared server-side when tableId changes. Completing a
--        match clears preferredTableId.
--      • set_queue: accepts autoAssignEnabled (boolean) and queuePins (TD relative overrides
--        that coexist with an automatic mode: [{matchId, place: before|after|top|bottom,
--        anchorId?}], ≤ 32, unique matchId, ids from this bracket; applied client-side over the
--        mode's order within a tier and never across feeders — see src/utils/queue-pins.ts).
--   2. elim_merge_live_settings: autoAssignEnabled and queuePins join the scheduler-owned keys
--      (they can only change through set_queue).
--   3. submit_match_state: identical authorization/whitelist; a player completing their match
--      also clears that match's preferredTableId.
--   4. match_assignment_notifications: dedupe/log table for the notify-match-assigned Edge
--      Function (service role only; RLS on, no policies, no client grants).
--
-- No existing data is modified. New keys (assignedAt, preferredTableId, autoAssignEnabled,
-- queuePins) are additive and optional; clients that don't know them ignore them.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 1. _elim_apply_one
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._elim_apply_one(
  p_tournament_id bigint,
  p_ids text[],
  p_ms jsonb,
  p_op jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind   text := p_op ->> 'op';
  v_mid    text;
  v_cur    jsonb;
  v_status text;
  v_new    jsonb;
  v_set    jsonb;
  v_key    text;
  v_val    jsonb;
  v_tid    bigint;
  v_start  boolean;
  v_top    jsonb := '{}'::jsonb;
  v_now    text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_nstat  text;
  v_started boolean := false;
  v_tstat  text;
  v_allowed constant text[] := array['status', 'winner', 'p1Score', 'p2Score', 'startedAt',
                                     'completedAt', 'result', 'timerSeconds', 'tableId',
                                     'preferredTableId'];
begin
  if jsonb_typeof(p_op) <> 'object' or v_kind is null then
    raise exception 'invalid_op' using errcode = 'P0001';
  end if;

  -- ── set_queue: only queueOrder / autoAssignMode / autoAssignEnabled / queuePins ─────
  if v_kind = 'set_queue' then
    if p_op ? 'queueOrder' then
      if jsonb_typeof(p_op -> 'queueOrder') <> 'array'
         or jsonb_array_length(p_op -> 'queueOrder') > 512 then
        raise exception 'invalid_queue_order' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_op -> 'queueOrder') e
        where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any(p_ids))
      ) then
        raise exception 'unknown_match' using errcode = 'P0001';
      end if;
      v_top := v_top || jsonb_build_object('queueOrder', p_op -> 'queueOrder');
    end if;
    if p_op ? 'autoAssignMode' then
      if jsonb_typeof(p_op -> 'autoAssignMode') <> 'string'
         or (p_op ->> 'autoAssignMode') not in
            ('balanced', 'winnersFirst', 'losersFirst', 'longestWait', 'manual') then
        raise exception 'invalid_mode' using errcode = 'P0001';
      end if;
      v_top := v_top || jsonb_build_object('autoAssignMode', p_op -> 'autoAssignMode');
    end if;
    if p_op ? 'autoAssignEnabled' then
      if jsonb_typeof(p_op -> 'autoAssignEnabled') <> 'boolean' then
        raise exception 'invalid_value' using errcode = 'P0001';
      end if;
      v_top := v_top || jsonb_build_object('autoAssignEnabled', p_op -> 'autoAssignEnabled');
    end if;
    if p_op ? 'queuePins' then
      -- Shape only (the client resolves pins against the live schedule deterministically and
      -- ignores any that became stale): an array of ≤ 32 objects with exactly the allowed keys,
      -- ids from this bracket, a legal place, an anchor for before/after (≠ itself) and none for
      -- top/bottom, and at most one pin per match.
      if jsonb_typeof(p_op -> 'queuePins') <> 'array'
         or jsonb_array_length(p_op -> 'queuePins') > 32 then
        raise exception 'invalid_queue_pins' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_op -> 'queuePins') e
        where jsonb_typeof(e) <> 'object'
           or exists (select 1 from jsonb_object_keys(e) k where k not in ('matchId', 'place', 'anchorId'))
           or coalesce(jsonb_typeof(e -> 'matchId'), '') <> 'string'
           or not coalesce((e ->> 'matchId') = any(p_ids), false)
           or coalesce(e ->> 'place', '') not in ('before', 'after', 'top', 'bottom')
           or ((e ->> 'place') in ('before', 'after') and (
                 coalesce(jsonb_typeof(e -> 'anchorId'), '') <> 'string'
                 or not coalesce((e ->> 'anchorId') = any(p_ids), false)
                 or (e ->> 'anchorId') = (e ->> 'matchId')))
           or ((e ->> 'place') in ('top', 'bottom') and e ? 'anchorId')
      ) or (
        select count(distinct e ->> 'matchId') from jsonb_array_elements(p_op -> 'queuePins') e
      ) <> jsonb_array_length(p_op -> 'queuePins') then
        raise exception 'invalid_queue_pins' using errcode = 'P0001';
      end if;
      v_top := v_top || jsonb_build_object('queuePins', p_op -> 'queuePins');
    end if;
    if v_top = '{}'::jsonb then
      raise exception 'empty_op' using errcode = 'P0001';
    end if;
    return jsonb_build_object('ms', p_ms, 'top', v_top, 'started', false);
  end if;

  -- ── match ops: matchId must be a node of this bracket ────────────────────────────────
  if v_kind not in ('assign', 'start', 'unassign', 'patch_match') then
    raise exception 'invalid_op' using errcode = 'P0001';
  end if;
  v_mid := p_op ->> 'matchId';
  if v_mid is null or jsonb_typeof(p_op -> 'matchId') <> 'string' or not (v_mid = any(p_ids)) then
    raise exception 'unknown_match' using errcode = 'P0001';
  end if;
  v_cur := case when jsonb_typeof(p_ms -> v_mid) = 'object' then p_ms -> v_mid else '{}'::jsonb end;
  v_status := coalesce(v_cur ->> 'status', 'scheduled');

  if v_kind = 'assign' then
    if v_status in ('in_progress', 'completed') then
      raise exception 'match_%', v_status using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_op -> 'tableId') <> 'number' or (p_op ->> 'tableId') !~ '^[0-9]{1,18}$' then
      raise exception 'invalid_table' using errcode = 'P0001';
    end if;
    v_tid := (p_op ->> 'tableId')::bigint;
    if (p_op ? 'start' and jsonb_typeof(p_op -> 'start') <> 'boolean')
       or (p_op ? 'ifUnassigned' and jsonb_typeof(p_op -> 'ifUnassigned') <> 'boolean') then
      raise exception 'invalid_value' using errcode = 'P0001';
    end if;
    -- Auto Assign: never move a match that already has a table (another device got there).
    if coalesce((p_op ->> 'ifUnassigned')::boolean, false)
       and jsonb_typeof(v_cur -> 'tableId') = 'number' then
      raise exception 'match_assigned' using errcode = 'P0001';
    end if;
    v_start := coalesce((p_op ->> 'start')::boolean, false);
    perform public._elim_check_table(p_tournament_id, p_ms, v_mid, v_tid);
    v_new := (v_cur - 'preferredTableId') || jsonb_build_object(
      'tableId', v_tid,
      'status', case when v_start then 'in_progress' else 'scheduled' end,
      'startedAt', case when v_start then to_jsonb(v_now) else 'null'::jsonb end,
      -- a new assignment (or a table change) gets a new assignedAt; re-assigning the same
      -- table keeps the original, so it is not a new notification event
      'assignedAt', case when (v_cur ->> 'tableId') = v_tid::text and jsonb_typeof(v_cur -> 'assignedAt') = 'string'
                         then v_cur -> 'assignedAt' else to_jsonb(v_now) end);
    v_started := v_start;

  elsif v_kind = 'start' then
    if v_status <> 'scheduled' then
      raise exception 'match_%', v_status using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_cur -> 'tableId') is distinct from 'number' then
      raise exception 'no_table' using errcode = 'P0001';
    end if;
    v_new := v_cur || jsonb_build_object('status', 'in_progress', 'startedAt', v_now);
    v_started := true;

  elsif v_kind = 'unassign' then
    if v_status = 'completed' then
      raise exception 'match_completed' using errcode = 'P0001';
    end if;
    v_new := v_cur || jsonb_build_object('tableId', null, 'status', 'scheduled', 'startedAt', null,
                                         'assignedAt', null);

  elsif v_kind = 'patch_match' then
    v_set := p_op -> 'set';
    if jsonb_typeof(v_set) <> 'object' or v_set = '{}'::jsonb then
      raise exception 'invalid_op' using errcode = 'P0001';
    end if;
    for v_key, v_val in select key, value from jsonb_each(v_set) loop
      if not (v_key = any(v_allowed)) then
        raise exception 'invalid_field' using errcode = 'P0001';
      end if;
      if v_key = 'status' then
        if jsonb_typeof(v_val) <> 'string'
           or (v_val #>> '{}') not in ('scheduled', 'in_progress', 'completed') then
          raise exception 'invalid_value' using errcode = 'P0001';
        end if;
      elsif v_key = 'winner' then
        if not (jsonb_typeof(v_val) = 'null' or v_val in ('1'::jsonb, '2'::jsonb)) then
          raise exception 'invalid_value' using errcode = 'P0001';
        end if;
      elsif v_key in ('p1Score', 'p2Score', 'timerSeconds') then
        if jsonb_typeof(v_val) <> 'null' and not (
             jsonb_typeof(v_val) = 'number'
             and (v_val #>> '{}') ~ '^[0-9]+$'
             and (v_val #>> '{}')::numeric <= case when v_key = 'timerSeconds' then 86400 else 999 end
           ) then
          raise exception 'invalid_value' using errcode = 'P0001';
        end if;
      elsif v_key in ('startedAt', 'completedAt') then
        if jsonb_typeof(v_val) <> 'null' then
          if jsonb_typeof(v_val) <> 'string' then
            raise exception 'invalid_value' using errcode = 'P0001';
          end if;
          begin
            perform (v_val #>> '{}')::timestamptz;
          exception when others then
            raise exception 'invalid_value' using errcode = 'P0001';
          end;
        end if;
      elsif v_key = 'result' then
        if not (jsonb_typeof(v_val) = 'null' or (jsonb_typeof(v_val) = 'string'
                and (v_val #>> '{}') in ('normal', 'forfeit', 'withdraw'))) then
          raise exception 'invalid_value' using errcode = 'P0001';
        end if;
      elsif v_key = 'tableId' then
        if jsonb_typeof(v_val) = 'number' and (v_val #>> '{}') ~ '^[0-9]{1,18}$' then
          perform public._elim_check_table(p_tournament_id, p_ms, v_mid, (v_val #>> '{}')::bigint);
        elsif jsonb_typeof(v_val) <> 'null' then
          raise exception 'invalid_table' using errcode = 'P0001';
        end if;
      elsif v_key = 'preferredTableId' then
        -- Play Next: a SOFT preference for a table (usually one that is busy right now). It
        -- must be one of this tournament's tables and not marked unavailable; it does NOT
        -- occupy the table (no occupancy check) and is only meaningful while the match has
        -- no table yet.
        if jsonb_typeof(v_val) = 'number' and (v_val #>> '{}') ~ '^[0-9]{1,18}$' then
          select tt.status into v_tstat
          from public.tournament_tables tt
          where tt.id = (v_val #>> '{}')::bigint and tt.tournament_id = p_tournament_id;
          if not found then
            raise exception 'table_not_found' using errcode = 'P0001';
          end if;
          if v_tstat = 'unavailable' then
            raise exception 'table_unavailable' using errcode = 'P0001';
          end if;
        elsif jsonb_typeof(v_val) <> 'null' then
          raise exception 'invalid_table' using errcode = 'P0001';
        end if;
      end if;
    end loop;

    v_new := v_cur || v_set;
    v_nstat := coalesce(v_new ->> 'status', 'scheduled');
    v_new := v_new || jsonb_build_object('status', v_nstat);  -- same default as setMatchState
    -- A completed match with no winner is only legal as a forfeit/withdrawal (nobody advances).
    if v_nstat = 'completed' and jsonb_typeof(v_new -> 'winner') is distinct from 'number'
       and coalesce(v_new ->> 'result', '') not in ('forfeit', 'withdraw') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    -- Play Next only while the match has no table.
    if jsonb_typeof(v_set -> 'preferredTableId') = 'number'
       and jsonb_typeof(v_new -> 'tableId') = 'number' then
      raise exception 'match_assigned' using errcode = 'P0001';
    end if;
    -- A genuine FIRST start (not a reopen/correction of a match that already has a start
    -- time) is stamped with server time, never the TD device clock.
    if v_nstat = 'in_progress' and v_status <> 'in_progress'
       and jsonb_typeof(v_cur -> 'startedAt') is distinct from 'string' then
      v_new := v_new || jsonb_build_object('startedAt', v_now);
    end if;
    -- assignedAt is server-owned: stamped when the table changes, cleared when removed.
    if v_set ? 'tableId' then
      if jsonb_typeof(v_new -> 'tableId') = 'number' then
        if (v_cur ->> 'tableId') is distinct from (v_new ->> 'tableId') then
          v_new := (v_new - 'preferredTableId') || jsonb_build_object('assignedAt', v_now);
        end if;
      else
        v_new := v_new || jsonb_build_object('assignedAt', null);
      end if;
    end if;
    if v_nstat = 'completed' then
      v_new := v_new - 'preferredTableId';
    end if;
    v_started := v_nstat = 'in_progress' and v_status <> 'in_progress';

  else
    raise exception 'invalid_op' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ms', p_ms || jsonb_build_object(v_mid, v_new),
    'top', '{}'::jsonb,
    'started', v_started);
end;
$$;

revoke all on function public._elim_apply_one(bigint, text[], jsonb, jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. elim_merge_live_settings — autoAssignEnabled + queuePins become scheduler-owned
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.elim_merge_live_settings(
  p_tournament_id bigint,
  p_set jsonb,
  p_remove text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_ls  jsonb;
  v_owned constant text[] := array['matchState', 'queueOrder', 'autoAssignMode', 'autoAssignEnabled',
                                   'queuePins', 'bracket', 'drawLog'];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_tournament_id is null or not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not allowed to manage this tournament' using errcode = '42501';
  end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'p_set must be an object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_set) k where k = any(v_owned))
     or coalesce(p_remove, '{}') && v_owned then
    raise exception 'Scheduler-owned live_settings keys cannot be changed here' using errcode = '42501';
  end if;

  select t.live_settings, t.tournament_format into v_row
  from public.tournaments t
  where t.id = p_tournament_id
  for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_row.tournament_format = 'chip-tournament' then
    raise exception 'Not an elimination tournament' using errcode = '22023';
  end if;

  v_ls := (coalesce(v_row.live_settings, '{}'::jsonb) - coalesce(p_remove, '{}')) || p_set;
  update public.tournaments
  set live_settings = v_ls, updated_at = now()
  where id = p_tournament_id;
  return v_ls;
end;
$$;

revoke all on function public.elim_merge_live_settings(bigint, jsonb, text[]) from public, anon;
grant execute on function public.elim_merge_live_settings(bigint, jsonb, text[]) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. submit_match_state — unchanged authorization; completing clears preferredTableId
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.submit_match_state(p_tournament_id bigint, p_match_id text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      bigint;
  v_player   uuid;
  v_is_mgr   boolean;
  v_ls       jsonb;
  v_existing jsonb;
  v_clean    jsonb;
  v_merged   jsonb;
  v_who      jsonb;
  v_key      text;
  v_val      jsonb;
begin
  -- 1. Resolve the caller's profile id_auto (legacy) and player id (new) from auth uid.
  select p.id_auto into v_uid
  from public.profiles p
  where p.id = auth.uid();
  v_player := public.current_player_id();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  v_is_mgr := public.can_manage_tournament(p_tournament_id);

  -- 2. Whitelist the patch to scoring fields only (unchanged list) and type-check values.
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid patch' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_clean
  from jsonb_each(p_patch)
  where key in ('status', 'winner', 'p1Score', 'p2Score', 'startedAt', 'completedAt', 'result');

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

  -- 3. Lock the row, then read the committed state being modified.
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

  -- 4. Authorize.
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
    -- 4a. A final match is locked for players; only a manager may change it.
    if (v_existing ->> 'status') = 'completed' then
      raise exception 'Match is final and locked' using errcode = '42501';
    end if;
  end if;

  -- 5. Merge the patch into matchState -> <match_id> only.
  v_merged := v_existing || v_clean;
  if (v_merged ->> 'status') = 'completed' then
    v_merged := v_merged - 'preferredTableId';  -- Play Next is moot once the match is final
  end if;
  v_ls := jsonb_set(v_ls, array['matchState', p_match_id], v_merged, true);

  update public.tournaments
  set live_settings = v_ls,
      updated_at = now()
  where id = p_tournament_id;

  return v_ls;
end;
$$;

revoke all on function public.submit_match_state(bigint, text, jsonb) from public, anon;
grant execute on function public.submit_match_state(bigint, text, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. match_assignment_notifications — dedupe + audit for notify-match-assigned
-- ════════════════════════════════════════════════════════════════════════════════════════
-- One row per (tournament, match, recipient, draw, assignedAt): the Edge Function INSERTs
-- ... ON CONFLICT DO NOTHING before sending, and only sends when its insert won. A replayed
-- or duplicate call for the same assignment instance therefore sends nothing. A re-assignment
-- (new assignedAt) is a new event; if the recipient was already notified for a DIFFERENT
-- table in this draw it is sent as "table_changed".
create table if not exists public.match_assignment_notifications (
  id bigint generated always as identity primary key,
  tournament_id integer not null references public.tournaments(id) on delete cascade,
  match_id text not null check (match_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  recipient_id_auto integer not null,
  draw_number integer not null default 0,
  assigned_at timestamptz not null,
  table_id bigint not null,
  kind text not null check (kind in ('assigned', 'table_changed')),
  notification_id integer,              -- public.notifications row (in-app), when created
  push_attempted integer not null default 0,
  push_sent integer not null default 0,
  created_at timestamptz not null default now(),
  constraint match_assignment_notifications_dedupe
    unique (tournament_id, match_id, recipient_id_auto, draw_number, assigned_at)
);

create index if not exists match_assignment_notifications_lookup
  on public.match_assignment_notifications (tournament_id, match_id, recipient_id_auto, draw_number, created_at desc);

-- Service role only: RLS on with NO policies, and no table privileges for client roles.
alter table public.match_assignment_notifications enable row level security;
revoke all on table public.match_assignment_notifications from public, anon, authenticated;
revoke all on sequence public.match_assignment_notifications_id_seq from public, anon, authenticated;

comment on table public.match_assignment_notifications is
  'Dedupe/audit log for notify-match-assigned (in-app + push on table assignment). Service role only.';
