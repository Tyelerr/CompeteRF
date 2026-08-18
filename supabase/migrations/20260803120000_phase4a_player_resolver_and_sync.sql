-- 20260803120000_phase4a_player_resolver_and_sync.sql
-- Phase 4A of the Players / Pending Accounts migration (authorization cutover prep).
-- See PENDING_ACCOUNTS_MIGRATION.md (§K).
--
-- ADDITIVE, ZERO behavior change to existing authz/app. Adds:
--   1. current_player_id()          - resolver auth.uid() -> players.id (used by Phase 4C authz)
--   2. map_id_auto_to_player(bigint)- helper: legacy id_auto -> players.id
--   3. BEFORE INSERT/UPDATE sync triggers on the 5 competitor tables that keep the
--      new *_player_id columns in sync with the legacy id_auto columns
--   4. an idempotent catch-up backfill for rows created/changed since Phase 3
--
-- This migration does NOT touch any RLS policy, RPC authorization branch, grant on
-- an existing table, or application code. The two helpers are created now but are
-- not referenced by any policy until Phase 4C.
--
-- Trigger semantics (recommended; see §K design notes). For each (legacy, new) pair:
--   INSERT:  fill `new` when it is NULL and legacy is non-NULL; if BOTH are supplied
--            but inconsistent, RAISE (never silently accept a conflict); an explicit
--            `new` with NULL legacy (a pending player) is left untouched.
--   UPDATE:  if the legacy column CHANGED and `new` was NOT set in the same statement,
--            follow legacy (re-sync on reassignment; NULL on removal) — this only ever
--            rewrites an auto-derived value, never an explicitly-set one; else fill if
--            still NULL; else RAISE on an explicit inconsistency. If legacy is unchanged,
--            `new` is never touched (protects pending rows whose legacy stays NULL).

-- ── 1. Resolver + mapping helpers (SECURITY DEFINER to bypass players/profiles RLS) ──
create or replace function public.current_player_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  -- The caller's own player. Returns NULL (never raises) when the caller has no
  -- linked player (anon, service_role, or an unlinked account) so authz simply
  -- does not match the player branch rather than erroring.
  select id from public.players where profile_id = auth.uid() limit 1
$$;

create or replace function public.map_id_auto_to_player(p_id_auto bigint)
  returns uuid
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  select pl.id
  from public.players pl
  join public.profiles pr on pr.id = pl.profile_id
  where pr.id_auto = p_id_auto
  limit 1
$$;

revoke all on function public.current_player_id()           from public;
revoke all on function public.map_id_auto_to_player(bigint) from public;
grant execute on function public.current_player_id()           to anon, authenticated, service_role;
grant execute on function public.map_id_auto_to_player(bigint) to anon, authenticated, service_role;

comment on function public.current_player_id() is
  'Phase 4A: resolver auth.uid() -> profiles.id -> players.profile_id -> players.id. SECURITY DEFINER (bypasses players RLS). Returns NULL when the caller has no linked player. Used by Phase 4C authz.';
comment on function public.map_id_auto_to_player(bigint) is
  'Phase 4A: maps a legacy profiles.id_auto to its players.id (via players.profile_id). SECURITY DEFINER. Used by the sync triggers + catch-up backfill.';

-- ── 2. Sync trigger functions (one per table; chip functions handle both pairs) ──
create or replace function public.tg_sync_tp_player_uuid()
  returns trigger language plpgsql as $$
declare v_d uuid;
begin
  v_d := public.map_id_auto_to_player(new.player_id);
  if tg_op = 'UPDATE' then
    if new.player_id is distinct from old.player_id
       and new.player_uuid is not distinct from old.player_uuid then
      new.player_uuid := v_d;
    elsif new.player_uuid is null and new.player_id is not null then
      new.player_uuid := v_d;
    elsif new.player_uuid is not null and new.player_id is not null
          and new.player_uuid is distinct from v_d then
      raise exception 'players sync: tournament_players.player_uuid (%) conflicts with player_id (%)', new.player_uuid, new.player_id;
    end if;
  else
    if new.player_uuid is null and new.player_id is not null then
      new.player_uuid := v_d;
    elsif new.player_uuid is not null and new.player_id is not null
          and new.player_uuid is distinct from v_d then
      raise exception 'players sync: tournament_players.player_uuid (%) conflicts with player_id (%)', new.player_uuid, new.player_id;
    end if;
  end if;
  return new;
end $$;

create or replace function public.tg_sync_ttm_player_uuid()
  returns trigger language plpgsql as $$
