-- DISPOSABLE native device-test events — APPLIED 2026-10-02 as 2847-2851. Do not re-run (refuses if they exist).
begin;
create temp table _ids(k text primary key, v text);
create temp table _t(name text, ok boolean, detail text);
create temp table _before as select md5(string_agg(x, '|' order by x)) h from (
  select t::text x from public.tournaments t where id in (2810, 2811)
  union all select tp::text from public.tournament_players tp where tournament_id in (2810, 2811)
  union all select ct::text from public.chip_tables ct where tournament_id in (2810, 2811)
  union all select cc::text from public.chip_config cc where tournament_id in (2810, 2811)) s;
do $$ begin
  if exists (select 1 from public.tournaments where name like 'ZZ DEVICE TEST%') then raise exception 'device test events already exist'; end if;
  if (select count(*) from public.players where email_normalized like 'google-review-test-%@example.com') <> 8 then raise exception 'review test players missing'; end if;
end $$;

with t as (
  insert into public.tournaments (name, description, venue_id, director_id, game_type, tournament_format, status, live_state,
    is_draft, is_hidden, is_recurring, tournament_date, start_time, timezone, entry_fee, race, table_size, equipment,
    bracket_source, open_tournament, reports_to_fargo, preregistration_enabled, thumbnail, chip_ranges, live_settings)
  values ('ZZ DEVICE TEST 1 – Scoring (Single Elim)', 'DISPOSABLE device test event (native release gates). Not a real event; delete after testing.',
    312, 256, '9-ball', 'single-elimination', 'active', 'registration_open', false, true, false, '2027-12-31', '19:00', 'America/Phoenix',
    0, 'Race 3', '7ft', 'diamond', 'compete', false, false, false, '9-ball', null,
    jsonb_build_object('autoAssignEnabled', false, 'autoAssignMode', 'balanced',
      'raceMode', 'fixed', 'raceGroups', '[]'::jsonb, 'fixedRaceWinners', 3, 'fixedRaceLosers', 3, 'fixedRaceFinals', 3,
      'fargoDiffMinRace', 3, 'fargoDiffMaxRace', null, 'fargoDiffPerGame', 40, 'fargoDiffRounding', 'down',
      'chipBuyBacks', false, 'feesAddedOnTop', false,
      'checkIn', jsonb_build_object('required', false, 'warnAfterMinutes', 1440, 'forfeitReviewAfterMinutes', 1440),
      'fees', '[{"id":"fee-green","name":"Green Fee","amount":0,"enabled":false,"category":"green"},{"id":"fee-td","name":"TD Fee","amount":0,"enabled":false,"category":"td"},{"id":"fee-admin","name":"Admin Fee","amount":0,"enabled":false,"category":"admin"}]'::jsonb,
      'prizePool', '{"sidePots":[],"entryPlaces":[{"percent":60,"amountOverride":null},{"percent":40,"amountOverride":null}],"includeAddedMoney":true}'::jsonb))
  returning id)
insert into _ids select 'e1', id::text from t;

with t as (
  insert into public.tournaments (name, description, venue_id, director_id, game_type, tournament_format, status, live_state,
    is_draft, is_hidden, is_recurring, tournament_date, start_time, timezone, entry_fee, race, table_size, equipment,
    bracket_source, open_tournament, reports_to_fargo, preregistration_enabled, thumbnail, chip_ranges, live_settings)
  values ('ZZ DEVICE TEST 2 – Double Elim', 'DISPOSABLE device test event (native release gates). Not a real event; delete after testing.',
    312, 256, '9-ball', 'double-elimination', 'active', 'registration_open', false, true, false, '2027-12-31', '19:00', 'America/Phoenix',
    0, 'Race 3', '7ft', 'diamond', 'compete', false, false, false, '9-ball', null,
    jsonb_build_object('autoAssignEnabled', false, 'autoAssignMode', 'balanced',
      'raceMode', 'fixed', 'raceGroups', '[]'::jsonb, 'fixedRaceWinners', 3, 'fixedRaceLosers', 3, 'fixedRaceFinals', 3,
      'fargoDiffMinRace', 3, 'fargoDiffMaxRace', null, 'fargoDiffPerGame', 40, 'fargoDiffRounding', 'down',
      'chipBuyBacks', false, 'feesAddedOnTop', false,
      'checkIn', jsonb_build_object('required', false, 'warnAfterMinutes', 1440, 'forfeitReviewAfterMinutes', 1440),
      'fees', '[{"id":"fee-green","name":"Green Fee","amount":0,"enabled":false,"category":"green"},{"id":"fee-td","name":"TD Fee","amount":0,"enabled":false,"category":"td"},{"id":"fee-admin","name":"Admin Fee","amount":0,"enabled":false,"category":"admin"}]'::jsonb,
      'prizePool', '{"sidePots":[],"entryPlaces":[{"percent":60,"amountOverride":null},{"percent":40,"amountOverride":null}],"includeAddedMoney":true}'::jsonb))
  returning id)
