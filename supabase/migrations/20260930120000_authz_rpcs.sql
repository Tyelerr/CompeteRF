-- supabase/migrations/20260930120000_authz_rpcs.sql
--
-- Phase 1 authorization hardening — M1 (ADDITIVE ONLY).
--
-- Adds the server-side paths that the M2 lockdown (20260930130000_authz_write_lockdown.sql)
-- makes mandatory. Nothing here changes an existing policy, grant or function behavior, so it is
-- safe to apply before (and independently of) the client release and M2.
--
-- Why these exist: today the client writes profiles.role / status / is_disabled directly
-- (roleService.recomputeUserRole, useEditUser, useAdminUsers, venue-team flows). M2 closes that
-- direct path, so every privileged write needs an authorized, server-side equivalent:
--
--   _authz_my_id_auto / _authz_is_admin / _authz_manages_venue   policy helpers (used by M2)
--   _recompute_user_role(bigint)          internal derivation (no auth; not client-callable)
--   recompute_user_role(bigint)           authorized wrapper  (roleService.recomputeUserRole)
--   admin_update_user(...)                admin edit-user     (useEditUser.saveUser)
--   admin_set_user_disabled(uuid, bool)   admin disable       (useEditUser.toggleDisabled)
--   admin_soft_delete_user(uuid)          admin soft delete   (useAdminUsers.deleteUser)
--   create_venue(jsonb, bigint[])         venue + creator-owner bootstrap (useCreateVenue)
--   remove_venue_team_member(text, int)   hard-delete team member + recompute (useVenueTeam)
--
-- Plus: is_venue_owner(int) gets a pinned search_path (it is SECURITY DEFINER and had none).
--
-- Conventions: SECURITY DEFINER, `set search_path = public, pg_temp`, caller derived from
-- auth.uid() (never from an argument), explicit authorization, EXECUTE revoked from PUBLIC/anon.

-- ── Policy helpers ───────────────────────────────────────────────────────────────────────────
-- Used inside RLS policies/triggers, so `authenticated` needs EXECUTE. They only answer questions
-- about the CALLER, so they leak nothing.

create or replace function public._authz_my_id_auto()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id_auto from public.profiles where id = auth.uid()
$$;

create or replace function public._authz_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('compete_admin', 'super_admin'),
    false)
$$;

-- Caller is an ACTIVE owner or an ACTIVE director of the venue.
create or replace function public._authz_manages_venue(p_venue_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.venue_owners vo
    where vo.venue_id = p_venue_id and vo.archived_at is null
      and vo.owner_id = (select id_auto from public.profiles where id = auth.uid())
  ) or exists (
    select 1 from public.venue_directors vd
    where vd.venue_id = p_venue_id and vd.archived_at is null
      and vd.director_id = (select id_auto from public.profiles where id = auth.uid())
  )
$$;

revoke all on function public._authz_my_id_auto()             from public, anon;
revoke all on function public._authz_is_admin()               from public, anon;
revoke all on function public._authz_manages_venue(integer)   from public, anon;
grant execute on function public._authz_my_id_auto()           to authenticated;
grant execute on function public._authz_is_admin()             to authenticated;
grant execute on function public._authz_manages_venue(integer) to authenticated;

-- is_venue_owner: SECURITY DEFINER without a search_path. Pin it (body/grants unchanged; it is
-- referenced by existing DELETE policies to {public}, so its anon EXECUTE is intentionally kept).
alter function public.is_venue_owner(integer) set search_path = public, pg_temp;

-- ── Role derivation ──────────────────────────────────────────────────────────────────────────
-- Exact port of src/models/services/role.service.ts (the documented single source of truth):
--   admins are never touched; owns an active venue -> bar_owner; directs an active venue OR is
--   director_id of an active tournament -> tournament_director; otherwise basic_user.
-- Internal: no authorization, NOT client-callable. Runs as owner, so the M2 guard allows it.
create or replace function public._recompute_user_role(p_user_id_auto bigint)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current text;
  v_role    text;
