-- supabase/pending/20261009110000_chip_events_public_rows.sql   (HELD — separate privacy step, awaiting approval)
--
-- INTERIM, PARTIAL privacy for chip_events that stays compatible with released native apps.
-- Non-managers (anon + signed-in players) can still read chip_events directly, but only the
-- public-story ROWS: TD-only, reason-bearing event types are hidden (restore, chip_adjust,
-- undo, redo, settings_*, fargo_cap_override, player_added, table_added). Tournament managers
-- keep full access. Released clients only read events for the public activity feed, which
-- never renders these types, so nothing visible changes for them.
--
-- NOT solved here (needs 20261009120000 once old native builds are retired):
--   • actorName / actor_id / non-forfeit reasons still readable on the allowed rows;
--   • chip_config (incl. restore_points) still fully public.
--
-- Rollback: supabase/rollback/20261009110000_chip_events_public_rows_rollback.sql

drop policy if exists chip_events_read on public.chip_events;
create policy chip_events_read on public.chip_events
  for select to anon, authenticated
  using (type not in (
    'chip_adjust', 'restore', 'undo', 'redo',
    'settings_unlocked', 'settings_relocked_no_save', 'settings_updated_locked',
    'fargo_cap_override', 'player_added', 'table_added'
  ));

-- Managers (TD / venue owner / venue director / admins) read every row. TO authenticated only:
-- anon has no EXECUTE on is_chip_manager.
drop policy if exists chip_events_read_manager on public.chip_events;
create policy chip_events_read_manager on public.chip_events
  for select to authenticated using (public.is_chip_manager(tournament_id));

-- The FOR ALL write policy (role PUBLIC) also applies to SELECT and would evaluate
-- is_chip_manager for anon → permission error on hidden rows. anon can never be a manager, so
-- scoping it to authenticated changes no write behaviour.
alter policy chip_events_write on public.chip_events to authenticated;
