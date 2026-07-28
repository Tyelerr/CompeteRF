-- Transaction grouping for the Audit Log. Every event that ONE action logs (a
-- completed match logs match_result + chip_loss + elimination, a forfeit logs
-- forfeit + chip_loss + queue movement, etc.) now shares a tx_id so the log can
-- show the parent event as a single row and fold the rest in as "resulting
-- changes". null = a standalone event. Older rows have no tx_id and stay ungrouped.
alter table public.chip_events
  add column if not exists tx_id text;
