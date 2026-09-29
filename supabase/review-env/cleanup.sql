-- supabase/review-env/cleanup.sql — remove ONLY the Google review environment (NOT a migration).
-- Scope is resolved by identity, never by guessed ids:
--   venue      = venues.venue = 'Compete Review Test Venue (not a real venue)' AND status 'inactive'
--   tournaments= tournaments at that venue whose name starts 'Google Review Test' AND director 256
--   players    = pending players whose email is google-review-test-NN@example.com
-- Deletes: those tournaments (cascades: registrations, tables, chip_* rows, teams, match status,
-- events, analytics, alert matches), the rows that do NOT cascade (conversations / messages /
-- notification_messages / favorites tied to them), the test players, the venue's director link,
-- tables and the venue itself; then re-derives GoogleReviewTD's role (→ basic_user with no venue).
-- The three review ACCOUNTS are kept. Real users / venues / tournaments are never touched: the
-- script aborts if the scope looks wrong (anything owned by another venue/director, a real
-- account registered, venue owners/subscriptions attached, or unexpected counts).
-- Run:  npx supabase db query --linked -f supabase/review-env/cleanup.sql
-- Ends with ROLLBACK by default (prints what it WOULD delete): change the last line to COMMIT.
-- Reset = cleanup (commit) + setup.sql (commit).
begin;
create temp table _scope(kind text, id bigint);
create temp table _report(step text, n bigint);
create temp table _players(id uuid);

insert into _scope select 'venue', id from public.venues
 where venue = 'Compete Review Test Venue (not a real venue)' and status = 'inactive';
insert into _scope select 'tournament', t.id from public.tournaments t
 where t.venue_id in (select id from _scope where kind = 'venue') and t.name like 'Google Review Test%' and t.director_id = 256;

do $$
declare nv int; nt int; nother int;
begin
  select count(*) into nv from _scope where kind = 'venue';
  if nv = 0 then raise notice 'review venue not found - nothing to clean'; return; end if;
  if nv > 1 then raise exception 'more than one review venue matched (%)', nv; end if;
  select count(*) into nt from _scope where kind = 'tournament';
  -- every tournament at the review venue must be a review tournament
  select count(*) into nother from public.tournaments
   where venue_id in (select id from _scope where kind='venue') and id not in (select id from _scope where kind='tournament');
  if nother > 0 then raise exception 'review venue holds % non-review tournament(s) - aborting', nother; end if;
  if exists (select 1 from public.venue_owners where venue_id in (select id from _scope where kind='venue')) then
    raise exception 'review venue has an owner - aborting';
  end if;
  if exists (select 1 from public.venue_subscriptions where venue_id in (select id from _scope where kind='venue')) then
    raise exception 'review venue has a subscription - aborting';
  end if;
  if exists (select 1 from public.venue_directors where venue_id in (select id from _scope where kind='venue') and director_id <> 256) then
    raise exception 'review venue has a director other than GoogleReviewTD - aborting';
  end if;
  -- only review accounts / fictional players may be registered
  if exists (
    select 1 from public.tournament_players tp left join public.players pl on pl.id = tp.player_uuid
     where tp.tournament_id in (select id from _scope where kind='tournament')
       and not (tp.player_id in (255,256,257,258) or (tp.player_id is null and pl.email_normalized like 'google-review-test-%@example.com'))) then
    raise exception 'a non-review player is registered in a review tournament - inspect before cleaning';
  end if;
  -- Scotch teams: only review accounts / fictional players as members
  if exists (
    select 1 from public.tournament_team_members m left join public.players pl on pl.id = m.player_uuid
     where m.tournament_id in (select id from _scope where kind='tournament')
       and not (m.player_id in (255,256,257,258) or (m.player_id is null and pl.email_normalized like 'google-review-test-%@example.com'))) then
    raise exception 'a non-review player is on a review team - inspect before cleaning';
  end if;
end $$;

insert into _players select id from public.players where email_normalized like 'google-review-test-%@example.com' and profile_id is null;

-- non-cascading children first
with d as (delete from public.messages where tournament_id in (select id from _scope where kind='tournament') or venue_id in (select id from _scope where kind='venue') returning 1)
insert into _report select 'messages', count(*) from d;
with d as (delete from public.conversations where tournament_id in (select id from _scope where kind='tournament') returning 1)
insert into _report select 'conversations', count(*) from d;
with d as (delete from public.notification_messages where tournament_id in (select id from _scope where kind='tournament') or venue_id in (select id from _scope where kind='venue') returning 1)
insert into _report select 'notification_messages', count(*) from d;
with d as (delete from public.favorites where tournament_id in (select id from _scope where kind='tournament') returning 1)
insert into _report select 'favorites', count(*) from d;
-- tournaments (cascade)
with d as (delete from public.tournaments where id in (select id from _scope where kind='tournament') returning id)
insert into _report select 'tournaments (cascade)', count(*) from d;
-- fictional players (player_invitations cascade)
with d as (delete from public.players where id in (select id from _players) returning 1)
insert into _report select 'players (fictional)', count(*) from d;
-- venue: director link, audits, then venue (venue_tables cascade)
with d as (delete from public.venue_directors where venue_id in (select id from _scope where kind='venue') returning 1)
insert into _report select 'venue_directors', count(*) from d;
with d as (delete from public.venue_audits where venue_id in (select id from _scope where kind='venue') returning 1)
insert into _report select 'venue_audits', count(*) from d;
with d as (delete from public.venues where id in (select id from _scope where kind='venue') returning 1)
insert into _report select 'venues (tables cascade)', count(*) from d;
select public._recompute_user_role(256);
insert into _report select 'GoogleReviewTD role now: ' || role, 0 from public.profiles where id_auto = 256;

select step, n from _report;
rollback; -- change to: commit;
