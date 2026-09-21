-- supabase/migrations/20260919120000_pool_tables_label_aware_unique.sql
--
-- Pool Tables: replace number-only uniqueness with a NORMALIZED, label-aware unique index.
--
-- Before: UNIQUE (tournament_id, table_number) — two pool tables in one tournament could not
-- share a number even with different labels, so "Diamond 1" and "Tableeeee 1" collided.
--
-- After: uniqueness on (tournament_id, normalized_label, table_number), where the label is
-- normalized as lower(btrim(coalesce(label,''))). This means:
--   * "Diamond 1", "Front Room 1", and unlabeled "Pool Table 1" can coexist (distinct labels).
--   * "Diamond 1" twice is still blocked.
--   * "Diamond", " diamond ", "DIAMOND" are treated as the same label (trim + case-insensitive).
--   * NULL / "" / whitespace-only labels all collapse to the same default (unlabeled) value.
--
-- The application uses this exact same normalization for single-add + bulk-add validation and
-- the bulk preview, so preview and persistence never disagree.
--
-- Pre-apply check (run against production before writing this): 25 total rows, 0 groups would
-- collide under the new rule — so no existing data conflicts and no backfill is needed.
--
-- Nothing keys off table_number relationally (matches/live/streaming/delete all use the row id);
-- table_number is display + sort only. Rollback SQL: supabase/rollback/<same name>_rollback.sql.

ALTER TABLE public.tournament_tables
  DROP CONSTRAINT IF EXISTS tournament_tables_tournament_id_table_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS tournament_tables_tournament_norm_label_number_key
  ON public.tournament_tables (tournament_id, lower(btrim(coalesce(label, ''))), table_number);
