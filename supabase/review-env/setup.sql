-- supabase/review-env/setup.sql — Google Play / App Store REVIEW environment (NOT a migration).
-- Creates: "Compete Review Test Venue (not a real venue)" (inactive), its tables, the
-- GoogleReviewTD venue_directors link (TD role derived by _recompute_user_role), two hidden
-- registration-open tournaments ("Google Review Test – Elimination" / "– Chip"), 8 fictional
-- pending players (google-review-test-NN@example.com) registered via the app's own RPCs as the TD,
-- Googlereviewbasic's self-registration in the elimination event, and a hidden Scotch Doubles (Chip)
-- event with 3 fictional TD-built teams (Basic + Partner stay free for the invite flow).
-- Accounts: 258 Googlereviewbasic (official basic reviewer) · 256 GoogleReviewTD · 257 GoogleReviewPartner
-- (255 GoogleReviewPlayer is an unused extra basic account).
-- Applied 2026-09-28 → venue 312, venue_directors 250, tournaments 2810 (elim) / 2811 (chip) / 2816 (scotch).
-- Run:  npx supabase db query --linked -f supabase/review-env/setup.sql
-- Refuses to run twice (precondition block). To reset: run cleanup.sql (with commit), then this.
-- Ends with ROLLBACK by default: change the last line to COMMIT to apply.
begin;
create temp table _ids(k text primary key, v text);
create temp table _t(name text, ok boolean, detail text);
grant all on _ids, _t to authenticated;

-- 0. Preconditions: the three review accounts exist, none is an admin; nothing created yet.
do $$
declare n int;
begin
  select count(*) into n from public.profiles
   where (id_auto, user_name) in ((258,'Googlereviewbasic'),(256,'GoogleReviewTD'),(257,'GoogleReviewPartner'))
     and role not in ('compete_admin','super_admin') and not coalesce(is_disabled,false);
  if n <> 3 then raise exception 'review accounts precondition failed (%)', n; end if;
  if exists (select 1 from public.venues where venue ilike 'Compete Review Test Venue%') then
    raise exception 'review venue already exists';
  end if;
  if exists (select 1 from public.players where email_normalized like 'google-review-test-%@example.com') then
    raise exception 'review test players already exist';
  end if;
end $$;

-- 1. Venue (inactive = out of public venue discovery), its tables, and the TD link.
with v as (
  insert into public.venues (venue, address, city, state, zip_code, status, has_tournaments, has_leagues)
  values ('Compete Review Test Venue (not a real venue)', 'Test venue - not a real location', 'Phoenix', 'AZ', '00000', 'inactive', false, false)
  returning id)
insert into _ids select 'venue', id::text from v;
insert into public.venue_tables (venue_id, table_size, brand, quantity)
select v::int, '7ft', 'Diamond', 6 from _ids where k='venue';
with d as (
  insert into public.venue_directors (venue_id, director_id)
  select v::int, 256 from _ids where k='venue' returning id)
insert into _ids select 'venue_director', id::text from d;
select public._recompute_user_role(256);

-- 2. Tournaments (hidden, non-recurring, Auto Assign off, registration open, far-future date).
with e as (
  insert into public.tournaments (
    name, description, venue_id, director_id, game_type, tournament_format, status, live_state,
    is_draft, is_hidden, is_recurring, tournament_date, start_time, timezone, entry_fee, race,
    table_size, equipment, bracket_source, open_tournament, reports_to_fargo, preregistration_enabled,
    thumbnail, live_settings)
  select 'Google Review Test – Elimination',
    'Test tournament for app review only. Not a real event; all players are fictional.',
    v::int, 256, '9-ball', 'double-elimination', 'active', 'registration_open',
    false, true, false, '2027-12-31', '19:00', 'America/Phoenix', 10, 'Winners 5 / Losers 4 / Finals 5',
    '7ft', 'diamond', 'compete', true, false, false, '9-ball',
    jsonb_build_object(
      'autoAssignEnabled', false, 'autoAssignMode', 'losersFirst',
      'raceMode', 'fixed', 'raceGroups', '[]'::jsonb,
      'fixedRaceWinners', 5, 'fixedRaceLosers', 4, 'fixedRaceFinals', 5,
      'fargoDiffMinRace', 3, 'fargoDiffMaxRace', null, 'fargoDiffPerGame', 40, 'fargoDiffRounding', 'down',
      'chipBuyBacks', false, 'feesAddedOnTop', false,
      'checkIn', jsonb_build_object('required', false, 'warnAfterMinutes', 5, 'forfeitReviewAfterMinutes', 10),
      'fees', '[{"id":"fee-green","name":"Green Fee","amount":0,"enabled":false,"category":"green"},{"id":"fee-td","name":"TD Fee","amount":0,"enabled":false,"category":"td"},{"id":"fee-admin","name":"Admin Fee","amount":0,"enabled":false,"category":"admin"}]'::jsonb,
      'prizePool', '{"sidePots":[],"entryPlaces":[{"percent":50,"amountOverride":null},{"percent":30,"amountOverride":null},{"percent":20,"amountOverride":null}],"includeAddedMoney":true}'::jsonb)
  from _ids where k='venue'
  returning id)
