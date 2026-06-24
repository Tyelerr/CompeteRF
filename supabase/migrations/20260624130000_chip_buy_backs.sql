-- supabase/migrations/20260624130000_chip_buy_backs.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Chip Tournament: replace the "auto eliminate" toggle with buy-backs. A player
-- eliminated at 0 chips is always out, but if buy-backs are allowed the TD can buy
-- them back into the queue. Winner-stays and performance tracking are now always
-- on; stream tables are marked per-table — so those columns are no longer written
-- by the app (left in place, harmless, defaulting).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.chip_config
  add column if not exists buy_backs_allowed boolean not null default false;
