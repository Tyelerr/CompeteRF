-- supabase/rollback/20260927120000_match_check_in_rollback.sql
-- Reverts 20260927120000_match_check_in.sql. Nothing else depends on these objects: the table is
-- new, the RPCs are new, and no existing function, policy or column was changed — so dropping
-- them simply removes per-assignment check-in and Contact TD. Assignment notifications, Auto
-- Assign, the Clear Table hold, scoring and bracket advancement are unaffected.
--
-- Order matters only in that the RPCs reference the table.
-- DATA: dropping the table permanently deletes the check-in / issue history. To keep it, run
--   create table match_player_status_backup as select * from public.match_player_status;
-- first (or comment out the drop and just revoke the grants).
--
-- The client side must also be reverted (or it will call missing RPCs and show no ○/✓/?):
-- commit the app changes separately, and remove the notify-match-issue Edge Function with
--   supabase functions delete notify-match-issue

drop function if exists public.match_contact_td(bigint, text, text, text);
drop function if exists public.match_check_in(bigint, text);
drop function if exists public._match_issue_recipients(bigint);
drop function if exists public._match_player_context(bigint, text);
drop table if exists public.match_player_status;
