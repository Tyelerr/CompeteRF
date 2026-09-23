-- supabase/rollback/20260929120000_check_in_timer_rollback.sql
-- Reverts 20260929120000_check_in_timer.sql (check-in timer + player Start Match).
--
-- Order matters: stop the sweep, drop the new RPCs, then the table, then restore the two
-- functions this migration REPLACED. Nothing else depends on the new objects.
--
-- AFTER running this, also:
--   • supabase functions delete notify-match-review
--   • delete the Vault secret: delete from vault.secrets where name = 'elim_review_url';
--   • revert the client (it would call missing RPCs: player Start Match, Mark Checked In,
--     Extend Time, and the Forfeit Review actions).
-- DATA: dropping match_assignment_status discards extensions and alert stamps. Back it up first
-- if you want the history: create table match_assignment_status_backup as select * from ...

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'match-review-sweep';

drop function if exists public._match_review_sweep();
drop function if exists public._match_review_kick(bigint);
drop function if exists public.match_review_pending(bigint);
drop function if exists public.match_review_mark_pushed(bigint, text, timestamptz, integer);
drop function if exists public.match_extend_deadline(bigint, text, integer);
drop function if exists public.match_mark_checked_in(bigint, text, bigint, boolean);
drop function if exists public.match_player_start(bigint, text);
drop table if exists public.match_assignment_status;

-- Presence provenance columns (harmless to keep; drop for a clean revert).
alter table public.match_player_status drop column if exists checked_in_by;
alter table public.match_player_status drop column if exists checked_in_source;

-- Contact TD reason list back to six. Rows already stored as 'opponent_not_here' must be
-- rewritten first or the constraint will not validate; they keep their free-text message.
update public.match_player_status set issue_reason = 'other' where issue_reason = 'opponent_not_here';
alter table public.match_player_status drop constraint if exists match_player_status_issue_reason_check;
alter table public.match_player_status add constraint match_player_status_issue_reason_check
  check (issue_reason in ('running_late', 'table_missing', 'equipment', 'dispute', 'watch_shot', 'other'));

-- Restore the two REPLACED functions by re-running their previous definitions:
--   submit_match_state  → supabase/migrations/20260922120000_elim_live_apply.sql
--   match_contact_td    → supabase/migrations/20260928120000_match_issue_resolve.sql
-- e.g.
--   psql "$DB_URL" -c "$(sed -n '/create or replace function public.submit_match_state(/,/^\$\$;/p' \
--     supabase/migrations/20260922120000_elim_live_apply.sql)"
--   psql "$DB_URL" -c "$(sed -n '/create or replace function public.match_contact_td(/,/^\$\$;/p' \
--     supabase/migrations/20260928120000_match_issue_resolve.sql)"
-- NOTE: restoring the old submit_match_state re-opens the participant lifecycle loophole (a
-- player could patch status/startedAt/completedAt directly). Only do it if you are also
-- reverting the client that depends on match_player_start.
