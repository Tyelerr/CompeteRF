-- supabase/rollback/20261008120000_scotch_identity_and_chip_credit_rollback.sql
-- Reverts 20261008120000: restores td_remove_team_member (captain removal deleted the team) and
-- _ensure_player_for_user (without the claim-linkage call) exactly as before, and drops the new
-- functions. The one-time backfill is NOT reverted: it only filled a NULL profile id on rows that
-- already identified the same player by players.id (correct data either way).

drop function if exists public.get_player_chip_results(bigint);
drop function if exists public.td_remove_team(bigint);

create or replace function public.td_remove_team_member(p_member_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid bigint; v_team bigint; v_mrole text; v_caller bigint; v_role text;
begin
  select tournament_id, team_id, role into v_tid, v_team, v_mrole
  from public.tournament_team_members where id = p_member_id;
  if v_tid is null then raise exception 'Team member not found'; end if;
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to edit teams for this tournament';
  end if;

  delete from public.tournament_team_members where id = p_member_id;
  if v_mrole = 'captain' then
    delete from public.tournament_teams where id = v_team; -- captain gone → team gone
  else
    update public.tournament_teams set approved = false, locked = false, updated_at = now() where id = v_team;
    perform public._recompute_team_status(v_team);
  end if;
end; $$;

revoke all on function public.td_remove_team_member(bigint) from public, anon;
grant execute on function public.td_remove_team_member(bigint) to authenticated;

CREATE OR REPLACE FUNCTION public._ensure_player_for_user(p_uid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- SELECT INTO with no row leaves v_has_profile NULL (not false), and `not NULL` never
  -- triggers the early returns below — so signup (email confirmed before the profile exists)
  -- fell through to inserting a players row for a missing profile → FK violation → Auth
  -- "Database error updating user". FOUND is true only when the profile row exists.
  v_has_profile := found;

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
$function$;

drop function if exists public._link_claimed_player_rows(uuid, uuid);
