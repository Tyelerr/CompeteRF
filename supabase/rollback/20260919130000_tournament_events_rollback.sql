-- Rollback for 20260919130000_tournament_events.sql
-- Drops the elimination activity log + its authorization predicate. Additive feature, so this
-- is a clean drop (no data migration). is_tournament_manager is used only by this table.

DROP TABLE IF EXISTS public.tournament_events;
DROP FUNCTION IF EXISTS public.is_tournament_manager(bigint);
