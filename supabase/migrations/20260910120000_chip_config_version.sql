-- Phase G (G1) — optimistic-concurrency version anchor on chip_config (audit items
-- 41/42/43). ADDITIVE ONLY: adds a monotonically-increasing version column that later
-- Phase G work (the transactional chip_apply RPC + CAS) will read/bump to reject stale
-- multi-director writes. Nothing reads or writes it yet, so applying this changes no
-- behavior — it is a safe, standalone foundation step.
--
-- Existing tournaments: version defaults to 0; the first CAS-aware write bumps it to 1.
-- Fully backward compatible — the current whole-blob save path ignores this column.
--
-- ROLLBACK: supabase/rollback/20260910120000_chip_config_version_rollback.sql

alter table public.chip_config
  add column if not exists version bigint not null default 0;
