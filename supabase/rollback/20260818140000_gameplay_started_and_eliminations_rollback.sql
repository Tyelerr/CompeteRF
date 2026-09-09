-- Rollback for 20260818140000_gameplay_started_and_eliminations.sql

drop function if exists public.sync_tournament_eliminations(integer, integer[]);
drop index if exists public.idx_tplayers_eliminated;
alter table public.tournament_players drop column if exists eliminated_at;

drop trigger if exists trg_set_gameplay_started_at on public.tournaments;
drop function if exists public.set_gameplay_started_at();
alter table public.tournaments drop column if exists gameplay_started_at;
