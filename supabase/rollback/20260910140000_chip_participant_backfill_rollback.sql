-- 20260910140000_chip_participant_backfill_rollback.sql
-- Standalone DOWN for 20260910140000_chip_participant_backfill.sql.
-- PRECISE + SAFE: deletes ONLY the tournament_players rows this backfill created (tracked
-- in chip_participant_backfill_log), never a legitimate participant row. Then drops the log.
--
-- Safe to run once; deletes exactly the logged ids. If you want to keep the log for audit,
-- run only the first statement and skip the drop.

delete from public.tournament_players tp
using public.chip_participant_backfill_log l
where tp.id = l.tournament_player_id;

drop table if exists public.chip_participant_backfill_log;