insert into _ids select 'e2', id::text from t;

with t as (
  insert into public.tournaments (name, description, venue_id, director_id, game_type, tournament_format, status, live_state,
    is_draft, is_hidden, is_recurring, tournament_date, start_time, timezone, entry_fee, race, table_size, equipment,
    bracket_source, open_tournament, reports_to_fargo, preregistration_enabled, thumbnail, chip_ranges, live_settings)
  values ('ZZ DEVICE TEST 3 – Chip Two-TD', 'DISPOSABLE device test event (native release gates). Not a real event; delete after testing.',
    312, 256, '9-ball', 'chip-tournament', 'active', 'registration_open', false, true, false, '2027-12-31', '19:00', 'America/Phoenix',
    0, 'Race 3', '7ft', 'diamond', 'compete', false, false, false, '9-ball', '[{"chips":3,"label":"All ratings","maxRating":9999,"minRating":0}]'::jsonb,
    jsonb_build_object('autoAssignEnabled', false, 'autoAssignMode', 'balanced',
      'raceMode', 'fixed', 'raceGroups', '[]'::jsonb, 'fixedRaceWinners', 3, 'fixedRaceLosers', 3, 'fixedRaceFinals', 3,
      'fargoDiffMinRace', 3, 'fargoDiffMaxRace', null, 'fargoDiffPerGame', 40, 'fargoDiffRounding', 'down',
      'chipBuyBacks', false, 'feesAddedOnTop', false,
      'checkIn', jsonb_build_object('required', false, 'warnAfterMinutes', 1440, 'forfeitReviewAfterMinutes', 1440),
      'fees', '[{"id":"fee-green","name":"Green Fee","amount":0,"enabled":false,"category":"green"},{"id":"fee-td","name":"TD Fee","amount":0,"enabled":false,"category":"td"},{"id":"fee-admin","name":"Admin Fee","amount":0,"enabled":false,"category":"admin"}]'::jsonb,
      'prizePool', '{"sidePots":[],"entryPlaces":[{"percent":60,"amountOverride":null},{"percent":40,"amountOverride":null}],"includeAddedMoney":true}'::jsonb))
  returning id)
insert into _ids select 'e3', id::text from t;

with t as (
  insert into public.tournaments (name, description, venue_id, director_id, game_type, tournament_format, status, live_state,
    is_draft, is_hidden, is_recurring, tournament_date, start_time, timezone, entry_fee, race, table_size, equipment,
    bracket_source, open_tournament, reports_to_fargo, preregistration_enabled, thumbnail, chip_ranges, live_settings)
  values ('ZZ DEVICE TEST 4 – Chip Stranded Winners', 'DISPOSABLE device test event (native release gates). Not a real event; delete after testing.',
    312, 256, '9-ball', 'chip-tournament', 'active', 'registration_open', false, true, false, '2027-12-31', '19:00', 'America/Phoenix',
    0, 'Race 3', '7ft', 'diamond', 'compete', false, false, false, '9-ball', '[{"chips":1,"label":"All ratings","maxRating":9999,"minRating":0}]'::jsonb,
    jsonb_build_object('autoAssignEnabled', false, 'autoAssignMode', 'balanced',
      'raceMode', 'fixed', 'raceGroups', '[]'::jsonb, 'fixedRaceWinners', 3, 'fixedRaceLosers', 3, 'fixedRaceFinals', 3,
      'fargoDiffMinRace', 3, 'fargoDiffMaxRace', null, 'fargoDiffPerGame', 40, 'fargoDiffRounding', 'down',
      'chipBuyBacks', false, 'feesAddedOnTop', false,
      'checkIn', jsonb_build_object('required', false, 'warnAfterMinutes', 1440, 'forfeitReviewAfterMinutes', 1440),
      'fees', '[{"id":"fee-green","name":"Green Fee","amount":0,"enabled":false,"category":"green"},{"id":"fee-td","name":"TD Fee","amount":0,"enabled":false,"category":"td"},{"id":"fee-admin","name":"Admin Fee","amount":0,"enabled":false,"category":"admin"}]'::jsonb,
      'prizePool', '{"sidePots":[],"entryPlaces":[{"percent":60,"amountOverride":null},{"percent":40,"amountOverride":null}],"includeAddedMoney":true}'::jsonb))
  returning id)
