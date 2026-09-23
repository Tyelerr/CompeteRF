-- supabase/rollback/20260928120000_match_issue_resolve_rollback.sql
-- Reverts 20260928120000_match_issue_resolve.sql.
--
-- 1. Drops Mark Resolved. Rows already resolved KEEP their resolved_at (harmless: the indicator
--    simply stays hidden for them) — nothing else reads or writes that column.
-- 2. Restores the four-reason CHECK constraint. Any row already stored with 'dispute' or
--    'watch_shot' must be migrated first or the constraint will not validate; the statement below
--    rewrites them to 'other' (they keep their free-text message).
-- 3. Restores match_contact_td to its 20260927120000 definition — re-run that file's function
--    body, e.g.
--      psql "$DB_URL" -c "$(sed -n '/create or replace function public.match_contact_td(/,/^\$\$;/p' \
--        supabase/migrations/20260927120000_match_check_in.sql)"
--    and re-run its grants. Also revert the client (the UI would otherwise offer two reasons the
--    server rejects, and a Mark Resolved button that errors).

drop function if exists public.match_issue_resolve(bigint, text, bigint);

update public.match_player_status set issue_reason = 'other'
where issue_reason in ('dispute', 'watch_shot');

alter table public.match_player_status drop constraint if exists match_player_status_issue_reason_check;
alter table public.match_player_status add constraint match_player_status_issue_reason_check
  check (issue_reason in ('running_late', 'table_missing', 'equipment', 'other'));
