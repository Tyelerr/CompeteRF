-- supabase/migrations/20260713200000_chip_table_locked.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Persist a chip table's "locked" state (TD reserved it — no auto assignments,
-- Auto Run skips it). Without this the lock would be lost on reload.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.chip_tables
  add column if not exists locked boolean not null default false;