declare v_d uuid;
begin
  v_d := public.map_id_auto_to_player(new.player_id);
  if tg_op = 'UPDATE' then
    if new.player_id is distinct from old.player_id
       and new.player_uuid is not distinct from old.player_uuid then
      new.player_uuid := v_d;
    elsif new.player_uuid is null and new.player_id is not null then
      new.player_uuid := v_d;
    elsif new.player_uuid is not null and new.player_id is not null
          and new.player_uuid is distinct from v_d then
      raise exception 'players sync: tournament_team_members.player_uuid (%) conflicts with player_id (%)', new.player_uuid, new.player_id;
    end if;
  else
    if new.player_uuid is null and new.player_id is not null then
      new.player_uuid := v_d;
    elsif new.player_uuid is not null and new.player_id is not null
          and new.player_uuid is distinct from v_d then
      raise exception 'players sync: tournament_team_members.player_uuid (%) conflicts with player_id (%)', new.player_uuid, new.player_id;
    end if;
  end if;
  return new;
end $$;

create or replace function public.tg_sync_tt_captain_player_id()
  returns trigger language plpgsql as $$
declare v_d uuid;
begin
  v_d := public.map_id_auto_to_player(new.captain_id);
  if tg_op = 'UPDATE' then
    if new.captain_id is distinct from old.captain_id
       and new.captain_player_id is not distinct from old.captain_player_id then
      new.captain_player_id := v_d;
    elsif new.captain_player_id is null and new.captain_id is not null then
      new.captain_player_id := v_d;
    elsif new.captain_player_id is not null and new.captain_id is not null
          and new.captain_player_id is distinct from v_d then
      raise exception 'players sync: tournament_teams.captain_player_id (%) conflicts with captain_id (%)', new.captain_player_id, new.captain_id;
    end if;
  else
    if new.captain_player_id is null and new.captain_id is not null then
      new.captain_player_id := v_d;
    elsif new.captain_player_id is not null and new.captain_id is not null
          and new.captain_player_id is distinct from v_d then
      raise exception 'players sync: tournament_teams.captain_player_id (%) conflicts with captain_id (%)', new.captain_player_id, new.captain_id;
    end if;
  end if;
  return new;
end $$;

create or replace function public.tg_sync_chip_entries_players()
  returns trigger language plpgsql as $$
declare v_d1 uuid; v_d2 uuid;
begin
  v_d1 := public.map_id_auto_to_player(new.p1_profile_id);
  v_d2 := public.map_id_auto_to_player(new.p2_profile_id);
  -- p1
  if tg_op = 'UPDATE' then
    if new.p1_profile_id is distinct from old.p1_profile_id and new.p1_player_id is not distinct from old.p1_player_id then
      new.p1_player_id := v_d1;
    elsif new.p1_player_id is null and new.p1_profile_id is not null then
      new.p1_player_id := v_d1;
    elsif new.p1_player_id is not null and new.p1_profile_id is not null and new.p1_player_id is distinct from v_d1 then
      raise exception 'players sync: chip_entries.p1_player_id (%) conflicts with p1_profile_id (%)', new.p1_player_id, new.p1_profile_id;
    end if;
  else
    if new.p1_player_id is null and new.p1_profile_id is not null then
      new.p1_player_id := v_d1;
    elsif new.p1_player_id is not null and new.p1_profile_id is not null and new.p1_player_id is distinct from v_d1 then
      raise exception 'players sync: chip_entries.p1_player_id (%) conflicts with p1_profile_id (%)', new.p1_player_id, new.p1_profile_id;
    end if;
  end if;
  -- p2
  if tg_op = 'UPDATE' then
    if new.p2_profile_id is distinct from old.p2_profile_id and new.p2_player_id is not distinct from old.p2_player_id then
      new.p2_player_id := v_d2;
    elsif new.p2_player_id is null and new.p2_profile_id is not null then
      new.p2_player_id := v_d2;
    elsif new.p2_player_id is not null and new.p2_profile_id is not null and new.p2_player_id is distinct from v_d2 then
      raise exception 'players sync: chip_entries.p2_player_id (%) conflicts with p2_profile_id (%)', new.p2_player_id, new.p2_profile_id;
    end if;
  else
    if new.p2_player_id is null and new.p2_profile_id is not null then
      new.p2_player_id := v_d2;
    elsif new.p2_player_id is not null and new.p2_profile_id is not null and new.p2_player_id is distinct from v_d2 then
      raise exception 'players sync: chip_entries.p2_player_id (%) conflicts with p2_profile_id (%)', new.p2_player_id, new.p2_profile_id;
    end if;
  end if;
  return new;
