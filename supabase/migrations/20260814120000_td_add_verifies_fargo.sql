-- 20260814120000_td_add_verifies_fargo.sql
-- Fargo-at-add verification (Singles + Doubles). A Fargo entered by a TD/admin is
-- TRUSTED: it becomes the player's CURRENT verified Fargo across Compete, not just a
-- tournament snapshot. Applied atomically with the add/verify action, gated on
-- tournament management, and recording the acting verifier + timestamp.
--
-- Durable home for a PENDING identity's rating: players.fargo (+ verification meta).
-- `players` is the competitive-identity table (may have no profiles row yet), so a
-- pending player's TD-verified Fargo lives there and is promoted to profiles.fargo at
-- CLAIM time — never relying only on the denormalized chip_entries value.
--
-- Promotion target (public._promote_verified_fargo):
--   * linked account  -> profiles.fargo / fargo_status='verified' / fargo_verified_by / fargo_last_verified_at
--   * pending player  -> players.fargo  / same four verification columns
-- Self-registration paths are NOT touched here, so a player's OWN self-entered Fargo
-- stays UNVERIFIED until a TD confirms it (confirm_team_member_fargo / approve).
--
-- Does NOT change account_status, players.id, or player identity.

-- ── 1. players: durable verified-Fargo columns for pending identities ─────────────
alter table public.players add column if not exists fargo                  int;
alter table public.players add column if not exists fargo_status           text not null default 'unverified';
alter table public.players add column if not exists fargo_verified_by      bigint;
alter table public.players add column if not exists fargo_last_verified_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'players_fargo_status_chk') then
    alter table public.players
      add constraint players_fargo_status_chk check (fargo_status in ('unverified', 'verified'));
  end if;
end $$;

comment on column public.players.fargo is
  'Verified Fargo for a PENDING identity (no profiles row yet). Set by a TD/admin; promoted to profiles.fargo at claim. For ACTIVE players the profile remains the source of truth.';

-- ── 2. internal promotion helper (no authz of its own — only called by the ──────────
--       already-authorized td_* / verify RPCs below; not client-callable) ───────────
create or replace function public._promote_verified_fargo(p_player_id uuid, p_fargo int)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile uuid;
  v_caller  bigint;
begin
  if p_fargo is null then return; end if;               -- blank Fargo -> nothing to verify
  select id_auto  into v_caller  from public.profiles where id = auth.uid();
  select profile_id into v_profile from public.players where id = p_player_id;
  if v_profile is not null then
    -- Linked account: the global verified Fargo lives on the profile.
    update public.profiles
       set fargo = p_fargo,
           fargo_status = 'verified',
           fargo_last_verified_at = now(),
           fargo_verified_by = v_caller
     where id = v_profile;
  else
    -- Pending identity: hold the verified Fargo on the player row until claim.
    update public.players
       set fargo = p_fargo,
           fargo_status = 'verified',
           fargo_last_verified_at = now(),
           fargo_verified_by = v_caller
     where id = p_player_id;
  end if;
end;
$$;
revoke all on function public._promote_verified_fargo(uuid, int) from public, anon, authenticated;

comment on function public._promote_verified_fargo(uuid, int) is
  'Internal: promote a TD-entered Fargo to the player''s global verified rating — profiles.fargo (linked) or players.fargo (pending) — recording verifier + timestamp. Called only by authorized td_* RPCs; never granted to clients.';

-- ── 3. Singles chip path: verify a chip player''s Fargo (tournament-gated) ──────────
--       The tournament snapshot for chip singles is the chip_entries.p1_fargo written
--       by the engine; this RPC handles the GLOBAL/identity promotion + verifier record.
create or replace function public.td_verify_player_fargo(
  p_tournament_id bigint,
  p_player_id     uuid,
  p_fargo         int
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to verify Fargo for this tournament';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Player not found';
  end if;
  perform public._promote_verified_fargo(p_player_id, p_fargo);
end;
$$;
revoke all on function public.td_verify_player_fargo(bigint, uuid, int) from public, anon;
grant execute on function public.td_verify_player_fargo(bigint, uuid, int) to authenticated;

comment on function public.td_verify_player_fargo(bigint, uuid, int) is
  'Phase 5: TD/admin marks a chip Singles player''s TD-entered Fargo as verified — promotes to profiles.fargo (linked) or players.fargo (pending). Manager-gated; records verifier + timestamp. Does not change account_status or identity.';

-- ── 4. Doubles: TD create/add records the verified snapshot + global promotion ──────
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

  -- TD-entered Fargo is verified at add time: freeze the per-event snapshot (roster
  -- derives fargo_verified from fargo_at_registration); NULL when the TD left it blank.
  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, player_uuid, role, invite_status,
     is_verified, suggested_fargo, fargo_at_registration)
  values
    (v_team, p_tournament_id, v_id_auto, p_captain_player_id, 'captain', 'accepted',
     (p_fargo is not null), p_fargo, p_fargo);

  -- Global promotion (profiles if linked, players if pending). No-op when blank.
  perform public._promote_verified_fargo(p_captain_player_id, p_fargo);

  return v_team;
end;
$$;

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
    (team_id, tournament_id, player_id, player_uuid, role, invite_status,
     is_verified, suggested_fargo, fargo_at_registration)
  values
    (p_team_id, v_tid, v_id_auto, p_player_id, 'member', 'accepted',
     (p_fargo is not null), p_fargo, p_fargo);

  perform public._promote_verified_fargo(p_player_id, p_fargo);

  update public.tournament_teams set approved = false, locked = true, updated_at = now() where id = p_team_id;
  perform public._recompute_team_status(p_team_id);
end;
$$;

-- ── 5. Claim: promote a pending identity''s verified Fargo onto the new profile ─────
--       Rewrites _ensure_player_for_user's PENDING-claim branch to copy players.fargo
--       (preserving the original verifier + timestamp) into profiles on activation.
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

  -- Preserve the TD-verified Fargo captured while PENDING: promote it to the profile
  -- (keeping the original verifier + timestamp). Only when the pending row carried one,
  -- and never overwrite an already-verified profile Fargo that is NEWER than the pending
  -- one (idempotent: a second run finds equal timestamps + verified status → no-op).
  update public.profiles p
     set fargo = pl.fargo,
         fargo_status = 'verified',
         fargo_verified_by = pl.fargo_verified_by,
         fargo_last_verified_at = coalesce(pl.fargo_last_verified_at, now())
  from public.players pl
  where p.id = p_uid
    and pl.id = v_player
    and pl.fargo is not null
    and (
      p.fargo_status is distinct from 'verified'
      or coalesce(pl.fargo_last_verified_at, 'epoch'::timestamptz)
         > coalesce(p.fargo_last_verified_at, 'epoch'::timestamptz)
    );

  update public.player_invitations
     set accepted_at = now()
   where player_id = v_player and accepted_at is null and superseded_at is null and revoked_at is null;

  return v_player;
exception when unique_violation then
  select id into v_player from public.players where profile_id = p_uid;
  return v_player;
end;
$$;
