-- 20260910120000_chip_config_version_rollback.sql
-- Standalone DOWN for 20260910120000_chip_config_version.sql.
-- Drops the optimistic-concurrency version column. Safe: only remove this once no code
-- path (chip_apply RPC / CAS-aware client save) reads or bumps it — i.e. roll back the
-- Phase G concurrency batch first.

alter table public.chip_config
  drop column if exists version;