begin
  select role into v_current from public.profiles where id_auto = p_user_id_auto for update;
  if not found then
    return null;
  end if;
  if v_current in ('compete_admin', 'super_admin') then
    return v_current;
  end if;

  if exists (select 1 from public.venue_owners
             where owner_id = p_user_id_auto and archived_at is null) then
    v_role := 'bar_owner';
  elsif exists (select 1 from public.venue_directors
                where director_id = p_user_id_auto and archived_at is null)
     or exists (select 1 from public.tournaments
                where director_id = p_user_id_auto and status = 'active') then
    v_role := 'tournament_director';
  else
    v_role := 'basic_user';
  end if;

  if v_role is distinct from v_current then
    update public.profiles set role = v_role, updated_at = now() where id_auto = p_user_id_auto;
  end if;
  return v_role;
end;
$$;

revoke all on function public._recompute_user_role(bigint) from public, anon, authenticated;

-- Authorized wrapper. Allowed when the caller is:
--   (a) an admin, or
--   (b) the target themself, or
--   (c) an ACTIVE owner of a venue the target is (or was — archived rows count) tied to as owner
--       or director, or where the target directs a tournament.
-- A bar owner therefore cannot re-derive (e.g. demote a manually granted role of) a user who has
-- no relationship with their venues.
create or replace function public.recompute_user_role(p_user_id_auto bigint)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_me  bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_user_id_auto is null then
    return null;
  end if;

  v_me := public._authz_my_id_auto();

  if not (
    public._authz_is_admin()
    or v_me = p_user_id_auto
    or exists (
      select 1
      from public.venue_owners mine
      where mine.owner_id = v_me and mine.archived_at is null
        and (
          exists (select 1 from public.venue_owners vo
                  where vo.venue_id = mine.venue_id and vo.owner_id = p_user_id_auto)
          or exists (select 1 from public.venue_directors vd
                     where vd.venue_id = mine.venue_id and vd.director_id = p_user_id_auto)
          or exists (select 1 from public.tournaments t
                     where t.venue_id = mine.venue_id and t.director_id = p_user_id_auto)
        )
    )
  ) then
    raise exception 'Not authorized to update this user''s role' using errcode = '42501';
  end if;

  return public._recompute_user_role(p_user_id_auto);
end;
$$;

revoke all on function public.recompute_user_role(bigint) from public, anon;
grant execute on function public.recompute_user_role(bigint) to authenticated;

