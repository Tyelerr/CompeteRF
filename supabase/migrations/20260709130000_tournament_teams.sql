-- supabase/migrations/20260709130000_tournament_teams.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Team registration for team formats (Scotch Doubles now; generalizes to 3-/
-- N-person later via team_size + N member rows). A captain creates a team and
-- invites a partner by username / email (→ a real account, in-app pending
-- invite) or by phone / anything unmatched (→ a temporary UNVERIFIED partner the
-- TD confirms). No public player browsing — you invite a specific contact.
--
-- Rules that MUST hold server-side (so they can't be bypassed) live in the RPCs
-- below, which run SECURITY DEFINER:
--   • a player is on at most ONE active team per tournament
--   • email lookup + writing another user's invite row need elevated rights
--   • only the captain may invite / change / cancel the partner
--   • a team locks once the partner accepts (TD can unlock later)
--
-- Fargo: a member's Fargo stays account-owned + TD-confirmed (see
-- 20260709120000_fargo_verification). `suggested_fargo` is only a hint entered
-- at registration; `fargo_at_registration` is the TD-confirmed per-event snapshot.
-- player_id / captain_id are FKs to profiles.id_auto (so PostgREST can embed the
-- linked profile in reads).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tournament_teams (
  id            bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  captain_id    bigint not null references public.profiles(id_auto) on delete cascade,
  name          text,                                  -- optional; UI derives "A / B"
  status        text   not null default 'pending_partner', -- pending_partner|registered|unverified
  team_size     int    not null default 2,
  locked        boolean not null default false,        -- true once the partner accepts
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tournament_teams_tid on public.tournament_teams(tournament_id);
create index if not exists tournament_teams_captain on public.tournament_teams(captain_id);

create table if not exists public.tournament_team_members (
  id            bigint generated always as identity primary key,
  team_id       bigint not null references public.tournament_teams(id) on delete cascade,
  tournament_id bigint not null references public.tournaments(id) on delete cascade, -- denormalized
  player_id     bigint references public.profiles(id_auto) on delete set null, -- null for a temp partner
  role          text   not null default 'member',      -- captain|member
  invite_status text   not null default 'pending',     -- pending|accepted|declined
  invite_method text,                                  -- username|email|phone
  invite_value  text,                                  -- the raw contact used
  temp_name     text,                                  -- non-account partner name
  suggested_fargo int,                                 -- hint entered at registration
  is_verified   boolean not null default false,        -- true = real account, accepted
  fargo_at_registration int,                           -- TD-confirmed per-event snapshot
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tt_members_team on public.tournament_team_members(team_id);
create index if not exists tt_members_tid on public.tournament_team_members(tournament_id);
create index if not exists tt_members_player on public.tournament_team_members(player_id);

-- A player can hold at most one ACTIVE (non-declined) member slot per tournament.
create unique index if not exists tt_members_one_active_per_tournament
  on public.tournament_team_members(tournament_id, player_id)
  where player_id is not null and invite_status <> 'declined';

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Teams are readable (roster); member rows carry contact info so they're limited
-- to the people involved (captain / the member themselves / the TD or an admin).
-- ALL writes go through the SECURITY DEFINER RPCs below — no direct write policy.
alter table public.tournament_teams enable row level security;
alter table public.tournament_team_members enable row level security;

drop policy if exists tt_read on public.tournament_teams;
create policy tt_read on public.tournament_teams for select using (true);

drop policy if exists ttm_read on public.tournament_team_members;
create policy ttm_read on public.tournament_team_members for select using (
  player_id = (select id_auto from public.profiles where id = auth.uid())
  or exists (
    select 1 from public.tournament_teams t
    where t.id = team_id
      and t.captain_id = (select id_auto from public.profiles where id = auth.uid())
  )
  or exists (
    select 1 from public.tournaments tt
    where tt.id = tournament_id
      and (
        tt.director_id = (select id_auto from public.profiles where id = auth.uid())
        or (select role from public.profiles where id = auth.uid())
             in ('compete_admin', 'super_admin')
      )
  )
);

-- ── Helpers ───────────────────────────────────────────────────────────────────
create or replace function public._team_caller()
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select id_auto from public.profiles where id = auth.uid();
$$;

-- Recompute a team's status from its member rows.
create or replace function public._recompute_team_status(p_team_id bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.tournament_teams t
  set status = case
    when exists (
      select 1 from public.tournament_team_members m
      where m.team_id = t.id and m.invite_status = 'pending'
    ) then 'pending_partner'
    when exists (
      select 1 from public.tournament_team_members m
      where m.team_id = t.id and m.invite_status = 'accepted' and m.is_verified = false
    ) then 'unverified'
    when (select count(*) from public.tournament_team_members m
          where m.team_id = t.id and m.invite_status = 'accepted') >= t.team_size
      then 'registered'
    else 'pending_partner'
  end,
  updated_at = now()
  where t.id = p_team_id;
end; $$;

-- ── RPCs ──────────────────────────────────────────────────────────────────────

-- Create a team; the caller becomes captain. p_captain_fargo is a hint the TD
-- confirms later. Fails if the caller is already on a team for this tournament.
create or replace function public.create_team(
  p_tournament_id bigint,
  p_captain_fargo int
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caller bigint; v_team bigint;
begin
  v_caller := public._team_caller();
  if v_caller is null then raise exception 'You must be signed in to register a team'; end if;

  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = p_tournament_id
      and m.player_id = v_caller
      and m.invite_status <> 'declined'
  ) then
    raise exception 'You are already on a team for this tournament';
  end if;

  insert into public.tournament_teams (tournament_id, captain_id, status)
  values (p_tournament_id, v_caller, 'pending_partner')
  returning id into v_team;

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (v_team, p_tournament_id, v_caller, 'captain', 'accepted', true, p_captain_fargo);

  return v_team;
end; $$;

-- Invite (or replace) the partner. username/email resolve to a real account and
-- create a PENDING in-app invite; phone or an unmatched value creates a TEMP
-- (unverified) partner from p_temp_name/p_temp_fargo. Captain-only. Enforces the
-- one-team-per-tournament rule against the invited account.
create or replace function public.invite_team_partner(
  p_team_id    bigint,
  p_method     text,
  p_value      text,
  p_temp_name  text,
  p_temp_fargo int
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caller bigint; v_tid bigint; v_captain bigint; v_locked boolean; v_target bigint;
begin
  v_caller := public._team_caller();
  select tournament_id, captain_id, locked into v_tid, v_captain, v_locked
  from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can invite a partner'; end if;
  if v_locked then raise exception 'This team is locked — ask the director to unlock it to change the partner'; end if;

  if p_method = 'username' then
    select id_auto into v_target from public.profiles where lower(user_name) = lower(p_value);
  elsif p_method = 'email' then
    select id_auto into v_target from public.profiles where lower(email) = lower(p_value);
  else
    v_target := null; -- phone / other → temp partner
  end if;

  if v_target is not null then
    if v_target = v_caller then raise exception 'You cannot invite yourself'; end if;
    if exists (
      select 1 from public.tournament_team_members m
      where m.tournament_id = v_tid and m.player_id = v_target and m.invite_status <> 'declined'
    ) then
      raise exception 'That player is already on a team for this tournament';
    end if;
  elsif coalesce(p_temp_name, '') = '' then
    raise exception 'No account matched that %. Add a partner name to register them as an unverified partner.', p_method;
  end if;

  -- one partner slot: clear any existing non-captain member first
  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';

  if v_target is not null then
    insert into public.tournament_team_members
      (team_id, tournament_id, player_id, role, invite_status, invite_method, invite_value, is_verified)
    values (p_team_id, v_tid, v_target, 'member', 'pending', p_method, p_value, false);
  else
    insert into public.tournament_team_members
      (team_id, tournament_id, role, invite_status, invite_method, invite_value, temp_name, suggested_fargo, is_verified)
    values (p_team_id, v_tid, 'member', 'accepted', p_method, p_value, p_temp_name, p_temp_fargo, false);
  end if;

  perform public._recompute_team_status(p_team_id);
end; $$;

-- The invited player accepts or declines. Accept locks the team & marks the
-- member verified; decline frees the slot (team returns to pending_partner).
create or replace function public.respond_to_team_invite(
  p_team_id bigint,
  p_accept  boolean
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caller bigint; v_tid bigint; v_mid bigint;
begin
  v_caller := public._team_caller();
  select id, tournament_id into v_mid, v_tid
  from public.tournament_team_members
  where team_id = p_team_id and player_id = v_caller and role = 'member';
  if v_mid is null then raise exception 'No invite found for you on this team'; end if;

  if p_accept then
    if exists (
      select 1 from public.tournament_team_members m
      where m.tournament_id = v_tid and m.player_id = v_caller
        and m.invite_status = 'accepted' and m.team_id <> p_team_id
    ) then
      raise exception 'You are already on another team for this tournament';
    end if;
    update public.tournament_team_members
      set invite_status = 'accepted', is_verified = true, updated_at = now()
      where id = v_mid;
    update public.tournament_teams set locked = true, updated_at = now() where id = p_team_id;
  else
    update public.tournament_team_members
      set invite_status = 'declined', updated_at = now()
      where id = v_mid;
  end if;

  perform public._recompute_team_status(p_team_id);
end; $$;

-- Captain clears the current partner slot (to re-invite). Blocked once locked.
create or replace function public.cancel_team_partner(p_team_id bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caller bigint; v_captain bigint; v_locked boolean;
begin
  v_caller := public._team_caller();
  select captain_id, locked into v_captain, v_locked from public.tournament_teams where id = p_team_id;
  if v_captain is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can change the partner'; end if;
  if v_locked then raise exception 'This team is locked — ask the director to unlock it'; end if;
  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';
  perform public._recompute_team_status(p_team_id);
end; $$;

-- Captain withdraws the whole team registration (cascade-deletes members).
create or replace function public.cancel_team(p_team_id bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caller bigint; v_captain bigint;
begin
  v_caller := public._team_caller();
  select captain_id into v_captain from public.tournament_teams where id = p_team_id;
  if v_captain is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can cancel the team'; end if;
  delete from public.tournament_teams where id = p_team_id;
end; $$;

-- ── Grants ────────────────────────────────────────────────────────────────────
revoke all on function public._team_caller() from public, anon;
revoke all on function public._recompute_team_status(bigint) from public, anon;
do $$
declare fn text;
begin
  foreach fn in array array[
    'create_team(bigint,int)',
    'invite_team_partner(bigint,text,text,text,int)',
    'respond_to_team_invite(bigint,boolean)',
    'cancel_team_partner(bigint)',
    'cancel_team(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon;', fn);
    execute format('grant execute on function public.%s to authenticated;', fn);
  end loop;
end $$;
