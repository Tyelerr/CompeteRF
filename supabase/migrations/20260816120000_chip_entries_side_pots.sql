-- 20260816120000_chip_entries_side_pots.sql
-- Chip SINGLES side-pot support. chip_entries has only a `paid` boolean; teams and elim
-- already record side-pot ENTRIES as a text[] of pot NAMES:
--   tournament_players.paid_side_pots  (elim)
--   tournament_teams.paid_side_pots    (chip doubles / team)
-- Add the SAME column (same type + default + semantics) to chip_entries so a singles
-- chip entry can record which side pots it is ENTERED in.
--
-- SEMANTICS (important — see the audit): this array is MEMBERSHIP ("entered / bought
-- into"), NOT per-pot money collection. Entry-fee collection remains the separate
-- `paid` boolean; there is no per-pot "collected" flag anywhere in the model today.
--
-- Additive, idempotent, zero backfill. chip_entries is written by the app via upsert
-- (chip.service), so no RPC change is needed — only the column.

alter table public.chip_entries
  add column if not exists paid_side_pots text[] not null default '{}';

comment on column public.chip_entries.paid_side_pots is
  'Side-pot NAMES this singles chip entry is ENTERED in (membership), mirroring tournament_players/tournament_teams.paid_side_pots. Entered != collected; entry-fee collection is the separate `paid` boolean.';
