-- supabase/migrations/20261008120000_scotch_identity_and_chip_credit.sql   (PENDING — not applied)
--
-- Scotch Doubles reliability + identity + basic Chip history credit.
--
-- 1. td_remove_team_member: removing the CAPTAIN no longer silently deletes the whole team.
--    • captain with an ACCEPTED partner → the partner is promoted to captain (member role +
--      tournament_teams.captain_id / captain_player_id); the team stays, un-approved + unlocked,
--      and its status is recomputed (it now needs a partner) — exactly like removing a partner.
--    • captain with NO accepted partner → refused with a clear message: that is "Remove Team".
--    • partner → unchanged behaviour.
-- 2. td_remove_team(p_team_id): the explicit, separately confirmed "Remove Team" (members
--    cascade). Same authorization as td_remove_team_member.
-- 3. _link_claimed_player_rows(player, uid): when a PENDING player (players.id, no account) is
--    claimed by an account, fill that account's profiles.id_auto into every row that already
--    identifies the SAME player by players.id and has no profile id yet: chip_entries (p1/p2),
--    chip_results (p1/p2), tournament_team_members, tournament_players, tournament_teams
--    (captain). Identity is the players.id uuid only — never a name. Never raises (it runs inside
--    the signup / email-confirm path): each row update is isolated and a conflict just skips.
-- 4. _ensure_player_for_user: the live definition verbatim + ONE added call to (3) right after
--    the pending player is linked to the account.
-- 5. Backfill: run (3) once for players ALREADY claimed before this migration.
-- 6. get_player_chip_results(p_player_id): a player's completed Chip results (placement, field
--    size, W-L from the durable entry row, partner/team context). One chip_results row per ENTRY,
--    so both teammates read the SAME team result; standings are never duplicated.
--
-- Rollback: supabase/rollback/20261008120000_scotch_identity_and_chip_credit_rollback.sql