insert into _ids select 'elim', id::text from e;

with c as (
  insert into public.tournaments (
    name, description, venue_id, director_id, game_type, tournament_format, status, live_state,
    is_draft, is_hidden, is_recurring, tournament_date, start_time, timezone, entry_fee, race,
    table_size, equipment, bracket_source, open_tournament, reports_to_fargo, preregistration_enabled,
    thumbnail, chip_ranges, live_settings)
  select 'Google Review Test – Chip',
    'Test Chip tournament for app review only. Not a real event; all players are fictional.',
    v::int, 256, '9-ball', 'chip-tournament', 'active', 'registration_open',
    false, true, false, '2027-12-31', '19:00', 'America/Phoenix', 10, 'Winners 1 / Losers 4 / Finals 7',
    '7ft', 'diamond', 'compete', true, false, false, '9-ball',
    '[{"chips":3,"label":"701 & Above","maxRating":9999,"minRating":701},{"chips":4,"label":"641-700","maxRating":700,"minRating":641},{"chips":5,"label":"581-640","maxRating":640,"minRating":581},{"chips":6,"label":"521-580","maxRating":580,"minRating":521},{"chips":7,"label":"461-520","maxRating":520,"minRating":461},{"chips":8,"label":"460 & Under","maxRating":460,"minRating":0}]'::jsonb,
    jsonb_build_object(
      'autoAssignEnabled', false,
      'raceMode', 'fixed', 'raceGroups', '[]'::jsonb,
      'fixedRaceWinners', 1, 'fixedRaceLosers', 4, 'fixedRaceFinals', 7,
      'fargoDiffMinRace', 0, 'fargoDiffMaxRace', null, 'fargoDiffPerGame', 40, 'fargoDiffRounding', 'down',
      'chipBuyBacks', false, 'feesAddedOnTop', false,
      'checkIn', jsonb_build_object('required', false, 'warnAfterMinutes', 5, 'forfeitReviewAfterMinutes', 10),
      'fees', '[{"id":"fee-green","name":"Green Fee","amount":0,"enabled":false,"category":"green"},{"id":"fee-td","name":"TD Fee","amount":0,"enabled":false,"category":"td"},{"id":"fee-admin","name":"Admin Fee","amount":0,"enabled":false,"category":"admin"}]'::jsonb,
      'prizePool', '{"sidePots":[],"entryPlaces":[{"percent":50,"amountOverride":null},{"percent":30,"amountOverride":null},{"percent":20,"amountOverride":null}],"includeAddedMoney":true}'::jsonb)
  from _ids where k='venue'
  returning id)
insert into _ids select 'chip', id::text from c;

-- 3. Tournament tables: 4 for the elimination event, 3 for the Chip event.
insert into public.tournament_tables (tournament_id, table_number, label)
select (select v::int from _ids where k='elim'), n, 'Table ' || n from generate_series(1,4) n;
insert into public.chip_tables (id, tournament_id, label, sort, status)
select 't_review' || n || substr(md5(random()::text),1,8), (select v::bigint from _ids where k='chip'), 'Table ' || n, n - 1, 'open'
from generate_series(1,3) n;

-- 4. Fictional players, created + registered through the app's own RPCs AS the review TD.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','6be7d526-0380-4ba1-9e4a-a7c273477393','role','authenticated')::text, true);
create temp table _p(n int, first text, last text, fargo int, player_id uuid, outcome text);
grant all on _p to authenticated;
insert into _p (n, first, last, fargo) values
  (1,'Alex','Test',720),(2,'Blake','Test',660),(3,'Casey','Test',610),(4,'Drew','Test',560),
  (5,'Emery','Test',540),(6,'Finley','Test',490),(7,'Gray','Test',450),(8,'Harper','Test',600);
