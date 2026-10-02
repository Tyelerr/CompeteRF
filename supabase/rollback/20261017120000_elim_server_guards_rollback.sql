-- supabase/rollback/20261017120000_elim_server_guards_rollback.sql
-- Restores the exact pre-guard definitions (prod md5-verified 2026-10-02): _elim_apply_one from
-- 20260926120000_elim_clear_table.sql and elim_live_apply from 20260922120000_elim_live_apply.sql.
-- Safe at any time: the guards add no columns/data; ops carrying "expect" are simply ignored again.

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
    v_new := (v_cur - 'preferredTableId' - 'clearedAt') || jsonb_build_object(
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
    -- "Clear Table": the match goes back to the Ready queue and is stamped so server-side Auto
    -- Assign leaves it alone briefly (src/utils/clear-table.ts) instead of instantly re-taking it.
    v_new := v_cur || jsonb_build_object('tableId', null, 'status', 'scheduled', 'startedAt', null,
                                         'assignedAt', null, 'clearedAt', v_now);

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
        v_new := v_new - 'clearedAt';
      else
        v_new := v_new || jsonb_build_object('assignedAt', null);
        -- a patch that TAKES the table away (Reset Match) gets the same brief Auto Assign hold
        if jsonb_typeof(v_cur -> 'tableId') = 'number' then
          v_new := v_new || jsonb_build_object('clearedAt', v_now);
        end if;
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

create or replace function public.elim_live_apply(
  p_tournament_id bigint,
  p_ops jsonb,
  p_atomic boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     record;
  v_ls      jsonb;
  v_ms      jsonb;
  v_ids     text[];
  v_op      jsonb;
  v_step    jsonb;
  v_results jsonb := '[]'::jsonb;
  v_i       int := 0;
  v_ok      int := 0;
  v_started boolean := false;
  v_state   text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_tournament_id is null or not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not allowed to manage this tournament' using errcode = '42501';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array'
     or jsonb_array_length(p_ops) < 1 or jsonb_array_length(p_ops) > 64 then
    raise exception 'ops must be an array of 1..64 operations' using errcode = '22023';
  end if;

  select t.live_settings, t.live_state, t.status, t.tournament_format
  into v_row
  from public.tournaments t
  where t.id = p_tournament_id
  for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_row.tournament_format = 'chip-tournament' then
    raise exception 'Not an elimination tournament' using errcode = '22023';
  end if;
  v_ls := coalesce(v_row.live_settings, '{}'::jsonb);
  if jsonb_typeof(v_ls #> '{bracket,graph}') is distinct from 'array' then
    raise exception 'No elimination bracket' using errcode = '22023';
  end if;
  select coalesce(array_agg(n ->> 'id'), '{}') into v_ids
  from jsonb_array_elements(v_ls #> '{bracket,graph}') n;
  v_ms := case when jsonb_typeof(v_ls -> 'matchState') = 'object'
               then v_ls -> 'matchState' else '{}'::jsonb end;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    begin
      v_step := public._elim_apply_one(p_tournament_id, v_ids, v_ms, v_op);
      -- Adopt the result only on success: a failed op never partially mutates anything.
      v_ms := v_step -> 'ms';
      v_ls := v_ls || (v_step -> 'top');
      v_started := v_started or coalesce((v_step ->> 'started')::boolean, false);
      v_ok := v_ok + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('i', v_i, 'ok', true));
    exception when sqlstate 'P0001' then
      if p_atomic then
        raise;  -- all-or-nothing: abort the whole call, nothing is written
      end if;
      v_results := v_results || jsonb_build_array(
        jsonb_build_object('i', v_i, 'ok', false, 'error', sqlerrm));
    end;
    v_i := v_i + 1;
  end loop;

  v_state := v_row.live_state;
  if v_ok > 0 then
    v_ls := jsonb_set(v_ls, '{matchState}', v_ms, true);
    -- First real start moves the tournament to Running (same rule as the old setMatchState).
    if v_started
       and coalesce(v_row.live_state, '') not in ('in_progress', 'finished')
       and coalesce(v_row.status, '') not in ('completed', 'archived') then
      v_state := 'in_progress';
    end if;
    update public.tournaments
    set live_settings = v_ls,
        live_state = v_state,
        updated_at = now()
    where id = p_tournament_id;
  end if;

  return jsonb_build_object('live_settings', v_ls, 'live_state', v_state, 'results', v_results);
end;
$$;

revoke all on function public.elim_live_apply(bigint, jsonb, boolean) from public, anon;
grant execute on function public.elim_live_apply(bigint, jsonb, boolean) to authenticated;