-- ── Admin user management ────────────────────────────────────────────────────────────────────
-- Server-side version of the client rules in useEditUser/useAdminUsers (canEdit/canDeleteUser):
--   super_admin  -> may manage any user, assign any role;
--   compete_admin -> only targets whose CURRENT role is below compete_admin, and only assign
--                    roles below compete_admin;
--   nobody changes their OWN role / status / disabled flag (name edits on self are fine);
--   the last active super_admin can never be demoted, suspended, disabled or deleted.
create or replace function public._admin_assert_can_manage(p_target uuid, p_new_role text)
returns text  -- the target's current role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_my_role     text;
  v_target_role text;
  v_lower constant text[] := array['basic_user', 'tournament_director', 'bar_owner'];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select role into v_my_role from public.profiles where id = auth.uid();
  if v_my_role is null or v_my_role not in ('compete_admin', 'super_admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select role into v_target_role from public.profiles where id = p_target;
  if v_target_role is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if p_new_role is not null
     and p_new_role not in ('basic_user', 'tournament_director', 'bar_owner', 'compete_admin', 'super_admin') then
    raise exception 'Invalid role %', p_new_role using errcode = '22023';
  end if;

  if v_my_role = 'compete_admin' then
    if v_target_role <> all (v_lower) then
      raise exception 'Compete admins cannot manage admin accounts' using errcode = '42501';
    end if;
    if p_new_role is not null and p_new_role <> all (v_lower) then
      raise exception 'Compete admins cannot grant admin roles' using errcode = '42501';
    end if;
  end if;

  return v_target_role;
end;
$$;

revoke all on function public._admin_assert_can_manage(uuid, text) from public, anon, authenticated;

create or replace function public._admin_assert_not_last_super_admin(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if (select role from public.profiles where id = p_target) = 'super_admin'
     and not exists (
       select 1 from public.profiles
       where role = 'super_admin' and id <> p_target
         and coalesce(status, 'active') = 'active' and not is_disabled
     ) then
    raise exception 'Cannot remove the last active super admin' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._admin_assert_not_last_super_admin(uuid) from public, anon, authenticated;

create or replace function public.admin_update_user(
  p_user_id    uuid,
  p_name       text,
  p_first_name text,
  p_last_name  text,
  p_role       text,
  p_status     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_role   text;
  v_current_status text;
  v_row            public.profiles;
begin
  v_current_role := public._admin_assert_can_manage(p_user_id, p_role);

  if p_status is not null and p_status not in ('active', 'suspended', 'banned') then
    -- 'deleted' only via admin_soft_delete_user
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;

  select status into v_current_status from public.profiles where id = p_user_id for update;

  if p_user_id = auth.uid()
     and (coalesce(p_role, v_current_role) is distinct from v_current_role
          or coalesce(p_status, v_current_status) is distinct from v_current_status) then
    raise exception 'You cannot change your own role or status' using errcode = '42501';
  end if;

  if (coalesce(p_role, v_current_role) <> 'super_admin'
      or coalesce(p_status, v_current_status) <> 'active') then
    perform public._admin_assert_not_last_super_admin(p_user_id);
  end if;

  update public.profiles
     set name       = coalesce(p_name, name),
         first_name = coalesce(p_first_name, first_name),
         last_name  = coalesce(p_last_name, last_name),
         role       = coalesce(p_role, role),
         status     = coalesce(p_status, status),
         updated_at = now()
   where id = p_user_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'id_auto', v_row.id_auto, 'name', v_row.name,
    'first_name', v_row.first_name, 'last_name', v_row.last_name,
    'role', v_row.role, 'status', v_row.status, 'is_disabled', v_row.is_disabled);
end;
$$;

create or replace function public.admin_set_user_disabled(p_user_id uuid, p_disabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._admin_assert_can_manage(p_user_id, null);
  if p_user_id = auth.uid() then
    raise exception 'You cannot disable your own account' using errcode = '42501';
  end if;
  if coalesce(p_disabled, false) then
    perform public._admin_assert_not_last_super_admin(p_user_id);
  end if;

  update public.profiles
     set is_disabled = coalesce(p_disabled, false), updated_at = now()
   where id = p_user_id;
  return coalesce(p_disabled, false);
end;
$$;

create or replace function public.admin_soft_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._admin_assert_can_manage(p_user_id, null);
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account here' using errcode = '42501';
  end if;
  perform public._admin_assert_not_last_super_admin(p_user_id);

  update public.profiles
     set status     = 'deleted',
         deleted_at = now(),
         deleted_by = public._authz_my_id_auto(),
         updated_at = now()
   where id = p_user_id;
end;
$$;

revoke all on function public.admin_update_user(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.admin_set_user_disabled(uuid, boolean)                from public, anon;
revoke all on function public.admin_soft_delete_user(uuid)                          from public, anon;
grant execute on function public.admin_update_user(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_set_user_disabled(uuid, boolean)                to authenticated;
grant execute on function public.admin_soft_delete_user(uuid)                          to authenticated;

-- ── Venue creation (owner bootstrap) ─────────────────────────────────────────────────────────
-- The creator must become the venue's owner, but M2 only lets EXISTING owners/admins write
-- venue_owners (an "unowned venue" exception would let anyone claim the ~200 unowned venues).
-- So venue + primary-owner link + director links are created atomically here.
-- Allowed: bar_owner and admins (the only roles whose UI reaches Create Venue). As before, an
-- admin who creates a venue becomes its primary owner (recompute leaves admin roles untouched).
-- venue_tables stay a client insert (that table is out of scope; its RLS is disabled today).
create or replace function public.create_venue(p_venue jsonb, p_director_ids bigint[] default '{}')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    bigint;
  v_role  text;
  v_venue integer;
  v_dir   bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select id_auto, role into v_me, v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('bar_owner', 'compete_admin', 'super_admin') then
    raise exception 'Only bar owners and admins can create venues' using errcode = '42501';
  end if;

  if coalesce(btrim(p_venue->>'venue'), '') = '' or coalesce(btrim(p_venue->>'address'), '') = ''
     or coalesce(btrim(p_venue->>'city'), '') = '' or coalesce(btrim(p_venue->>'state'), '') = ''
     or coalesce(btrim(p_venue->>'zip_code'), '') = '' then
    raise exception 'Venue name, address, city, state and ZIP code are required' using errcode = '22023';
  end if;

  insert into public.venues (venue, address, city, state, zip_code, phone, google_place_id, latitude, longitude, status)
  values (
    p_venue->>'venue', p_venue->>'address', p_venue->>'city', p_venue->>'state', p_venue->>'zip_code',
    nullif(p_venue->>'phone', ''), nullif(p_venue->>'google_place_id', ''),
    nullif(p_venue->>'latitude', '')::numeric, nullif(p_venue->>'longitude', '')::numeric,
    'active')
  returning id into v_venue;

  insert into public.venue_owners (venue_id, owner_id, assigned_by, is_primary)
  values (v_venue, v_me, v_me, true);
  perform public._recompute_user_role(v_me);

  foreach v_dir in array coalesce(p_director_ids, '{}'::bigint[]) loop
    if not exists (select 1 from public.profiles where id_auto = v_dir) then
      raise exception 'Director % not found', v_dir using errcode = 'P0002';
    end if;
    insert into public.venue_directors (venue_id, director_id, assigned_by)
    values (v_venue, v_dir, v_me)
    on conflict (venue_id, director_id) do nothing;
    perform public._recompute_user_role(v_dir);
  end loop;

  return v_venue;
end;
$$;

revoke all on function public.create_venue(jsonb, bigint[]) from public, anon;
grant execute on function public.create_venue(jsonb, bigint[]) to authenticated;

-- ── Venue team removal (hard delete) ─────────────────────────────────────────────────────────
-- useVenueTeam removes co-owners/directors with a HARD delete; once the row is gone the
-- relationship-based authorization of recompute_user_role can no longer see the tie. Doing the
-- delete + recompute here keeps that authorization strict. Same rules as the existing DELETE
-- policies (active owner of that venue, or admin) plus the client's "primary owner can't be
-- removed" rule.
create or replace function public.remove_venue_team_member(p_kind text, p_row_id integer)
returns text  -- the removed user's re-derived role
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue   integer;
  v_user    bigint;
  v_primary boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_kind = 'owner' then
    select venue_id, owner_id, coalesce(is_primary, false) into v_venue, v_user, v_primary
    from public.venue_owners where id = p_row_id for update;
  elsif p_kind = 'director' then
    select venue_id, director_id, false into v_venue, v_user, v_primary
    from public.venue_directors where id = p_row_id for update;
  else
    raise exception 'Invalid kind %', p_kind using errcode = '22023';
  end if;

  if v_venue is null then
    raise exception 'Team member not found' using errcode = 'P0002';
  end if;
  if not (public._authz_is_admin() or public.is_venue_owner(v_venue)) then
    raise exception 'Not authorized to manage this venue''s team' using errcode = '42501';
  end if;
  if v_primary then
    raise exception 'The primary owner cannot be removed' using errcode = '42501';
  end if;

  if p_kind = 'owner' then
    delete from public.venue_owners where id = p_row_id;
  else
    delete from public.venue_directors where id = p_row_id;
  end if;

  return public._recompute_user_role(v_user);
end;
$$;

revoke all on function public.remove_venue_team_member(text, integer) from public, anon;
grant execute on function public.remove_venue_team_member(text, integer) to authenticated;
