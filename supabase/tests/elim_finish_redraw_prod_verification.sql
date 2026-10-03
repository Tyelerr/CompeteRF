-- supabase/tests/elim_finish_redraw_prod_verification.sql
-- ROLLBACK-ONLY production check for 20261021130000_elim_finish_redraw_recovery, as the review TD
-- (id_auto 256) on the hidden review events 2847 (single) and 2848 (double). Each scenario runs in
-- a sub-transaction that is rolled back; the block ends in RAISE EXCEPTION. Nothing persists.
-- Run AFTER the migration (or prepend the migration body inside one aborted transaction).

do $verify$
declare
  r text := '';
  td constant text := '6be7d526-0380-4ba1-9e4a-a7c273477393';
  tid bigint;
  res jsonb;
  node text;
  pass int;
  st record;
  rv bigint;
  ck bigint;
  champ text;
  dn int;
  okb boolean;
  -- play every playable match (winner = slot 1) through the real RPC
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', td, 'role', 'authenticated')::text, true);

  -- ── A: finish → correction → auto-reopen → undo → re-finish (single 2847, double 2848) ──────
  foreach tid in array array[2847, 2848]::bigint[] loop
    begin
      champ := case when tid = 2847 then 'W3M1' else 'GF' end;
      update public.tournaments set live_state = 'in_progress' where id = tid;
      for pass in 1..12 loop
        for node in select jsonb_array_elements(live_settings -> 'bracket' -> 'graph') ->> 'id' from public.tournaments where id = tid loop
          res := public.elim_live_apply(tid, jsonb_build_array(jsonb_build_object('op', 'patch_match', 'matchId', node,
                   'set', jsonb_build_object('status', 'completed', 'winner', 1, 'p1Score', 5, 'p2Score', 2, 'result', 'normal'))),
                   false, null, gen_random_uuid(), false);
        end loop;
        exit when exists (select 1 from public.tournaments where id = tid and live_settings -> 'matchState' -> champ ->> 'status' = 'completed');
      end loop;
      -- the helper is internal (not client-executable): read it as the owner, then back to the TD
      perform set_config('role', 'postgres', true);
      select public._elim_bracket_complete(live_settings) into okb from public.tournaments where id = tid;
      perform set_config('role', 'authenticated', true);
      r := r || ' A' || tid || '_complete=' || okb::text;
      update public.tournaments set status = 'completed', live_state = 'finished', completed_at = now() where id = tid;
      select live_revision into rv from public.tournaments where id = tid;
      -- dry run says it would reopen; then the real correction (winners-side semifinal flips)
      node := case when tid = 2847 then 'W2M1' else 'W2M1' end;
      res := public.elim_live_apply(tid, jsonb_build_array(jsonb_build_object('op', 'patch_match', 'matchId', node,
               'set', jsonb_build_object('status', 'completed', 'winner', 2, 'result', 'normal'))), false, rv, null, true);
      r := r || ' A' || tid || '_preview_reopens=' || coalesce(res ->> 'reopens_tournament', 'null');
      res := public.elim_live_apply(tid, jsonb_build_array(jsonb_build_object('op', 'patch_match', 'matchId', node,
               'set', jsonb_build_object('status', 'completed', 'winner', 2, 'result', 'normal'))), false, rv, gen_random_uuid(), false);
      select status, live_state, completed_at, live_revision into st from public.tournaments where id = tid;
      r := r || ' A' || tid || '_reopened=' || coalesce(res ->> 'reopened', 'null') || ':' || st.status || '/' || st.live_state
             || ':completed_at_null=' || (st.completed_at is null) || ':rev+' || (st.live_revision - rv)
             || ':reset=' || jsonb_array_length(res -> 'cascade' -> 'reset');
      r := r || ' A' || tid || '_audit_reopened=' || (select count(*) from public.tournament_audit
               where tournament_id = tid and revision = st.live_revision and (detail ->> 'reopened')::boolean);
      -- stale device (old revision) is refused
      begin
        perform public.elim_live_apply(tid, jsonb_build_array(jsonb_build_object('op', 'patch_match', 'matchId', node,
                  'set', jsonb_build_object('status', 'completed', 'winner', 1, 'result', 'normal'))), false, rv, gen_random_uuid(), false);
        r := r || ' A' || tid || '_stale=ACCEPTED';
      exception when others then r := r || ' A' || tid || '_stale=' || sqlerrm; end;
      -- undo the correction → complete bracket again → finish again
      res := public.elim_undo(tid, st.live_revision, false);
      -- the helper is internal (not client-executable): read it as the owner, then back to the TD
      perform set_config('role', 'postgres', true);
      select public._elim_bracket_complete(live_settings) into okb from public.tournaments where id = tid;
      perform set_config('role', 'authenticated', true);
      r := r || ' A' || tid || '_undo=' || coalesce(res ->> 'ok', 'null') || ':complete='
             || okb::text;
      update public.tournaments set status = 'completed', live_state = 'finished', completed_at = now() where id = tid;
      r := r || ' A' || tid || '_refinish=' || (select status from public.tournaments where id = tid);
      raise exception 'rb';
    exception when others then if sqlerrm <> 'rb' then r := r || ' A' || tid || '_ERROR=' || sqlstate || ':' || sqlerrm; end if; end;
  end loop;

  -- ── B: redraw boundary + cross-draw restore (2848) ───────────────────────────────────────────
  begin
    tid := 2848;
    update public.tournaments set live_state = 'in_progress' where id = tid;
    -- Draw 1 action
    for node in select jsonb_array_elements(live_settings -> 'bracket' -> 'graph') ->> 'id' from public.tournaments where id = tid loop
      res := public.elim_live_apply(tid, jsonb_build_array(jsonb_build_object('op', 'patch_match', 'matchId', node,
               'set', jsonb_build_object('status', 'completed', 'winner', 1, 'result', 'normal'))), false, null, gen_random_uuid(), false);
      exit when coalesce((res -> 'results' -> 0 ->> 'ok')::boolean, false);
    end loop;
    -- Redraw (the app's whole-blob write): new draw number + generatedAt, reversed seeds, results cleared
    select (live_settings #>> '{bracket,drawNumber}')::int into dn from public.tournaments where id = tid;
    update public.tournaments set live_settings = jsonb_set(jsonb_set(jsonb_set(jsonb_set(live_settings,
             '{bracket,drawNumber}', to_jsonb(dn + 1)),
             '{bracket,generatedAt}', to_jsonb('verify-' || now()::text)),
             '{bracket,seeds}', (select jsonb_agg(e order by o desc) from jsonb_array_elements(live_settings #> '{bracket,seeds}') with ordinality x(e, o))),
             '{matchState}', '{}'::jsonb)
     where id = tid;
    res := public.elim_undo(tid, null, true);
    r := r || ' B_after_redraw_undo=' || coalesce(res ->> 'available', 'null') || ':' || coalesce(res ->> 'reason', '');
    -- Draw 2 action → undoable; then the boundary
    for node in select jsonb_array_elements(live_settings -> 'bracket' -> 'graph') ->> 'id' from public.tournaments where id = tid loop
      res := public.elim_live_apply(tid, jsonb_build_array(jsonb_build_object('op', 'patch_match', 'matchId', node,
               'set', jsonb_build_object('status', 'completed', 'winner', 2, 'result', 'normal'))), false, null, gen_random_uuid(), false);
      exit when coalesce((res -> 'results' -> 0 ->> 'ok')::boolean, false);
    end loop;
    select live_revision into rv from public.tournaments where id = tid;
    res := public.elim_undo(tid, rv, false);
    r := r || ' B_undo_draw2=' || coalesce(res ->> 'ok', 'null');
    res := public.elim_undo(tid, null, true);
    r := r || ' B_then=' || coalesce(res ->> 'available', 'null') || ':' || coalesce(res ->> 'reason', '');
    -- Restore 'Before bracket redraw' → Draw 1; undo of that restore → Draw 2 bracket back
    select id into ck from public.elim_checkpoints where tournament_id = tid and reason = 'before_redraw' order by id desc limit 1;
    select live_revision into rv from public.tournaments where id = tid;
    res := public.elim_restore(tid, ck, rv, false);
    r := r || ' B_restore=' || coalesce(res ->> 'ok', 'null') || ':draw=' || (select live_settings #>> '{bracket,drawNumber}' from public.tournaments where id = tid);
    select live_revision into rv from public.tournaments where id = tid;
    res := public.elim_undo(tid, null, true);
    r := r || ' B_undo_target=' || coalesce(res #>> '{undoing,op}', 'none');
    res := public.elim_undo(tid, rv, false);
    r := r || ' B_undo_restore=' || coalesce(res ->> 'ok', 'null') || ':draw=' || (select live_settings #>> '{bracket,drawNumber}' from public.tournaments where id = tid);
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r || ' B_ERROR=' || sqlstate || ':' || sqlerrm; end if; end;

  raise exception 'RESULT:%', r;
end
$verify$;
