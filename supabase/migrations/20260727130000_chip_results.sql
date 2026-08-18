-- Final placements for a finished Chip Tournament.
--
-- Placement is by EXACT elimination order (1st = last standing, 2nd = last
-- eliminated, …). Written when the TD taps "Finish Tournament" and cleared if the
-- completion is undone / the tournament is reopened. Durable + directly queryable
-- per player (p1/p2 profile ids) so profiles can later show career top-finishes
-- and earnings WITHOUT loading each tournament's full chip state.
--
-- Deliberately minimal + flexible: no payout amount, split, lock, or paid/unpaid
-- status is stored here yet — payout $ is derived from the placement + the TD's
-- prize structure, so those features can be layered on later without changing the
-- completion flow. One row per team per tournament (idempotent upsert).

create table if not exists public.chip_results (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  entry_id text not null,           -- chip_entries.id (client id)
  place int not null,               -- 1-based finishing position
  team_name text,                   -- snapshot of the display name at finish time
  p1_profile_id bigint,             -- profiles.id_auto (captain / singles player)
  p2_profile_id bigint,             -- profiles.id_auto (scotch-doubles partner)
  created_at timestamptz not null default now(),
  unique (tournament_id, entry_id)
);

create index if not exists chip_results_tournament_idx on public.chip_results(tournament_id);
create index if not exists chip_results_p1_idx on public.chip_results(p1_profile_id);
create index if not exists chip_results_p2_idx on public.chip_results(p2_profile_id);

alter table public.chip_results enable row level security;

-- Publicly readable (profiles / spectators show final standings), same as the
-- other chip_* tables.
drop policy if exists chip_results_read on public.chip_results;
create policy chip_results_read on public.chip_results
  for select using (true);

-- Only the tournament's manager (TD / owner / admin) may write results.
drop policy if exists chip_results_write on public.chip_results;
create policy chip_results_write on public.chip_results
  for all
  using (public.is_chip_manager(tournament_id))
  with check (public.is_chip_manager(tournament_id));

grant select on public.chip_results to authenticated, anon;
grant insert, update, delete on public.chip_results to authenticated;
