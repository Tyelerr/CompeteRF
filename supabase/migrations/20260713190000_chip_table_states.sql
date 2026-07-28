-- supabase/migrations/20260713190000_chip_table_states.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Persist the chip live table-management state so it survives reloads:
--   • chip_tables.inactive / .closing — a table the TD closed (no new matches),
--     or one marked to close after its current match finishes.
--   • chip_config.reshuffle_pending / .reshuffle_table_count — a deferred full
--     redraw the TD requested (waiting for in-progress matches to finish), and
--     the active-table count to redraw onto.
-- Without these, the auto-save/reload round-trip would silently re-activate
-- closed tables and drop a pending reshuffle.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.chip_tables
  add column if not exists inactive boolean not null default false,
  add column if not exists closing  boolean not null default false;

alter table public.chip_config
  add column if not exists reshuffle_pending     boolean not null default false,
  add column if not exists reshuffle_table_count int;
