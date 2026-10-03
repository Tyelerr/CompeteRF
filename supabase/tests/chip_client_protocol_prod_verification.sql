-- supabase/tests/chip_client_protocol_prod_verification.sql
-- ROLLBACK-ONLY production check for 20261021150000_chip_client_protocol_guard on the hidden review
-- Chip events 2849 / 2850 (director 256). Simulates the two app generations by the X-Client-Info
-- request header exactly as PostgREST exposes it. Everything rolls back (RAISE at the end).

do $verify$
declare
  r text := '';
  n bigint;
  td constant text := '6be7d526-0380-4ba1-9e4a-a7c273477393';
  oldh constant text := '{"x-client-info":"supabase-js-react-native/2.90.1"}';
  newh constant text := '{"x-client-info":"compete-chip/2 supabase-js-web"}';
  tbl text;
begin
  -- helper pattern: every probe is its own sub-transaction (rolled back), as the TD
  -- 1. legacy-only event: an old phone creates the chip config and writes rows (allowed)
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', td, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', oldh, true);
    insert into public.chip_config (tournament_id, format, queue) values (2849, 'singles', '[]'::jsonb)
      on conflict (tournament_id) do update set queue = excluded.queue;
    select id into tbl from public.chip_tables where tournament_id = 2849 limit 1;
    update public.chip_tables set label = label where id = tbl; get diagnostics n = row_count;
    r := r || ' L_old_legacy_only=OK:' || n;
    r := r || ' L_stamp=' || coalesce((select min_client_protocol::text from public.chip_config where tournament_id = 2849), 'null');
    -- 2. a current client writes once → stamped
    perform set_config('request.headers', newh, true);
    update public.chip_config set version = version + 1 where tournament_id = 2849; get diagnostics n = row_count;
    r := r || ' N_new_write=OK:' || n || ' N_stamp=' || (select min_client_protocol from public.chip_config where tournament_id = 2849);
    -- 3. the old phone is now refused on every chip table it writes, and on status changes
    perform set_config('request.headers', oldh, true);
    begin
      insert into public.chip_config (tournament_id, queue) values (2849, '["stale"]'::jsonb)
        on conflict (tournament_id) do update set queue = excluded.queue;
      r := r || ' O_config=ACCEPTED';
    exception when others then r := r || ' O_config=' || sqlerrm; end;
    begin
      update public.chip_tables set label = 'stale' where tournament_id = 2849; r := r || ' O_tables=ACCEPTED';
    exception when others then r := r || ' O_tables=' || sqlerrm; end;
    begin
      delete from public.chip_tables where tournament_id = 2849; r := r || ' O_prune=ACCEPTED';
    exception when others then r := r || ' O_prune=' || sqlerrm; end;
    begin
      insert into public.chip_events (id, tournament_id, type, text) values ('ev_verify_old', 2849, 'manual', 'x'); r := r || ' O_events=ACCEPTED';
    exception when others then r := r || ' O_events=' || sqlerrm; end;
    begin
      update public.chip_config set version = version + 1 where tournament_id = 2849; r := r || ' O_version=ACCEPTED';
    exception when others then r := r || ' O_version=' || sqlerrm; end;
    begin
      update public.tournaments set live_state = 'in_progress' where id = 2849; r := r || ' O_status=ACCEPTED';
    exception when others then r := r || ' O_status=' || sqlerrm; end;
    -- state after the refused legacy writes: unchanged
    r := r || ' S_queue=' || (select queue::text from public.chip_config where tournament_id = 2849)
           || ' S_tables=' || (select count(*) from public.chip_tables where tournament_id = 2849)
           || ' S_events=' || (select count(*) from public.chip_events where tournament_id = 2849 and id = 'ev_verify_old');
    -- 4. the current client keeps working, including status changes
    perform set_config('request.headers', newh, true);
    update public.chip_tables set label = label where tournament_id = 2849; get diagnostics n = row_count;
    r := r || ' N_after=OK:' || n;
    update public.tournaments set live_state = 'in_progress' where id = 2849; get diagnostics n = row_count;
    r := r || ' N_status=OK:' || n;
    -- 5. the OTHER event (never written by a current client) is untouched by all of this
    perform set_config('request.headers', oldh, true);
    update public.chip_tables set label = label where tournament_id = 2850; get diagnostics n = row_count;
    r := r || ' L_other_event_old=OK:' || n;
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r || ' ERROR=' || sqlstate || ':' || sqlerrm; end if; end;

  -- 6. the protocol the server derives from the header
  perform set_config('request.headers', newh, true); r := r || ' P_new=' || public.chip_client_protocol();
  perform set_config('request.headers', oldh, true); r := r || ' P_old=' || public.chip_client_protocol();
  raise exception 'RESULT:%', r;
end
$verify$;
