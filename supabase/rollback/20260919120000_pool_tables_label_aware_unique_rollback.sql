-- Rollback for 20260919120000_pool_tables_label_aware_unique.sql
--
-- Restores the original number-only uniqueness. NOTE: re-adding the old constraint will FAIL
-- if any tournament now has two pool tables sharing a table_number (which the new index allows).
-- If that has happened, resolve/renumber those rows first, then run this rollback.

DROP INDEX IF EXISTS public.tournament_tables_tournament_norm_label_number_key;

ALTER TABLE public.tournament_tables
  ADD CONSTRAINT tournament_tables_tournament_id_table_number_key
  UNIQUE (tournament_id, table_number);
