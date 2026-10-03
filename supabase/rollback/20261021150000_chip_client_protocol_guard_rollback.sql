-- supabase/rollback/20261021150000_chip_client_protocol_guard_rollback.sql
-- COMPLETE rollback of 20261021150000_chip_client_protocol_guard: drops the seven guard triggers,
-- the three functions and the min_client_protocol column (the stamps go with it). Nothing else in
-- the schema was changed. ⚠ Re-opens the old-client overwrite hole.

begin;

drop trigger if exists tournaments_chip_protocol_guard on public.tournaments;
drop trigger if exists chip_config_protocol_guard on public.chip_config;
drop trigger if exists chip_entries_protocol_guard on public.chip_entries;
drop trigger if exists chip_matches_protocol_guard on public.chip_matches;
drop trigger if exists chip_tables_protocol_guard on public.chip_tables;
drop trigger if exists chip_events_protocol_guard on public.chip_events;
drop trigger if exists chip_results_protocol_guard on public.chip_results;

drop function if exists public.tg_tournaments_chip_protocol_guard();
drop function if exists public.tg_chip_protocol_guard();
drop function if exists public.chip_client_protocol();
drop function if exists public._chip_min_client_protocol(bigint);
drop function if exists public._chip_client_protocol();

alter table public.chip_config drop column if exists min_client_protocol;

commit;
