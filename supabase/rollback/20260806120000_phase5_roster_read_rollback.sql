-- 20260806120000_phase5_roster_read_rollback.sql
-- Standalone DOWN for 20260806120000_phase5_roster_read.sql. Always safe.
drop function if exists public.get_registration_players_display(bigint);
