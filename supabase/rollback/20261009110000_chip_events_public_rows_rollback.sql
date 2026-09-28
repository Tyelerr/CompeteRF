-- supabase/rollback/20261009110000_chip_events_public_rows_rollback.sql
-- Reverts 20261009110000: every chip_events row readable by everyone again (prior `true` policy).

drop policy if exists chip_events_read_manager on public.chip_events;
drop policy if exists chip_events_read on public.chip_events;
create policy chip_events_read on public.chip_events for select using (true);
alter policy chip_events_write on public.chip_events to public;
