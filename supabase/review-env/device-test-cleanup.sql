-- CLEANUP for the DISPOSABLE native device-test events. Run:
--   npx supabase db query --linked -f supabase/review-env/device-test-cleanup.sql
-- Scope: only tournaments named 'ZZ DEVICE TEST%' on review venue 312 / director 256 / hidden.
-- Restores push (tournament_updates) for 257/258. Never touches 2810/2811/2816 or real data.
begin;
do $$
declare ids bigint[]; team_ids bigint[];
begin
  select array_agg(id) into ids from public.tournaments
   where name like 'ZZ DEVICE TEST%' and venue_id = 312 and director_id = 256 and is_hidden;
  if ids is not null then
    if exists (select 1 from unnest(ids) x where x in (2810, 2811, 2816)) then raise exception 'refusing: review tournament in scope'; end if;
    select array_agg(id) into team_ids from public.tournament_teams where tournament_id = any(ids);
    delete from public.notifications where (data->>'tournament_id') in (select x::text from unnest(ids) x);
    delete from public.match_assignment_notifications where tournament_id = any(ids);
    delete from public.match_player_status where tournament_id = any(ids);
    delete from public.match_assignment_status where tournament_id = any(ids);
    delete from public.tournament_events where tournament_id = any(ids);
    delete from public.chip_results where tournament_id = any(ids);
    delete from public.chip_events where tournament_id = any(ids);
    delete from public.chip_matches where tournament_id = any(ids);
    delete from public.chip_tables where tournament_id = any(ids);
    delete from public.chip_entries where tournament_id = any(ids);
    delete from public.chip_config where tournament_id = any(ids);
    if team_ids is not null then
      delete from public.tournament_team_members where team_id = any(team_ids);
      delete from public.tournament_teams where id = any(team_ids);
    end if;
    delete from public.tournament_players where tournament_id = any(ids);
    delete from public.tournament_tables where tournament_id = any(ids);
    delete from public.tournaments where id = any(ids);
  end if;
  update public.notification_preferences set tournament_updates = true
   where user_id in (select id from public.profiles where id_auto in (257, 258));
end $$;
select (select count(*) from public.tournaments where name like 'ZZ DEVICE TEST%') as remaining_events,
       (select bool_and(tournament_updates) from public.notification_preferences where user_id in (select id from public.profiles where id_auto in (257,258))) as push_restored;
commit;
