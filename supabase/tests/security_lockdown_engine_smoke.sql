-- supabase/tests/security_lockdown_engine_smoke.sql
-- ROLLBACK-ONLY prod smoke after 20261021120000_security_lockdown: the TD (id_auto 256) runs the
-- hidden review events through the real write paths. Nothing persists (each block rolls back; the
-- script ends in RAISE EXCEPTION).
--   Single 2847 / Double 2848: Start → (assign+start → result) until the champion match is done →
--     elimination sync (tournament_players) → Recovery & History read → Finish.
--   Chip 2849: config + entries + match + result event + queue/chip update + Start → Finish, as the
--     TD (chip_* RLS), plus the TD's registration writes the chip Start performs.
-- Run: npx supabase db query --linked -f supabase/tests/security_lockdown_engine_smoke.sql

do $smoke$
declare
  r text := '';
  td constant text := '6be7d526-0380-4ba1-9e4a-a7c273477393';
  tid bigint;
  res jsonb;
  node text;
  pass int;
  played int;
  champ text;
  okc int;
  n bigint;
  regs int[];
begin
  foreach tid in array array[2847, 2848]::bigint[] loop
    begin
      perform set_config('role','authenticated',true);
      perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
      update public.tournaments set live_state = 'in_progress', gameplay_started_at = now() where id = tid;
      get diagnostics n = row_count; r := r||' T'||tid||'_start=OK:'||n;
      played := 0;
      champ := case when tid = 2847 then 'W3M1' else 'GF' end;
      for pass in 1..12 loop
        for node in select jsonb_array_elements(live_settings->'bracket'->'graph')->>'id' from public.tournaments where id = tid loop
          res := public.elim_live_apply(tid, jsonb_build_array(jsonb_build_object('op','assign','matchId',node,
                   'tableId',(select min(id) from public.tournament_tables where tournament_id = tid),'start',true)), false, null, null, false);
          if coalesce((res->'results'->0->>'ok')::boolean, false) then
            res := public.elim_live_apply(tid, jsonb_build_array(jsonb_build_object('op','patch_match','matchId',node,
                     'set', jsonb_build_object('status','completed','winner',1,'p1Score',5,'p2Score',2,'result','normal','completedAt',now()))), false, null, null, false);
            if coalesce((res->'results'->0->>'ok')::boolean, false) then played := played + 1;
            else r := r||' T'||tid||'_result_'||node||'=FAIL:'||coalesce(res->'results'->0->>'error', res::text); end if;
          end if;
        end loop;
        exit when exists (select 1 from public.tournaments where id = tid
                           and live_settings->'matchState'->champ->>'status' = 'completed');
      end loop;
      r := r||' T'||tid||'_matches_played='||played;
      select count(*) into okc from public.tournaments where id = tid and live_settings->'matchState'->champ->>'status' = 'completed';
      r := r||' T'||tid||'_champion_match_done='||okc;
      -- elimination sync writes tournament_players (the guard must let the definer RPC through)
      select array_agg(id) into regs from public.tournament_players where tournament_id = tid and status <> 'cancelled' limit 1;
      perform public.sync_tournament_eliminations(tid::int, regs[1:1]);
      r := r||' T'||tid||'_elim_sync=OK';
      select count(*) into n from public.tournament_audit where tournament_id = tid; r := r||' T'||tid||'_history_rows='||n;
      update public.tournaments set status = 'completed', live_state = 'finished', completed_at = now() where id = tid;
      get diagnostics n = row_count; r := r||' T'||tid||'_finish=OK:'||n;
      raise exception 'rb';
    exception when others then if sqlerrm <> 'rb' then r := r||' T'||tid||'_ERROR='||sqlstate||':'||sqlerrm; end if; end;
  end loop;

  -- Chip 2849
  begin
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
    insert into public.chip_config (tournament_id) values (2849) on conflict (tournament_id) do nothing;
    get diagnostics n = row_count; r := r||' C_config=OK:'||n;
    insert into public.chip_entries (id, tournament_id, p1_name, start_chips, chips, status)
      values ('e_smoke_a', 2849, 'Smoke A', 3, 3, 'playing'), ('e_smoke_b', 2849, 'Smoke B', 3, 3, 'playing');
    r := r||' C_entries=OK';
    insert into public.chip_matches (id, tournament_id, table_id, a_id, b_id, status, started_at)
      values ('m_smoke', 2849, (select id from public.chip_tables where tournament_id = 2849 order by sort limit 1), 'e_smoke_a', 'e_smoke_b', 'in_progress', now());
    r := r||' C_match=OK';
    update public.chip_matches set status = 'finished', winner_id = 'e_smoke_a', loser_id = 'e_smoke_b', ended_at = now() where id = 'm_smoke' and tournament_id = 2849;
    update public.chip_entries set chips = chips - 1, status = 'queued' where id = 'e_smoke_b' and tournament_id = 2849;
    get diagnostics n = row_count; r := r||' C_result_chip_deduct=OK:'||n;
    insert into public.chip_events (id, tournament_id, type, text) values ('ev_smoke', 2849, 'match_result', 'Smoke A beat Smoke B');
    update public.chip_config set queue = '["e_smoke_b"]'::jsonb, version = coalesce(version, 0) + 1 where tournament_id = 2849;
    get diagnostics n = row_count; r := r||' C_queue_version=OK:'||n;
    update public.tournament_players set status = 'checked_in' where tournament_id = 2849 and status <> 'cancelled';
    get diagnostics n = row_count; r := r||' C_roster_ready=OK:'||n;
    update public.tournaments set live_state = 'in_progress', gameplay_started_at = now() where id = 2849;
    get diagnostics n = row_count; r := r||' C_start=OK:'||n;
    update public.chip_config set finished_at = now(), winner_entry_id = 'e_smoke_a' where tournament_id = 2849;
    update public.tournaments set status = 'completed', live_state = 'finished', completed_at = now() where id = 2849;
    get diagnostics n = row_count; r := r||' C_finish=OK:'||n;
    -- spectator reads of the same state
    perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    select count(*) into n from public.chip_events_public where tournament_id = 2849; r := r||' C_spectator_events='||n;
    select count(*) into n from public.chip_config_public where tournament_id = 2849; r := r||' C_spectator_config='||n;
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' C_ERROR='||sqlstate||':'||sqlerrm; end if; end;

  raise exception 'RESULT:%', r;
end
$smoke$;
