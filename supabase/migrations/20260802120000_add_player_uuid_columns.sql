-- 20260802120000_add_player_uuid_columns.sql
-- Phase 3 of the Players / Pending Accounts migration.
-- See PENDING_ACCOUNTS_MIGRATION.md (§A.5, §I.4).
--
-- ADDITIVE ONLY + IDEMPOTENT. Adds a nullable uuid reference to public.players on
-- each of the SEVEN competitor columns' tables, backfills them via the verified
-- map (legacy id_auto -> profiles.id_auto -> profiles.id -> players.profile_id ->
-- players.id), and adds FKs + indexes. EVERY legacy id_auto competitor column is
-- left UNTOUCHED (compatibility window). No RLS/policy/authorization change — the
-- authorization cutover to players is Phase 4. Guests / unmapped rows stay NULL.
--
-- captain_id is intentionally NOT reinterpreted: we add captain_player_id (the
-- competitive identity) and DEFER managed_by_profile_id — current team semantics
-- have no separate account-management relationship (captain = playing member;
-- admin authority = captain or tournaments.director_id).
--
-- New columns (nullable uuid -> players.id, ON DELETE SET NULL; players are never
-- hard-deleted per §J, so this is defensive):
--   tournament_players.player_uuid        <- player_id (integer)
--   tournament_team_members.player_uuid   <- player_id (bigint)
--   tournament_teams.captain_player_id    <- captain_id (bigint, NOT NULL legacy)
--   chip_entries.p1_player_id             <- p1_profile_id (bigint)
--   chip_entries.p2_player_id             <- p2_profile_id (bigint)
--   chip_results.p1_player_id             <- p1_profile_id (bigint)
--   chip_results.p2_player_id             <- p2_profile_id (bigint)

-- ── 1. Add nullable columns (idempotent) ─────────────────────────────────────
alter table public.tournament_players      add column if not exists player_uuid       uuid;
alter table public.tournament_team_members add column if not exists player_uuid       uuid;
alter table public.tournament_teams        add column if not exists captain_player_id uuid;
alter table public.chip_entries            add column if not exists p1_player_id       uuid;
alter table public.chip_entries            add column if not exists p2_player_id       uuid;
alter table public.chip_results            add column if not exists p1_player_id       uuid;
alter table public.chip_results            add column if not exists p2_player_id       uuid;

comment on column public.tournament_players.player_uuid is
  'Phase 3: new FK to players(id), backfilled from legacy player_id (id_auto). Legacy column retained until Phase 7. Becomes authoritative at the Phase 4 authorization cutover.';
comment on column public.tournament_teams.captain_player_id is
  'Phase 3: competitive identity of the captain -> players(id), from legacy captain_id. Administrative ownership (managed_by_profile_id) intentionally deferred until a pending/account-less captain requires it.';

-- ── 2. Foreign keys (guarded so the migration is rerunnable) ─────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_players_player_uuid_fkey') then
    alter table public.tournament_players
      add constraint tournament_players_player_uuid_fkey
      foreign key (player_uuid) references public.players(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_team_members_player_uuid_fkey') then
    alter table public.tournament_team_members
      add constraint tournament_team_members_player_uuid_fkey
      foreign key (player_uuid) references public.players(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_teams_captain_player_id_fkey') then
    alter table public.tournament_teams
      add constraint tournament_teams_captain_player_id_fkey
      foreign key (captain_player_id) references public.players(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chip_entries_p1_player_id_fkey') then
    alter table public.chip_entries
      add constraint chip_entries_p1_player_id_fkey
      foreign key (p1_player_id) references public.players(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chip_entries_p2_player_id_fkey') then
    alter table public.chip_entries
      add constraint chip_entries_p2_player_id_fkey
      foreign key (p2_player_id) references public.players(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chip_results_p1_player_id_fkey') then
    alter table public.chip_results
      add constraint chip_results_p1_player_id_fkey
      foreign key (p1_player_id) references public.players(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chip_results_p2_player_id_fkey') then
    alter table public.chip_results
      add constraint chip_results_p2_player_id_fkey
      foreign key (p2_player_id) references public.players(id) on delete set null;
  end if;
end $$;

-- ── 3. Backfill (idempotent — only fills rows still NULL) ─────────────────────
-- Map: legacy id_auto -> profiles.id_auto -> profiles.id -> players.profile_id -> players.id
update public.tournament_players tp
   set player_uuid = pl.id
  from public.players pl
  join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = tp.player_id and tp.player_id is not null and tp.player_uuid is null;

update public.tournament_team_members m
   set player_uuid = pl.id
  from public.players pl
  join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = m.player_id and m.player_id is not null and m.player_uuid is null;

update public.tournament_teams t
   set captain_player_id = pl.id
  from public.players pl
  join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = t.captain_id and t.captain_id is not null and t.captain_player_id is null;

update public.chip_entries e
   set p1_player_id = pl.id
  from public.players pl
  join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = e.p1_profile_id and e.p1_profile_id is not null and e.p1_player_id is null;

update public.chip_entries e
   set p2_player_id = pl.id
  from public.players pl
  join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = e.p2_profile_id and e.p2_profile_id is not null and e.p2_player_id is null;

update public.chip_results r
   set p1_player_id = pl.id
  from public.players pl
  join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = r.p1_profile_id and r.p1_profile_id is not null and r.p1_player_id is null;

update public.chip_results r
   set p2_player_id = pl.id
  from public.players pl
  join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = r.p2_profile_id and r.p2_profile_id is not null and r.p2_player_id is null;

-- ── 4. Indexes (idempotent) — mirror the legacy id_auto indexes on the new cols ─
create index if not exists tournament_players_player_uuid_idx
  on public.tournament_players (player_uuid);
create unique index if not exists tournament_players_unique_real_player_uuid
  on public.tournament_players (tournament_id, player_uuid) where player_uuid is not null;

create index if not exists tt_members_player_uuid_idx
  on public.tournament_team_members (player_uuid);
create unique index if not exists tt_members_one_active_player_uuid
  on public.tournament_team_members (tournament_id, player_uuid)
  where player_uuid is not null and invite_status <> 'declined';

create index if not exists tournament_teams_captain_player_id_idx
  on public.tournament_teams (captain_player_id);

create index if not exists chip_entries_p1_player_id_idx on public.chip_entries (p1_player_id);
create index if not exists chip_entries_p2_player_id_idx on public.chip_entries (p2_player_id);
create index if not exists chip_results_p1_player_id_idx on public.chip_results (p1_player_id);
create index if not exists chip_results_p2_player_id_idx on public.chip_results (p2_player_id);
