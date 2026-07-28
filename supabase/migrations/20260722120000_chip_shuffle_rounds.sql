-- Round-based Shuffle Mode. A shuffle "round" seats every surviving team once
-- (winner-stays) before draining. We track the round flag and the list of teams
-- that still need to be seated this round. Stored on chip_config (not per
-- chip_entries row) so it never blocks entry persistence and rides along with
-- the rest of the config blob; the list is reset at every reshuffle.
alter table public.chip_config
  add column if not exists shuffle_round boolean not null default false,
  add column if not exists round_remaining jsonb not null default '[]'::jsonb;