end $$;

create or replace function public.tg_sync_chip_results_players()
  returns trigger language plpgsql as $$
declare v_d1 uuid; v_d2 uuid;
begin
  v_d1 := public.map_id_auto_to_player(new.p1_profile_id);
  v_d2 := public.map_id_auto_to_player(new.p2_profile_id);
  if tg_op = 'UPDATE' then
    if new.p1_profile_id is distinct from old.p1_profile_id and new.p1_player_id is not distinct from old.p1_player_id then
      new.p1_player_id := v_d1;
    elsif new.p1_player_id is null and new.p1_profile_id is not null then
      new.p1_player_id := v_d1;
    elsif new.p1_player_id is not null and new.p1_profile_id is not null and new.p1_player_id is distinct from v_d1 then
      raise exception 'players sync: chip_results.p1_player_id (%) conflicts with p1_profile_id (%)', new.p1_player_id, new.p1_profile_id;
    end if;
  else
    if new.p1_player_id is null and new.p1_profile_id is not null then
      new.p1_player_id := v_d1;
    elsif new.p1_player_id is not null and new.p1_profile_id is not null and new.p1_player_id is distinct from v_d1 then
      raise exception 'players sync: chip_results.p1_player_id (%) conflicts with p1_profile_id (%)', new.p1_player_id, new.p1_profile_id;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.p2_profile_id is distinct from old.p2_profile_id and new.p2_player_id is not distinct from old.p2_player_id then
      new.p2_player_id := v_d2;
    elsif new.p2_player_id is null and new.p2_profile_id is not null then
      new.p2_player_id := v_d2;
    elsif new.p2_player_id is not null and new.p2_profile_id is not null and new.p2_player_id is distinct from v_d2 then
      raise exception 'players sync: chip_results.p2_player_id (%) conflicts with p2_profile_id (%)', new.p2_player_id, new.p2_profile_id;
    end if;
  else
    if new.p2_player_id is null and new.p2_profile_id is not null then
      new.p2_player_id := v_d2;
    elsif new.p2_player_id is not null and new.p2_profile_id is not null and new.p2_player_id is distinct from v_d2 then
      raise exception 'players sync: chip_results.p2_player_id (%) conflicts with p2_profile_id (%)', new.p2_player_id, new.p2_profile_id;
    end if;
  end if;
  return new;
end $$;

-- ── 3. Triggers (create-or-replace = rerunnable; fire on any INSERT/UPDATE) ──
create or replace trigger tp_sync_player_uuid
  before insert or update on public.tournament_players
  for each row execute function public.tg_sync_tp_player_uuid();
create or replace trigger ttm_sync_player_uuid
  before insert or update on public.tournament_team_members
  for each row execute function public.tg_sync_ttm_player_uuid();
create or replace trigger tt_sync_captain_player_id
  before insert or update on public.tournament_teams
  for each row execute function public.tg_sync_tt_captain_player_id();
create or replace trigger chip_entries_sync_players
  before insert or update on public.chip_entries
  for each row execute function public.tg_sync_chip_entries_players();
create or replace trigger chip_results_sync_players
  before insert or update on public.chip_results
  for each row execute function public.tg_sync_chip_results_players();

-- ── 4. Catch-up backfill (idempotent; fills any row created/changed since Phase 3) ──
update public.tournament_players tp set player_uuid = pl.id
  from public.players pl join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = tp.player_id and tp.player_id is not null and tp.player_uuid is null;

update public.tournament_team_members m set player_uuid = pl.id
  from public.players pl join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = m.player_id and m.player_id is not null and m.player_uuid is null;

update public.tournament_teams t set captain_player_id = pl.id
  from public.players pl join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = t.captain_id and t.captain_id is not null and t.captain_player_id is null;

update public.chip_entries e set p1_player_id = pl.id
  from public.players pl join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = e.p1_profile_id and e.p1_profile_id is not null and e.p1_player_id is null;

update public.chip_entries e set p2_player_id = pl.id
  from public.players pl join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = e.p2_profile_id and e.p2_profile_id is not null and e.p2_player_id is null;

update public.chip_results r set p1_player_id = pl.id
  from public.players pl join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = r.p1_profile_id and r.p1_profile_id is not null and r.p1_player_id is null;

update public.chip_results r set p2_player_id = pl.id
  from public.players pl join public.profiles pr on pr.id = pl.profile_id
 where pr.id_auto = r.p2_profile_id and r.p2_profile_id is not null and r.p2_player_id is null;
