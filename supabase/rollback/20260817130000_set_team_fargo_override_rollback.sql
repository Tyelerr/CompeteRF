-- 20260817130000_set_team_fargo_override_rollback.sql
-- Rollback for 20260817130000_set_team_fargo_override.sql. Drops the doubles override
-- write RPC. Run by hand only if reverting.

drop function if exists public.set_team_fargo_override(bigint, boolean, integer, integer, text, text);