update _p set (player_id, outcome) = (select r.player_id, r.outcome from public.create_pending_player(
  (select v::bigint from _ids where k='elim'), _p.first, _p.last, 'google-review-test-' || lpad(_p.n::text,2,'0') || '@example.com', null) r);
select public.register_player_for_tournament((select v::bigint from _ids where k='elim'), player_id, fargo, 'approved') from _p where n <= 7;
select public.register_player_for_tournament((select v::bigint from _ids where k='chip'), player_id, fargo, 'approved') from _p;

-- 5. Googlereviewbasic self-registers in the elimination event (exactly like the app's Register button).
select set_config('request.jwt.claims', json_build_object('sub','40901884-044d-44af-8f03-85dc105a3d10','role','authenticated')::text, true);
insert into public.tournament_players (tournament_id, player_id, status, fargo_rating)
values ((select v::int from _ids where k='elim'), 258, 'preregistered', null);
reset role;

-- 5b. Scotch Doubles (Chip) review tournament.
with c as (
  insert into public.tournaments (
    name, description, venue_id, director_id, game_type, tournament_format, status, live_state,
    is_draft, is_hidden, is_recurring, tournament_date, start_time, timezone, entry_fee, race,
    table_size, equipment, bracket_source, open_tournament, reports_to_fargo, preregistration_enabled,
    thumbnail, chip_ranges, live_settings)
  values ('Google Review Test – Scotch Doubles',
    'Scotch Doubles test tournament for app review only. Not a real event; all other teams are fictional.',
    (select v::int from _ids where k='venue'), 256, '9-ball-scotch-doubles', 'chip-tournament', 'active', 'registration_open',
    false, true, false, '2027-12-31', '19:00', 'America/Phoenix', 10, 'Winners 1 / Losers 4 / Finals 7',
    '7ft', 'diamond', 'compete', true, false, false, '9-ball',
    '[{"chips":8,"label":"1000 & Under","maxRating":1000,"minRating":0},{"chips":7,"label":"1001-1060","maxRating":1060,"minRating":1001},{"chips":6,"label":"1061-1120","maxRating":1120,"minRating":1061},{"chips":5,"label":"1121-1180","maxRating":1180,"minRating":1121},{"chips":4,"label":"1181-1240","maxRating":1240,"minRating":1181},{"chips":3,"label":"1241 & Above","maxRating":9999,"minRating":1241}]'::jsonb,
    (select live_settings from public.tournaments where id=(select v::int from _ids where k='chip')))
  returning id)
insert into _ids select 'scotch', id::text from c;
insert into public.chip_tables (id, tournament_id, label, sort, status)
select 't_review_s' || n || substr(md5(random()::text),1,8), (select v::bigint from _ids where k='scotch'), 'Table ' || n, n - 1, 'open'
from generate_series(1,2) n;

-- 5c. Three fictional teams built by the review TD with the app's team RPCs.
create temp table _team(pair int, cap uuid, cap_f int, mem uuid, mem_f int, team_id bigint);
grant all on _team to authenticated;
insert into _team (pair, cap, cap_f, mem, mem_f)
select x.pair, c.id, c.fargo, m.id, m.fargo
from (values (1,'01','02'),(2,'03','04'),(3,'05','06')) x(pair, cn, mn)
join public.players c on c.email_normalized = 'google-review-test-' || x.cn || '@example.com'
join public.players m on m.email_normalized = 'google-review-test-' || x.mn || '@example.com';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','6be7d526-0380-4ba1-9e4a-a7c273477393','role','authenticated')::text, true);
update _team set team_id = public.td_create_team_by_uuid((select v::bigint from _ids where k='scotch'), cap, cap_f);
select public.td_add_team_member_by_uuid(team_id, mem, mem_f) from _team;
reset role;

-- 5d. Googlereviewbasic registers the Scotch event as a CAPTAIN with no partner yet (create_team, as
-- the app does) so the event shows under Profile → My Tournaments; the reviewer then invites
-- GoogleReviewPartner by username and accepts on the Partner account.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','40901884-044d-44af-8f03-85dc105a3d10','role','authenticated')::text, true);
select public.create_team((select v::bigint from _ids where k='scotch'), 520);
reset role;

-- 5e. Display data (as applied to production 2026-09-28 after the TD UI check):
--  • Chip singles registrations carry guest_name — the Chip roster names a registration from the
--    player's profile or guest_name, and these fictional pending players have no profile.
--  • Scotch team members get their suggested Fargo (the TD still verifies it = "Mark Ready").
update public.tournament_players tp set guest_name = p.display_name
  from public.players p
 where tp.player_uuid = p.id and tp.tournament_id = (select v::int from _ids where k='chip')
   and p.email_normalized like 'google-review-test-%@example.com';
update public.tournament_team_members m set suggested_fargo = _p.fargo
  from _p
 where m.player_uuid = _p.player_id and m.tournament_id = (select v::int from _ids where k='scotch');

-- 6. Verification (inside the same transaction).
insert into _t select 'test players created fresh (8 CREATED_PENDING)', count(*) = 8, string_agg(distinct outcome, ',') from _p where outcome = 'CREATED_PENDING';
insert into _t select 'elim registrations: 7 test + Googlereviewbasic', count(*) = 8, count(*)::text from public.tournament_players where tournament_id = (select v::int from _ids where k='elim');
insert into _t select 'chip registrations: 8 test, all named', count(*) = 8 and count(guest_name) = 8, count(*)::text from public.tournament_players where tournament_id = (select v::int from _ids where k='chip');
insert into _t select 'no real user registered (only 258 + fictional pending players)', not exists (
  select 1 from public.tournament_players tp left join public.players pl on pl.id = tp.player_uuid
  where tp.tournament_id in (select v::int from _ids where k in ('elim','chip'))
    and not (tp.player_id = 258 or (tp.player_id is null and pl.email_normalized like 'google-review-test-%@example.com'))), null;
insert into _t select 'roles: 256 TD, 257 basic, 258 basic; none admin',
  (select string_agg(id_auto || '=' || role, ',' order by id_auto) from public.profiles where id_auto in (256,257,258)) = '256=tournament_director,257=basic_user,258=basic_user',
  (select string_agg(id_auto || '=' || role, ',' order by id_auto) from public.profiles where id_auto in (256,257,258));
insert into _t select 'tournaments hidden / non-recurring / auto assign off / registration open',
  count(*) = 3, string_agg(id || ':' || live_state, ',') from public.tournaments
  where id in (select v::int from _ids where k in ('elim','chip','scotch')) and is_hidden and not is_draft and not is_recurring
    and coalesce((live_settings->>'autoAssignEnabled')::boolean, false) = false and live_state = 'registration_open';
insert into _t select 'venue inactive, no owner, no subscription, no coordinates',
  v.status = 'inactive' and v.latitude is null
  and not exists (select 1 from public.venue_owners o where o.venue_id = v.id)
  and not exists (select 1 from public.venue_subscriptions s where s.venue_id = v.id), v.id::text
  from public.venues v where v.id = (select v::int from _ids where k='venue');

-- per-account checks as each user
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','6be7d526-0380-4ba1-9e4a-a7c273477393','role','authenticated')::text, true);
insert into _t select 'TD 256 manages both review tournaments', bool_and(public.can_manage_tournament(v::bigint)), null from _ids where k in ('elim','chip');
insert into _t select 'TD 256 cannot manage a real tournament (2595)', not public.can_manage_tournament(2595), null;
insert into _t select 'TD 256 sees the elim roster (8)', count(*) = 8, count(*)::text from public.tournament_players where tournament_id = (select v::int from _ids where k='elim');
select set_config('request.jwt.claims', json_build_object('sub','40901884-044d-44af-8f03-85dc105a3d10','role','authenticated')::text, true);
insert into _t select 'Review Basic reads both tournaments by id', count(*) = 2, null from public.tournaments where id in (select v::int from _ids where k in ('elim','chip'));
insert into _t select 'Review Basic sees own registration', count(*) = 1, null from public.tournament_players where player_id = 258;
insert into _t select 'Review Basic cannot manage', not public.can_manage_tournament((select v::bigint from _ids where k='elim')), null;
select set_config('request.jwt.claims', json_build_object('sub','0b66a2a5-c122-41c2-84a8-61a9846b836e','role','authenticated')::text, true);
insert into _t select 'Review Partner reads both tournaments, cannot manage', count(*) = 2 and not public.can_manage_tournament((select v::bigint from _ids where k='chip')), null
  from public.tournaments where id in (select v::int from _ids where k in ('elim','chip'));
reset role;

select 'ID' as name, true as ok, k || '=' || v as detail from _ids
union all select name, ok, detail from _t;
rollback; -- change to: commit;