insert into _ids select 'e4', id::text from t;

with t as (
  insert into public.tournaments (name, description, venue_id, director_id, game_type, tournament_format, status, live_state,
    is_draft, is_hidden, is_recurring, tournament_date, start_time, timezone, entry_fee, race, table_size, equipment,
    bracket_source, open_tournament, reports_to_fargo, preregistration_enabled, thumbnail, chip_ranges, live_settings)
  values ('ZZ DEVICE TEST 5 – Scotch Elim Guard', 'DISPOSABLE device test event (native release gates). Not a real event; delete after testing.',
    312, 256, '9-ball-scotch-doubles', 'single-elimination', 'active', 'registration_open', false, true, false, '2027-12-31', '19:00', 'America/Phoenix',
    0, 'Race 3', '7ft', 'diamond', 'compete', false, false, false, '9-ball', null,
    jsonb_build_object('autoAssignEnabled', false, 'autoAssignMode', 'balanced',
      'raceMode', 'fixed', 'raceGroups', '[]'::jsonb, 'fixedRaceWinners', 3, 'fixedRaceLosers', 3, 'fixedRaceFinals', 3,
      'fargoDiffMinRace', 3, 'fargoDiffMaxRace', null, 'fargoDiffPerGame', 40, 'fargoDiffRounding', 'down',
      'chipBuyBacks', false, 'feesAddedOnTop', false,
      'checkIn', jsonb_build_object('required', false, 'warnAfterMinutes', 1440, 'forfeitReviewAfterMinutes', 1440),
      'fees', '[{"id":"fee-green","name":"Green Fee","amount":0,"enabled":false,"category":"green"},{"id":"fee-td","name":"TD Fee","amount":0,"enabled":false,"category":"td"},{"id":"fee-admin","name":"Admin Fee","amount":0,"enabled":false,"category":"admin"}]'::jsonb,
      'prizePool', '{"sidePots":[],"entryPlaces":[{"percent":60,"amountOverride":null},{"percent":40,"amountOverride":null}],"includeAddedMoney":true}'::jsonb))
  returning id)
insert into _ids select 'e5', id::text from t;

insert into public.tournament_tables (tournament_id, table_number, label)
select (select v::int from _ids where k='e1'), n, 'Table ' || n from generate_series(1,3) n;
insert into public.tournament_players (tournament_id, player_id, status, fargo_rating)
values ((select v::int from _ids where k='e1'), 258, 'checked_in', 520), ((select v::int from _ids where k='e1'), 257, 'checked_in', 540);
insert into public.tournament_players (tournament_id, player_uuid, status, fargo_rating, guest_name)
select (select v::int from _ids where k='e1'), p.id, 'checked_in', 500, p.display_name
from public.players p where p.email_normalized in ('google-review-test-07@example.com','google-review-test-08@example.com');
do $d$
declare tid bigint := (select v::bigint from _ids where k='e1'); s jsonb := '[]'; r record; seeds jsonb; t1 bigint; i int := 0;
  slots int[] := array[0, 2, 4, 6]; arr jsonb[] := array[null,null,null,null,null,null,null,null]::jsonb[];
