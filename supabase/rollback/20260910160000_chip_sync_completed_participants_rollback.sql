-- Rollback for 20260910160000_chip_sync_completed_participants.sql
-- Drops the forward participant-sync RPC. Participation rows it created are legitimate,
-- durable participation data and are NOT removed by this rollback (dropping the function
-- only stops future syncs). If you must remove rows created by a specific erroneous run,
-- identify them manually by (tournament_id, created window) and delete under review — there
-- is intentionally no blanket data delete here.

drop function if exists public.chip_sync_completed_participants(bigint);
