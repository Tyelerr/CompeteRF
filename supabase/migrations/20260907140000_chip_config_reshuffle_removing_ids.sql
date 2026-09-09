-- Chip Tournament — track which tables a Shuffle cycle marked "closing after match"
-- via its Reduce-tables step, so Cancel Shuffle reopens ONLY those (never a table the
-- TD closed manually via "Close After Current Match").
--
-- Nullable jsonb array of chip_tables.id values; defaults to an empty array. The app
-- reads a missing value as [] and its save writes this column in an isolated block, so
-- behavior is correct whether or not this migration has been applied — applying it
-- simply lets the distinction survive a reload of an in-progress shuffle.

alter table public.chip_config
  add column if not exists reshuffle_removing_ids jsonb not null default '[]'::jsonb;
