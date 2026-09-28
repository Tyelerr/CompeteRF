-- supabase/rollback/20261009100000_chip_public_views_rollback.sql
-- Reverts 20261009100000: drops the public projection views. Clients fall back to the base
-- tables automatically when the views are missing.

drop view if exists public.chip_events_public;
drop view if exists public.chip_config_public;
