-- supabase/migrations/20260922120000_elim_live_apply.sql
--
-- Phase 3 — Elimination live-state write safety.
--
-- Problem: every TD/admin elimination action (assign / start / unassign / score / reorder /
-- mode) replaced the WHOLE tournaments.live_settings JSONB from a client-side snapshot, while
-- player scoring used the row-locked submit_match_state RPC. A TD write built from a stale
-- snapshot silently reverted concurrent player scores (last write wins). Separately,
-- submit_match_state let ANY active participant patch ANY unfinished match.
--
-- This migration adds (no table/column/data changes):
--   1. public._elim_resolve(jsonb)            internal: server-side bracket resolver (who is in
--                                             each match), a faithful port of the client's
--                                             src/utils/bracket.resolve.ts semantics.
--   2. public._elim_apply_one(...)            internal: validates + applies ONE typed op.
--   3. public.elim_live_apply(tid, ops, atomic)  TD/admin batch of typed ops, row-locked.
--   4. public.elim_merge_live_settings(...)   TD/admin top-level settings merge that can never
--                                             touch the scheduler-owned keys.
--   5. public.submit_match_state (hardened)   players may only score a match they are resolved
--                                             into; managers via can_manage_tournament.
--
-- Authority (all TD/admin paths): public.can_manage_tournament(tid) — admin role, assigned
-- director, ACTIVE venue owner, or ACTIVE venue director of the tournament venue. Chip is not
-- affected: the new functions refuse chip tournaments, and is_chip_manager is unchanged.
--
-- Locking: every writer takes SELECT ... FOR UPDATE on the tournaments row, reads the CURRENT
-- live_settings inside the transaction, changes only its own keys/match, and writes back. All
-- three writers therefore serialize and never lose each other's changes.
--
-- Stored shape is unchanged: matchState[matchId] keeps the existing MatchLiveState fields
-- (status, tableId, startedAt, completedAt, winner, p1Score, p2Score, timerSeconds, result),
-- queueOrder stays a string[], autoAssignMode a string.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 1. _elim_resolve — who is in every match, from bracket.graph + bracket.seeds + matchState
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Returns { "<matchId>": { "p1": regId|null, "p2": regId|null, "real": bool }, ... } where
-- real = both players known and the match is not a bye / empty / skipped reset (i.e. exactly
-- the matches a player can actually play). Mirrors resolveBracket():
--   seed      → seeds[idx].registrationId (null seed = empty)
--   winner(m) → skipped/empty: nobody; bye: the present player unless the bye was forfeited /
--               withdrawn; completed with winner 1|2: that slot's player; else undecided
--   loser(m)  → skipped/empty/bye: nobody; completed: the other slot's player, unless the
--               result was 'withdraw' (withdrawals never drop); else undecided
--   GF2 is skipped when GF is completed with winner = 1.
-- Iterative (repeated passes until nothing new resolves) so it does not depend on graph order
-- and cannot recurse exponentially. N ≤ 255 nodes.
create or replace function public._elim_resolve(p_ls jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_graph jsonb := coalesce(p_ls #> '{bracket,graph}', '[]'::jsonb);
  v_seeds jsonb := coalesce(p_ls #> '{bracket,seeds}', '[]'::jsonb);
  v_ms    jsonb := case when jsonb_typeof(p_ls -> 'matchState') = 'object'
                        then p_ls -> 'matchState' else '{}'::jsonb end;
  v_ids   text[];
  v_out   jsonb := '{}'::jsonb;   -- id -> {wd,wr,ld,lr}  (winner/loser decided + reg)
  v_res   jsonb := '{}'::jsonb;   -- id -> {p1,p2,real}
  v_node  jsonb;
  v_id    text;
  v_pass  int := 0;
  v_prog  boolean;
  v_ready boolean;
  -- per slot
  v_ref   jsonb;
  v_k     int;
  v_st    text[];
  v_reg   bigint[];
  v_src   text;
  v_so    jsonb;
  v_seed  jsonb;
  -- per node
  v_skipped boolean; v_pending boolean; v_empty boolean; v_bye boolean;
  v_present int; v_r jsonb; v_rc boolean; v_rw int; v_rres text;
  v_wd boolean; v_wr bigint; v_ld boolean; v_lr bigint; v_bye_reg bigint;
begin
  if jsonb_typeof(v_graph) <> 'array' then return '{}'::jsonb; end if;
  select coalesce(array_agg(n ->> 'id'), '{}') into v_ids from jsonb_array_elements(v_graph) n;

  loop
    v_pass := v_pass + 1;
    v_prog := false;
    for v_node in select value from jsonb_array_elements(v_graph) loop
      v_id := v_node ->> 'id';
      if v_id is null or v_out ? v_id then continue; end if;

      v_ready := true;
      v_st := array[null, null]::text[];
      v_reg := array[null, null]::bigint[];
      for v_k in 1..2 loop
        v_ref := v_node -> ('slot' || v_k);
        if v_ref ->> 'kind' = 'seed' then
          v_seed := v_seeds -> ((v_ref ->> 'seedIndex')::int);
          if jsonb_typeof(v_seed) = 'object' and (v_seed ->> 'registrationId') is not null then
            v_st[v_k] := 'player'; v_reg[v_k] := (v_seed ->> 'registrationId')::bigint;
          else
            v_st[v_k] := 'empty';
          end if;
        elsif v_ref ->> 'kind' in ('winner', 'loser') then
          v_src := v_ref ->> 'matchId';
          if v_src is null or not (v_src = any(v_ids)) then
            v_st[v_k] := 'empty';                         -- unknown feeder → nobody arrives
          elsif not (v_out ? v_src) then
            v_ready := false;                             -- feeder not resolved yet this pass
          else
            v_so := v_out -> v_src;
            if v_ref ->> 'kind' = 'winner' then
              if not (v_so ->> 'wd')::boolean then v_st[v_k] := 'pending';
              elsif v_so ->> 'wr' is null then v_st[v_k] := 'empty';
              else v_st[v_k] := 'player'; v_reg[v_k] := (v_so ->> 'wr')::bigint; end if;
            else
              if not (v_so ->> 'ld')::boolean then v_st[v_k] := 'pending';
              elsif v_so ->> 'lr' is null then v_st[v_k] := 'empty';
              else v_st[v_k] := 'player'; v_reg[v_k] := (v_so ->> 'lr')::bigint; end if;
            end if;
          end if;
        else
          v_st[v_k] := 'empty';                           -- {kind:"empty"} or malformed
        end if;
      end loop;
      if not v_ready then continue; end if;

      v_skipped := coalesce(
                     coalesce((v_node ->> 'conditional')::boolean, false) and v_id = 'GF2'
                     and (v_ms #>> '{GF,status}') = 'completed'
                     and (v_ms #>> '{GF,winner}') = '1',
                   false);
      v_present := (case when v_st[1] = 'player' then 1 else 0 end)
                 + (case when v_st[2] = 'player' then 1 else 0 end);
      v_pending := not v_skipped and (v_st[1] = 'pending' or v_st[2] = 'pending');
      v_empty   := not v_skipped and not v_pending and v_present = 0;
      v_bye     := not v_skipped and not v_pending and v_present = 1;
      v_bye_reg := case when v_st[1] = 'player' then v_reg[1] else v_reg[2] end;

      v_r    := v_ms -> v_id;
      v_rc   := coalesce((v_r ->> 'status') = 'completed', false);
      v_rw   := case when (v_r ->> 'winner') in ('1', '2') then (v_r ->> 'winner')::int end;
      v_rres := v_r ->> 'result';

      -- winner flow
      if v_skipped or v_empty then v_wd := true; v_wr := null;
      elsif v_bye then
        v_wd := true;
        v_wr := case when v_rc and v_rres in ('forfeit', 'withdraw') then null else v_bye_reg end;
      elsif v_pending then v_wd := false; v_wr := null;
      elsif v_rc and v_rw is not null then v_wd := true; v_wr := v_reg[v_rw];
      else v_wd := false; v_wr := null;
      end if;
      -- loser flow
      if v_skipped or v_empty or v_bye then v_ld := true; v_lr := null;
      elsif v_pending then v_ld := false; v_lr := null;
      elsif v_rc and v_rw is not null then
        v_ld := true;
        v_lr := case when v_rres = 'withdraw' then null else v_reg[3 - v_rw] end;
      else v_ld := false; v_lr := null;
      end if;

      v_out := v_out || jsonb_build_object(v_id,
        jsonb_build_object('wd', v_wd, 'wr', v_wr, 'ld', v_ld, 'lr', v_lr));
      v_res := v_res || jsonb_build_object(v_id, jsonb_build_object(
        'p1', v_reg[1], 'p2', v_reg[2],
        'real', not v_skipped and not v_pending and v_present = 2));
      v_prog := true;
    end loop;
    exit when not v_prog or v_pass > 300;
  end loop;
  return v_res;
end;
$$;

revoke all on function public._elim_resolve(jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. _elim_apply_one — validate + apply ONE op to a matchState map (pure except table lookup)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Returns { "ms": <new matchState>, "top": {queueOrder?, autoAssignMode?}, "started": bool }.
-- Any rejection is RAISE ... USING ERRCODE 'P0001' with a machine-readable reason as the
-- message (e.g. 'table_occupied'); the caller reports it per op. Nothing is mutated here:
-- the caller only adopts the returned map when the op succeeded.
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
  v_allowed constant text[] := array['status', 'winner', 'p1Score', 'p2Score', 'startedAt',
                                     'completedAt', 'result', 'timerSeconds', 'tableId'];
begin
  if jsonb_typeof(p_op) <> 'object' or v_kind is null then
    raise exception 'invalid_op' using errcode = 'P0001';
  end if;

  -- ── set_queue: only queueOrder / autoAssignMode ─────────────────────────────────────
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
    if p_op ? 'start' and jsonb_typeof(p_op -> 'start') <> 'boolean' then
      raise exception 'invalid_value' using errcode = 'P0001';
    end if;
    v_start := coalesce((p_op ->> 'start')::boolean, false);
    perform public._elim_check_table(p_tournament_id, p_ms, v_mid, v_tid);
    v_new := v_cur || jsonb_build_object(
      'tableId', v_tid,
      'status', case when v_start then 'in_progress' else 'scheduled' end,
      'startedAt', case when v_start then to_jsonb(v_now) else 'null'::jsonb end);
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
    v_new := v_cur || jsonb_build_object('tableId', null, 'status', 'scheduled', 'startedAt', null);

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
    -- A genuine FIRST start (not a reopen/correction of a match that already has a start
    -- time) is stamped with server time, never the TD device clock.
    if v_nstat = 'in_progress' and v_status <> 'in_progress'
       and jsonb_typeof(v_cur -> 'startedAt') is distinct from 'string' then
      v_new := v_new || jsonb_build_object('startedAt', v_now);
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

-- Table rule shared by assign + patch_match(tableId): the table belongs to this tournament,
-- is not marked unavailable, and no OTHER unfinished match currently holds it.
create or replace function public._elim_check_table(
  p_tournament_id bigint,
  p_ms jsonb,
  p_match_id text,
  p_table_id bigint
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select tt.status into v_status
  from public.tournament_tables tt
  where tt.id = p_table_id and tt.tournament_id = p_tournament_id;
  if not found then
    raise exception 'table_not_found' using errcode = 'P0001';
  end if;
  if v_status = 'unavailable' then
    raise exception 'table_unavailable' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_each(p_ms) e
    where e.key <> p_match_id
      and jsonb_typeof(e.value) = 'object'
      and (e.value ->> 'tableId') = p_table_id::text
      and coalesce(e.value ->> 'status', 'scheduled') <> 'completed'
  ) then
    raise exception 'table_occupied' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public._elim_check_table(bigint, jsonb, text, bigint) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. elim_live_apply — the TD/admin write path for elimination live state
-- ════════════════════════════════════════════════════════════════════════════════════════
-- p_ops: array (1..64) of
--   {"op":"assign","matchId":"W2M1","tableId":7,"start":false}
--   {"op":"start","matchId":"W2M1"}
--   {"op":"unassign","matchId":"W2M1"}
--   {"op":"patch_match","matchId":"W2M1","set":{ <whitelisted MatchLiveState fields> }}
--   {"op":"set_queue","queueOrder":["W2M1",...],"autoAssignMode":"manual"}
-- p_atomic = false (default, best-effort): each op succeeds or fails on its own; a failed op
--   changes nothing. p_atomic = true: the first failure aborts the whole call (nothing saved).
-- Returns {"live_settings": ..., "live_state": ..., "results": [{"i":0,"ok":true} |
--          {"i":1,"ok":false,"error":"table_occupied"}]}.
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

comment on function public.elim_live_apply(bigint, jsonb, boolean) is
  'Phase 3: TD/admin elimination live-state ops (assign/start/unassign/patch_match/set_queue), row-locked, validated, best-effort or atomic. Authority: can_manage_tournament.';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. elim_merge_live_settings — Settings / Prize Pool saves without clobbering live play
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Merges TOP-LEVEL keys into live_settings (and removes p_remove keys) under the row lock.
-- The scheduler/draw-owned keys can never be set or removed here: they are only written by
-- elim_live_apply / submit_match_state (and the setup-time draw). Refuses chip tournaments so
-- the chip Settings path is unchanged. Manager-only (same authority as a direct UPDATE today).
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
  v_owned constant text[] := array['matchState', 'queueOrder', 'autoAssignMode', 'bracket', 'drawLog'];
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
-- 5. submit_match_state — hardened (same signature, same whitelist, same return)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Managers (can_manage_tournament) may patch any match (unchanged capability; previously only
-- the assigned director). A PLAYER may only patch a match that the server-side resolver places
-- them in (one of their active tournament_players registration ids is p1 or p2), the match
-- must be real (both players known — not a bye/empty/pending/skipped match), and it must not
-- already be final. Values are type-checked. The row lock is taken BEFORE authorizing so the
-- resolved players are computed from the committed state being modified.
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
  v_ls := jsonb_set(v_ls, array['matchState', p_match_id], v_existing || v_clean, true);

  update public.tournaments
  set live_settings = v_ls,
      updated_at = now()
  where id = p_tournament_id;

  return v_ls;
end;
$$;

-- Grants unchanged from 20260607120000 (re-stated for clarity; CREATE OR REPLACE keeps them).
revoke all on function public.submit_match_state(bigint, text, jsonb) from public, anon;
grant execute on function public.submit_match_state(bigint, text, jsonb) to authenticated;
