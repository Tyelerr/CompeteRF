-- supabase/rollback/20261018120000_elim_recovery_foundation_rollback.sql
-- Rolls back 20261018120000_elim_recovery_foundation.sql to the exact pre-migration behavior:
--   * removes the revision trigger and the new helper functions;
--   * restores elim_live_apply(bigint, jsonb, boolean) VERBATIM from 20261017120000 (guards);
--   * KEEPS the additive data (tournaments.live_revision, tournament_audit, elim_checkpoints) so no
--     history is lost — they are inert once the functions/trigger are gone. Uncomment the final
--     block only if you also want them removed.
-- Installed apps keep working throughout (they only ever call the 3-argument form).

begin;

drop trigger if exists tournaments_live_revision on public.tournaments;
drop function if exists public.tg_tournaments_live_revision();
drop function if exists public.elim_live_apply(bigint, jsonb, boolean, bigint, uuid, boolean);
drop function if exists public._elim_public_events(bigint, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, text);
drop function if exists public._elim_cascade(jsonb, jsonb, jsonb);
drop function if exists public._elim_has_progress(jsonb);
drop function if exists public._elim_op_label(text, jsonb, jsonb);
drop function if exists public._elim_checkpoint(bigint, bigint, text, text, text, boolean, jsonb, boolean);
drop function if exists public._elim_state_slice(jsonb, boolean);

-- Restored verbatim from supabase/migrations/20261017120000_elim_server_guards.sql
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
  v_done    boolean;
  v_res     jsonb := null;    -- server resolver output, lazily (re)computed
  v_kind    text;
  v_mid     text;
  v_nst     text;
  v_who     jsonb;
  v_needs_real boolean;
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
  -- A finished event is no longer operated live: assign / start / unassign / queue changes and
  -- reopening or resetting a match are refused. Correcting a recorded RESULT (winner / score /
  -- result on a match that stays completed) remains allowed so a TD can fix a final score.
  v_done := coalesce(v_row.status, '') in ('completed', 'archived') or v_row.live_state = 'finished';
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
      v_kind := v_op ->> 'op';
      v_mid := v_op ->> 'matchId';
      v_nst := case when v_kind = 'patch_match' then v_op -> 'set' ->> 'status' end;
      if v_done and not (
           v_kind = 'patch_match'
           and coalesce(v_nst, coalesce(v_ms -> v_mid ->> 'status', 'scheduled')) = 'completed'
           and coalesce(v_ms -> v_mid ->> 'status', 'scheduled') = 'completed'
           and not (v_op -> 'set' ? 'tableId' and jsonb_typeof(v_op -> 'set' -> 'tableId') = 'number')
         ) then
        raise exception 'tournament_finished' using errcode = 'P0001';
      end if;
      -- The server, not the client, guarantees a match is playable: both players known (not a
      -- bye / empty / pending / skipped reset) before it is assigned, started, put in progress,
      -- or given a winner; and neither player is already live in another match when it starts.
      -- Forfeit / withdraw without a winner (e.g. forfeiting a bye) and resets stay allowed.
      v_needs_real := v_kind in ('assign', 'start')
        or (v_kind = 'patch_match' and (v_nst = 'in_progress'
            or (jsonb_typeof(v_op -> 'set' -> 'winner') = 'number')
            or (jsonb_typeof(v_op -> 'set' -> 'tableId') = 'number')));
      if v_needs_real and v_mid is not null then
        if v_res is null then
          v_res := public._elim_resolve(v_ls || jsonb_build_object('matchState', v_ms));
        end if;
        v_who := v_res -> v_mid;
        if v_who is not null and not coalesce((v_who ->> 'real')::boolean, false) then
          raise exception 'match_not_ready' using errcode = 'P0001';
        end if;
        if v_who is not null
           and coalesce(v_ms -> v_mid ->> 'status', 'scheduled') = 'scheduled'  -- a not-yet-started match
           and (v_kind = 'start' or (v_kind = 'assign' and coalesce((v_op ->> 'start')::boolean, false))
                or v_nst = 'in_progress')
           and exists (
             select 1 from jsonb_each(v_ms) e
             where e.key <> v_mid
               and jsonb_typeof(e.value) = 'object'
               and (e.value ->> 'status') = 'in_progress'
               and (v_res -> e.key ->> 'p1' in (v_who ->> 'p1', v_who ->> 'p2')
                    or v_res -> e.key ->> 'p2' in (v_who ->> 'p1', v_who ->> 'p2'))
           ) then
          raise exception 'player_busy' using errcode = 'P0001';
        end if;
      end if;
      v_step := public._elim_apply_one(p_tournament_id, v_ids, v_ms, v_op);
      -- A result / reset can change who is in later matches: recompute lazily next time.
      if v_kind = 'patch_match' and (v_op -> 'set' ?| array['status', 'winner', 'result']) then
        v_res := null;
      end if;
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

-- Optional (data removal — NOT needed to restore behavior):
-- drop table if exists public.elim_checkpoints;
-- drop table if exists public.tournament_audit;
-- alter table public.tournaments drop column if exists live_revision;

notify pgrst, 'reload schema';

commit;
