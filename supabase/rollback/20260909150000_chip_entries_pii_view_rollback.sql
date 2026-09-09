-- 20260909150000_chip_entries_pii_view_rollback.sql
-- Standalone DOWN for 20260909150000_chip_entries_pii_view.sql.
-- Restores the ORIGINAL public read on chip_entries and drops the spectator-safe view.
-- Always safe (policy swap + view drop).
--
-- NOTE: reverting this RE-EXPOSES chip_entries.p1_phone (PII) to anon/authenticated
-- spectators. Revert only if you intend that. The client's public reads fall back to the
-- (again-public) base table automatically once the view is gone.

-- Drop the view; this also removes the SELECT grants the forward migration made on it
-- (revoke/grant on chip_entries_public need no separate reversal — they cease to exist
-- with the object).
drop view if exists public.chip_entries_public;

drop policy if exists chip_entries_read on public.chip_entries;
create policy chip_entries_read on public.chip_entries
  for select using (true);
