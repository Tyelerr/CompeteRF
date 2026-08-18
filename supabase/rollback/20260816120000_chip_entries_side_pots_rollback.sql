-- 20260816120000_chip_entries_side_pots_rollback.sql
-- Rollback for 20260816120000_chip_entries_side_pots.sql. Drops the singles side-pot
-- column. Run by hand only if reverting; revert the app code that reads/writes
-- chip_entries.paid_side_pots first.

alter table public.chip_entries
  drop column if exists paid_side_pots;
