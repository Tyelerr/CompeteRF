-- supabase/rollback/20261009120000_chip_public_read_privacy_rollback.sql
-- Reverts 20261009120000: base chip_config / chip_events readable by everyone again (the prior
-- `true` read policies) and the public projection views dropped. Clients fall back to the base
-- tables automatically when the views are missing.

drop policy if exists chip_config_read on public.chip_config;
create policy chip_config_read on public.chip_config for select using (true);

drop policy if exists chip_events_read on public.chip_events;
create policy chip_events_read on public.chip_events for select using (true);

alter policy chip_config_write on public.chip_config to public;
alter policy chip_events_write on public.chip_events to public;

drop view if exists public.chip_events_public;
drop view if exists public.chip_config_public;
