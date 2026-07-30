-- 20260807120000_phase5_set_team_name_rollback.sql
-- Standalone DOWN for 20260807120000_phase5_set_team_name.sql. Always safe.
drop function if exists public.set_team_name(bigint, text);
