-- supabase/rollback/20261011120000_app_config_min_version_rollback.sql
-- Drops the app_config table (the client fails open when it is missing: no gate).
drop table if exists public.app_config;
drop function if exists public.tg_app_config_touch();