begin
  for r in select tp.id, coalesce(pr.name, tp.guest_name, 'Player') nm, tp.fargo_rating fr
           from public.tournament_players tp left join public.profiles pr on pr.id_auto = tp.player_id
           where tp.tournament_id = tid order by (tp.player_id is null), tp.player_id desc nulls last, tp.id loop
    i := i + 1;
    arr[slots[i] + 1] := jsonb_build_object('registrationId', r.id, 'name', r.nm, 'fargo', r.fr, 'raceOverride', null);
  end loop;
  seeds := to_jsonb(arr);
  select id into t1 from public.tournament_tables where tournament_id = tid and table_number = 1;
  update public.tournaments set live_state = 'registration_closed',
    live_settings = live_settings || jsonb_build_object(
      'bracket', jsonb_build_object('generatedAt', now(), 'drawType', 'random', 'format', 'single-elimination',
        'drawNumber', 1, 'players', 4, 'bracketSize', 8, 'byes', 4, 'round1', '[]'::jsonb, 'doubleElim', false,
        'graph', '[{"id":"W1M1","side":"winners","round":1,"slot1":{"kind":"seed","seedIndex":0},"slot2":{"kind":"seed","seedIndex":1}},{"id":"W1M2","side":"winners","round":1,"slot1":{"kind":"seed","seedIndex":2},"slot2":{"kind":"seed","seedIndex":3}},{"id":"W1M3","side":"winners","round":1,"slot1":{"kind":"seed","seedIndex":4},"slot2":{"kind":"seed","seedIndex":5}},{"id":"W1M4","side":"winners","round":1,"slot1":{"kind":"seed","seedIndex":6},"slot2":{"kind":"seed","seedIndex":7}},{"id":"W2M1","side":"winners","round":2,"slot1":{"kind":"winner","matchId":"W1M1"},"slot2":{"kind":"winner","matchId":"W1M2"}},{"id":"W2M2","side":"winners","round":2,"slot1":{"kind":"winner","matchId":"W1M3"},"slot2":{"kind":"winner","matchId":"W1M4"}},{"id":"W3M1","side":"winners","round":3,"slot1":{"kind":"winner","matchId":"W2M1"},"slot2":{"kind":"winner","matchId":"W2M2"}}]'::jsonb, 'seeds', seeds),
      'drawLog', jsonb_build_array(jsonb_build_object('drawNumber', 1, 'tdUserId', 256, 'tdName', 'GoogleReviewTD', 'timestamp', now(),
        'reason', 'Initial draw (device test setup)', 'players', 4, 'bracketSize', 8, 'drawType', 'random')),
      'matchState', jsonb_build_object('W2M1', jsonb_build_object('status', 'scheduled', 'tableId', t1,
        'assignedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))))
  where id = tid;
end $d$;

insert into public.tournament_tables (tournament_id, table_number, label)
select (select v::int from _ids where k='e2'), n, 'Table ' || n from generate_series(1,3) n;
insert into public.tournament_players (tournament_id, player_id, status, fargo_rating)
values ((select v::int from _ids where k='e2'), 258, 'checked_in', 520), ((select v::int from _ids where k='e2'), 257, 'checked_in', 540);
insert into public.tournament_players (tournament_id, player_uuid, status, fargo_rating, guest_name)
select (select v::int from _ids where k='e2'), p.id, 'checked_in', 500, p.display_name
from public.players p where p.email_normalized in ('google-review-test-07@example.com','google-review-test-08@example.com');
do $d$
declare tid bigint := (select v::bigint from _ids where k='e2'); s jsonb := '[]'; r record; seeds jsonb; t1 bigint; i int := 0;
  slots int[] := array[0, 2, 4, 6]; arr jsonb[] := array[null,null,null,null,null,null,null,null]::jsonb[];
begin
  for r in select tp.id, coalesce(pr.name, tp.guest_name, 'Player') nm, tp.fargo_rating fr
           from public.tournament_players tp left join public.profiles pr on pr.id_auto = tp.player_id
           where tp.tournament_id = tid order by (tp.player_id is null), tp.player_id desc nulls last, tp.id loop
    i := i + 1;
    arr[slots[i] + 1] := jsonb_build_object('registrationId', r.id, 'name', r.nm, 'fargo', r.fr, 'raceOverride', null);
  end loop;
  seeds := to_jsonb(arr);
  select id into t1 from public.tournament_tables where tournament_id = tid and table_number = 1;
  update public.tournaments set live_state = 'registration_closed',
    live_settings = live_settings || jsonb_build_object(
      'bracket', jsonb_build_object('generatedAt', now(), 'drawType', 'random', 'format', 'double-elimination',
        'drawNumber', 1, 'players', 4, 'bracketSize', 8, 'byes', 4, 'round1', '[]'::jsonb, 'doubleElim', true,
        'graph', '[{"id":"W1M1","side":"winners","round":1,"slot1":{"kind":"seed","seedIndex":0},"slot2":{"kind":"seed","seedIndex":1}},{"id":"W1M2","side":"winners","round":1,"slot1":{"kind":"seed","seedIndex":2},"slot2":{"kind":"seed","seedIndex":3}},{"id":"W1M3","side":"winners","round":1,"slot1":{"kind":"seed","seedIndex":4},"slot2":{"kind":"seed","seedIndex":5}},{"id":"W1M4","side":"winners","round":1,"slot1":{"kind":"seed","seedIndex":6},"slot2":{"kind":"seed","seedIndex":7}},{"id":"W2M1","side":"winners","round":2,"slot1":{"kind":"winner","matchId":"W1M1"},"slot2":{"kind":"winner","matchId":"W1M2"}},{"id":"W2M2","side":"winners","round":2,"slot1":{"kind":"winner","matchId":"W1M3"},"slot2":{"kind":"winner","matchId":"W1M4"}},{"id":"W3M1","side":"winners","round":3,"slot1":{"kind":"winner","matchId":"W2M1"},"slot2":{"kind":"winner","matchId":"W2M2"}},{"id":"L1M1","side":"losers","round":1,"slot1":{"kind":"loser","matchId":"W1M1"},"slot2":{"kind":"loser","matchId":"W1M2"}},{"id":"L1M2","side":"losers","round":1,"slot1":{"kind":"loser","matchId":"W1M3"},"slot2":{"kind":"loser","matchId":"W1M4"}},{"id":"L2M1","side":"losers","round":2,"slot1":{"kind":"winner","matchId":"L1M1"},"slot2":{"kind":"loser","matchId":"W2M2"}},{"id":"L2M2","side":"losers","round":2,"slot1":{"kind":"winner","matchId":"L1M2"},"slot2":{"kind":"loser","matchId":"W2M1"}},{"id":"L3M1","side":"losers","round":3,"slot1":{"kind":"winner","matchId":"L2M1"},"slot2":{"kind":"winner","matchId":"L2M2"}},{"id":"L4M1","side":"losers","round":4,"slot1":{"kind":"winner","matchId":"L3M1"},"slot2":{"kind":"loser","matchId":"W3M1"}},{"id":"GF","side":"grand","round":1,"slot1":{"kind":"winner","matchId":"W3M1"},"slot2":{"kind":"winner","matchId":"L4M1"}},{"id":"GF2","side":"grand","round":2,"slot1":{"kind":"winner","matchId":"GF"},"slot2":{"kind":"loser","matchId":"GF"},"conditional":true}]'::jsonb, 'seeds', seeds),
      'drawLog', jsonb_build_array(jsonb_build_object('drawNumber', 1, 'tdUserId', 256, 'tdName', 'GoogleReviewTD', 'timestamp', now(),
        'reason', 'Initial draw (device test setup)', 'players', 4, 'bracketSize', 8, 'drawType', 'random')),
      'matchState', jsonb_build_object('W2M1', jsonb_build_object('status', 'scheduled', 'tableId', t1,
        'assignedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))))
  where id = tid;
end $d$;

insert into public.chip_tables (id, tournament_id, label, sort, status)
select 't_dev_e3' || n || substr(md5(random()::text),1,6), (select v::bigint from _ids where k='e3'), 'Table ' || n, n - 1, 'open'
from generate_series(1,3) n;
insert into public.tournament_players (tournament_id, player_uuid, status, fargo_rating, guest_name, paid_entry)
select (select v::int from _ids where k='e3'), p.id, 'checked_in', 500, p.display_name, true
from public.players p where p.email_normalized like 'google-review-test-%@example.com'
order by p.email_normalized limit 8;

insert into public.chip_tables (id, tournament_id, label, sort, status)
select 't_dev_e4' || n || substr(md5(random()::text),1,6), (select v::bigint from _ids where k='e4'), 'Table ' || n, n - 1, 'open'
from generate_series(1,3) n;
insert into public.tournament_players (tournament_id, player_uuid, status, fargo_rating, guest_name, paid_entry)
select (select v::int from _ids where k='e4'), p.id, 'checked_in', 500, p.display_name, true
from public.players p where p.email_normalized like 'google-review-test-%@example.com'
order by p.email_normalized limit 6;
-- Event 5: 2 fictional teams built with the app's team RPCs AS the TD, plus 2 individual Ready
-- registrations so the Draw control is reachable (the draw must then be refused by the guard).
insert into public.tournament_tables (tournament_id, table_number, label)
select (select v::int from _ids where k='e5'), n, 'Table ' || n from generate_series(1,2) n;
insert into public.tournament_players (tournament_id, player_uuid, status, fargo_rating, guest_name)
select (select v::int from _ids where k='e5'), p.id, 'checked_in', 500, p.display_name
from public.players p where p.email_normalized in ('google-review-test-07@example.com','google-review-test-08@example.com');
create temp table _team(pair int, cap uuid, mem uuid, team_id bigint);
grant all on _ids, _t, _team to authenticated;
insert into _team (pair, cap, mem)
select x.pair, c.id, m.id from (values (1,'01','02'),(2,'03','04')) x(pair, cn, mn)
join public.players c on c.email_normalized = 'google-review-test-' || x.cn || '@example.com'
join public.players m on m.email_normalized = 'google-review-test-' || x.mn || '@example.com';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','6be7d526-0380-4ba1-9e4a-a7c273477393','role','authenticated')::text, true);
update _team set team_id = public.td_create_team_by_uuid((select v::bigint from _ids where k='e5'), cap, 500);
select public.td_add_team_member_by_uuid(team_id, mem, 500) from _team;
reset role;

-- Push OFF for the two player test accounts while testing (restored by cleanup). In-app rows are
-- still written if the TD assigns a later match to them; cleanup deletes those.
update public.notification_preferences set tournament_updates = false
 where user_id in (select id from public.profiles where id_auto in (257, 258));

-- Verification
insert into _t select 'all 5 hidden, auto-assign off, check-in off, $0',
  count(*) = 5, string_agg(id::text, ',' order by id) from public.tournaments
  where id in (select v::int from _ids) and is_hidden and coalesce((live_settings->>'autoAssignEnabled')::boolean,false) = false
    and coalesce(live_settings #>> '{checkIn,required}','false') = 'false' and entry_fee = 0 and venue_id = 312 and director_id = 256;
insert into _t select 'E1/E2 drawn: 258 vs 257 in W2M1 on Table 1',
  bool_and(live_settings #>> '{matchState,W2M1,status}' = 'scheduled' and jsonb_array_length(live_settings #> '{bracket,seeds}') = 8), null
  from public.tournaments where id in (select v::int from _ids where k in ('e1','e2'));
insert into _t select 'E3 8 Ready / E4 6 Ready', (select count(*) from public.tournament_players where tournament_id = (select v::int from _ids where k='e3') and status='checked_in') = 8
  and (select count(*) from public.tournament_players where tournament_id = (select v::int from _ids where k='e4') and status='checked_in') = 6, null;
insert into _t select 'E5 teams', count(*) = 2, count(*)::text from public.tournament_teams where tournament_id = (select v::int from _ids where k='e5');
insert into _t select 'push off for 257/258', bool_and(not tournament_updates), null from public.notification_preferences where user_id in (select id from public.profiles where id_auto in (257,258));
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','6be7d526-0380-4ba1-9e4a-a7c273477393','role','authenticated')::text, true);
insert into _t select 'TD A (256) manages all 5', bool_and(public.can_manage_tournament(v::bigint)), null from _ids;
select set_config('request.jwt.claims', json_build_object('sub',(select id from public.profiles where id_auto = 44),'role','authenticated')::text, true);
insert into _t select 'TD B (44) manages all 5', bool_and(public.can_manage_tournament(v::bigint)), null from _ids;
select set_config('request.jwt.claims', json_build_object('sub','40901884-044d-44af-8f03-85dc105a3d10','role','authenticated')::text, true);
insert into _t select 'player 258 cannot manage', not public.can_manage_tournament((select v::bigint from _ids where k='e1')), null;
select set_config('request.jwt.claims', json_build_object('sub','0b66a2a5-c122-41c2-84a8-61a9846b836e','role','authenticated')::text, true);
insert into _t select 'player 257 cannot manage', not public.can_manage_tournament((select v::bigint from _ids where k='e1')), null;
reset role;
insert into _t select '2810/2811 untouched', (select h from _before) = (select md5(string_agg(x, '|' order by x)) from (
  select t::text x from public.tournaments t where id in (2810, 2811)
  union all select tp::text from public.tournament_players tp where tournament_id in (2810, 2811)
  union all select ct::text from public.chip_tables ct where tournament_id in (2810, 2811)
  union all select cc::text from public.chip_config cc where tournament_id in (2810, 2811)) s), null;
do $$ begin if exists (select 1 from _t where not ok) then raise exception 'verification failed: %', (select string_agg(name, '; ') from _t where not ok); end if; end $$;
select 'ID' as name, true as ok, k || '=' || v as detail from _ids union all select name, ok, detail from _t;
commit;
