-- Tournament Restore / complete audit history for chip tournaments.
--
-- restore_points: a bounded list of per-action snapshots (pre-action live state)
-- stored on chip_config, so the Audit Log can roll the whole tournament back to
-- ANY earlier point and survive reloads (unlike an in-memory undo stack). Each
-- entry keeps only the mutable live fields (chips/status/queue/tables/flags).
--
-- chip_events.superseded: a one-way flag set when a later Tournament Restore rolls
-- the state back past that action. The event STAYS in the log (full audit trail)
-- but renders dimmed ("Reverted by Tournament Restore") — history is never deleted.
alter table public.chip_config
  add column if not exists restore_points jsonb not null default '[]'::jsonb;

alter table public.chip_events
  add column if not exists superseded boolean not null default false;