-- ── 1. td_remove_team_member ───────────────────────────────────────────────────────────────
create or replace function public.td_remove_team_member(p_member_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid bigint; v_team bigint; v_mrole text; v_caller bigint; v_role text;
        v_partner_id bigint; v_partner_player bigint; v_partner_uuid uuid;
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

  if v_mrole = 'captain' then
    select m.id, m.player_id, m.player_uuid into v_partner_id, v_partner_player, v_partner_uuid
    from public.tournament_team_members m
    where m.team_id = v_team and m.id <> p_member_id and m.invite_status = 'accepted'
    order by m.created_at
    limit 1;
    if v_partner_id is null then
      raise exception 'The captain is the only player on this team. Use Remove Team to remove the whole team.';
    end if;
    delete from public.tournament_team_members where id = p_member_id;
    update public.tournament_team_members set role = 'captain', updated_at = now() where id = v_partner_id;
    update public.tournament_teams
       set captain_id = v_partner_player, captain_player_id = v_partner_uuid,
           approved = false, locked = false, updated_at = now()
     where id = v_team;
    perform public._recompute_team_status(v_team);
    return;
  end if;

  delete from public.tournament_team_members where id = p_member_id;
  update public.tournament_teams set approved = false, locked = false, updated_at = now() where id = v_team;
  perform public._recompute_team_status(v_team);
end; $$;

revoke all on function public.td_remove_team_member(bigint) from public, anon;
grant execute on function public.td_remove_team_member(bigint) to authenticated;

-- ── 2. td_remove_team ─────────────────────────────────────────────────────────────────────
create or replace function public.td_remove_team(p_team_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid bigint; v_caller bigint; v_role text;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to edit teams for this tournament';
  end if;
  delete from public.tournament_teams where id = p_team_id; -- members cascade (FK on delete cascade)
end; $$;

revoke all on function public.td_remove_team(bigint) from public, anon;
grant execute on function public.td_remove_team(bigint) to authenticated;

-- ── 3. _link_claimed_player_rows ──────────────────────────────────────────────────────────
create or replace function public._link_claimed_player_rows(p_player uuid, p_uid uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id_auto bigint; r record;
begin
  if p_player is null or p_uid is null then return; end if;
  -- Only for the account that actually owns this player record.
  if not exists (select 1 from public.players where id = p_player and profile_id = p_uid) then return; end if;
  select id_auto into v_id_auto from public.profiles where id = p_uid;
  if v_id_auto is null then return; end if;

  for r in select id from public.chip_entries where p1_player_id = p_player and p1_profile_id is null loop
    begin update public.chip_entries set p1_profile_id = v_id_auto where id = r.id; exception when others then null; end;
  end loop;
  for r in select id from public.chip_entries where p2_player_id = p_player and p2_profile_id is null loop
    begin update public.chip_entries set p2_profile_id = v_id_auto where id = r.id; exception when others then null; end;
  end loop;
  for r in select id from public.chip_results where p1_player_id = p_player and p1_profile_id is null loop
    begin update public.chip_results set p1_profile_id = v_id_auto where id = r.id; exception when others then null; end;
  end loop;
  for r in select id from public.chip_results where p2_player_id = p_player and p2_profile_id is null loop
    begin update public.chip_results set p2_profile_id = v_id_auto where id = r.id; exception when others then null; end;
  end loop;
  for r in select id from public.tournament_team_members where player_uuid = p_player and player_id is null loop
    begin update public.tournament_team_members set player_id = v_id_auto where id = r.id; exception when others then null; end;
  end loop;
  for r in select id from public.tournament_players where player_uuid = p_player and player_id is null loop
    begin update public.tournament_players set player_id = v_id_auto where id = r.id; exception when others then null; end;
  end loop;
  for r in select id from public.tournament_teams where captain_player_id = p_player and captain_id is null loop
    begin update public.tournament_teams set captain_id = v_id_auto where id = r.id; exception when others then null; end;
  end loop;
exception when others then
  return; -- never break signup / email confirmation / claim
end; $$;

revoke all on function public._link_claimed_player_rows(uuid, uuid) from public, anon, authenticated;

-- ── 4. _ensure_player_for_user (live definition verbatim + one call) ────────────────────────
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

  -- Link every row that already identifies this (formerly pending) player by players.id to the
  -- account's profile id (chip entries/results, team memberships, registrations). Never raises.
  perform public._link_claimed_player_rows(v_player, p_uid);

  return v_player;
exception when unique_violation then
  select id into v_player from public.players where profile_id = p_uid;
  return v_player;
end;
$function$;

-- ── 5. Backfill players claimed BEFORE this migration ─────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select pl.id, pl.profile_id
    from public.players pl
    where pl.profile_id is not null
      and (
        exists (select 1 from public.chip_entries e where (e.p1_player_id = pl.id and e.p1_profile_id is null) or (e.p2_player_id = pl.id and e.p2_profile_id is null))
        or exists (select 1 from public.chip_results c where (c.p1_player_id = pl.id and c.p1_profile_id is null) or (c.p2_player_id = pl.id and c.p2_profile_id is null))
        or exists (select 1 from public.tournament_team_members m where m.player_uuid = pl.id and m.player_id is null)
        or exists (select 1 from public.tournament_players tp where tp.player_uuid = pl.id and tp.player_id is null)
        or exists (select 1 from public.tournament_teams tt where tt.captain_player_id = pl.id and tt.captain_id is null)
      )
  loop
    perform public._link_claimed_player_rows(r.id, r.profile_id);
  end loop;
end $$;

-- ── 6. get_player_chip_results ────────────────────────────────────────────────────────────
create or replace function public.get_player_chip_results(p_player_id bigint)
returns table (
  tournament_id bigint,
  tournament jsonb,
  place int,
  field_size int,
  entry_id text,
  team_name text,
  partner_name text,
  wins int,
  losses int,
  is_team boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (
    select p.id_auto, pl.id as player_uuid
    from public.profiles p
    left join public.players pl on pl.profile_id = p.id
    where p.id_auto = p_player_id
  ),
  mine as (
    select r.tournament_id, r.entry_id, r.place, r.team_name,
           case
             when r.p1_profile_id = me.id_auto or (me.player_uuid is not null and r.p1_player_id = me.player_uuid) then 1
             else 2
           end as slot
    from public.chip_results r
    cross join me
    where r.p1_profile_id = me.id_auto
       or r.p2_profile_id = me.id_auto
       or (me.player_uuid is not null and (r.p1_player_id = me.player_uuid or r.p2_player_id = me.player_uuid))
  )
  select
    m.tournament_id,
    jsonb_build_object(
      'id', t.id, 'name', t.name, 'game_type', t.game_type, 'tournament_format', t.tournament_format,
      'tournament_date', t.tournament_date, 'start_time', t.start_time, 'status', t.status,
      'live_state', t.live_state, 'completed_at', t.completed_at, 'thumbnail', t.thumbnail,
      'venues', (select jsonb_build_object('venue', v.venue, 'city', v.city, 'state', v.state)
                 from public.venues v where v.id = t.venue_id)
    ),
    m.place,
    (select count(*) from public.chip_results r2 where r2.tournament_id = m.tournament_id)::int,
    m.entry_id,
    m.team_name,
    nullif(case when m.slot = 1 then e.p2_name else e.p1_name end, ''),
    e.wins,
    e.losses,
    coalesce(nullif(e.p2_name, ''), null) is not null
  from mine m
  join public.tournaments t on t.id = m.tournament_id
  left join public.chip_entries e on e.tournament_id = m.tournament_id and e.id = m.entry_id
  where (t.status = 'completed' or t.live_state = 'finished')
    and t.status is distinct from 'cancelled'
  order by coalesce(t.completed_at, t.tournament_date::timestamptz) desc nulls last
  limit 100;
$$;

revoke all on function public.get_player_chip_results(bigint) from public, anon;
grant execute on function public.get_player_chip_results(bigint) to authenticated;
