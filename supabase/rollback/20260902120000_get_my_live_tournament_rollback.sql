-- Rollback for 20260902120000_get_my_live_tournament.sql
drop function if exists public.get_my_live_tournament();
drop index if exists public.tournament_players_player_id_idx;
drop index if exists public.chip_entries_p1_profile_idx;
drop index if exists public.chip_entries_p2_profile_idx;
