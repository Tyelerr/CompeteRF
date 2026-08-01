-- 20260814120000_td_add_verifies_fargo_rollback.sql
-- Rollback for 20260814120000_td_add_verifies_fargo.sql. Restores td_create_team_by_uuid,
-- td_add_team_member_by_uuid and _ensure_player_for_user to their prior bodies, drops the
-- new helper/RPC, and removes the players Fargo columns. Run by hand only if reverting.
-- (Revert app code that calls td_verify_player_fargo BEFORE running this.)

drop function if exists public.td_verify_player_fargo(bigint, uuid, int);

-- Restore td_create_team_by_uuid (original: is_verified=false, suggested_fargo only).
create or replace function public.td_create_team_by_uuid(
  p_tournament_id     bigint,
  p_captain_player_id uuid,
  p_fargo             int
)
  returns bigint
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile_id uuid;
  v_status     text;
  v_id_auto    bigint;
  v_team       bigint;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to add teams for this tournament';
  end if;

  select profile_id, account_status into v_profile_id, v_status
  from public.players where id = p_captain_player_id;
  if not found then raise exception 'Player not found'; end if;
  if v_status = 'DISABLED' then raise exception 'Cannot add a disabled player'; end if;
  if v_profile_id is not null then
    select id_auto into v_id_auto from public.profiles where id = v_profile_id;
  end if;

  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = p_tournament_id
      and m.player_uuid = p_captain_player_id
      and m.invite_status <> 'declined'
  ) then
    raise exception 'That player is already on a team for this tournament';
  end if;

  insert into public.tournament_teams
    (tournament_id, captain_id, captain_player_id, managed_by_profile_id, status)
  values
    (p_tournament_id, v_id_auto, p_captain_player_id, auth.uid(), 'pending_partner')
  returning id into v_team;

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, player_uuid, role, invite_status, is_verified, suggested_fargo)
  values
    (v_team, p_tournament_id, v_id_auto, p_captain_player_id, 'captain', 'accepted', false, p_fargo);

  return v_team;
end;
$$;

-- Restore td_add_team_member_by_uuid (original).
create or replace function public.td_add_team_member_by_uuid(
  p_team_id   bigint,
  p_player_id uuid,
  p_fargo     int
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_tid        bigint;
  v_profile_id uuid;
  v_status     text;
  v_id_auto    bigint;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  if not public.can_manage_tournament(v_tid) then
    raise exception 'Not authorized to edit teams for this tournament';
  end if;

  select profile_id, account_status into v_profile_id, v_status
  from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;
  if v_status = 'DISABLED' then raise exception 'Cannot add a disabled player'; end if;
  if v_profile_id is not null then
    select id_auto into v_id_auto from public.profiles where id = v_profile_id;
  end if;

  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = v_tid
      and m.player_uuid = p_player_id
      and m.invite_status <> 'declined'
  ) then
    raise exception 'That player is already on a team for this tournament';
  end if;

  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';
  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, player_uuid, role, invite_status, is_verified, suggested_fargo)
  values
    (p_team_id, v_tid, v_id_auto, p_player_id, 'member', 'accepted', false, p_fargo);

  update public.tournament_teams set approved = false, locked = true, updated_at = now() where id = p_team_id;
  perform public._recompute_team_status(p_team_id);
end;
$$;

-- Restore _ensure_player_for_user (original: no Fargo promotion at claim).
create or replace function public._ensure_player_for_user(p_uid uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_player      uuid;
  v_owner       uuid;
  v_email       text;
  v_verified    timestamptz;
  v_norm        text;
  v_has_profile boolean := false;
  v_name        text;
  v_first       text;
  v_last        text;
  v_phone       text;
begin
  if p_uid is null then return null; end if;

  select id into v_player from public.players where profile_id = p_uid;
  if v_player is not null then return v_player; end if;

  select u.email, u.email_confirmed_at into v_email, v_verified
  from auth.users u where u.id = p_uid;
  if v_email is null then return null; end if;
  v_norm := lower(btrim(v_email));

  select true, pr.name, pr.first_name, pr.last_name, pr.phone_number
    into v_has_profile, v_name, v_first, v_last, v_phone
  from public.profiles pr where pr.id = p_uid;

  select pl.id, pl.profile_id into v_player, v_owner
  from public.players pl where pl.email_normalized = v_norm;

  if v_player is null then
    if not v_has_profile then return null; end if;
    insert into public.players
      (display_name, first_name, last_name, email, phone_e164, account_status, profile_id, activated_at)
    values
      (coalesce(nullif(v_name, ''), nullif(btrim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')), ''), v_email),
       v_first, v_last, v_email, v_phone, 'ACTIVE', p_uid, now())
    returning id into v_player;
    return v_player;
  end if;

  if v_owner is not null then
    if v_owner = p_uid then return v_player; end if;
    return null;
  end if;

  if v_verified is null then return null; end if;
  if not v_has_profile then return null; end if;

  update public.players
     set profile_id = p_uid, account_status = 'ACTIVE', activated_at = coalesce(activated_at, now())
   where id = v_player and profile_id is null;

  update public.player_invitations
     set accepted_at = now()
   where player_id = v_player and accepted_at is null and superseded_at is null and revoked_at is null;

  return v_player;
exception when unique_violation then
  select id into v_player from public.players where profile_id = p_uid;
  return v_player;
end;
$$;

drop function if exists public._promote_verified_fargo(uuid, int);

alter table public.players drop column if exists fargo_last_verified_at;
alter table public.players drop column if exists fargo_verified_by;
alter table public.players drop column if exists fargo_status;
alter table public.players drop column if exists fargo;
