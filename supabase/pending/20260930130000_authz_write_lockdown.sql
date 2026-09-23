-- supabase/migrations/20260930130000_authz_write_lockdown.sql
--
-- Phase 1 authorization hardening — M2 (LOCKDOWN). Requires M1 (20260930120000_authz_rpcs.sql)
-- and the Phase 1 client (which moves privileged writes onto the M1 RPCs).
--
-- Closes (all confirmed on prod 2026-09-22; exact prior definitions captured verbatim in
-- supabase/rollback/20260930110000_authz_baseline_capture.sql):
--   1. profiles self-escalation — "Users can update own profile" / the insert policies allow ANY
--      column, incl. role/status/is_disabled (any user could make themselves super_admin).
--   2. "Bar owners can manage team roles" — any bar_owner could UPDATE ANY profile row.
--   3. venue_owners INSERT and venue_directors INSERT/UPDATE were `true` — anyone could attach
--      themselves to any venue (which then satisfies can_manage_tournament / is_venue_owner).
--   4. tournaments INSERT only checked director_id = me (any venue); a director could UPDATE
--      their tournament onto any venue. tournament_templates INSERT was `auth.uid() IS NOT NULL`
--      and generate_recurring_tournaments() (SECURITY DEFINER, EXECUTE to anon) copied template
--      venue/director into live tournaments with no checks.
--   5. create_conversation_with_participants trusted a caller-supplied p_created_by.
--
-- Mechanism for "client vs server" writes (same convention as tg_profiles_guard_phone): PostgREST
-- requests run as `authenticated`/`anon`; SECURITY DEFINER RPCs (owned by postgres), cron and
-- edge functions (service_role) do not — so guards key on current_user and cannot be spoofed.
--
-- Only the named policies/functions below are touched. No table/column changes.

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1+2. profiles
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- Privileged columns may only change through the M1 admin/role RPCs (or service_role/cron).
-- Normal self-edits (name, avatar, home_state, preferences, last_active_at, …) are unaffected.
create or replace function public.tg_profiles_guard_privileged()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- sign-up (register / complete-profile) never sends these; defaults apply.
    if new.role is distinct from 'basic_user'
       or coalesce(new.status, 'active') <> 'active'
       or coalesce(new.is_disabled, false)
       or new.deleted_at is not null
       or new.deleted_by is not null then
      raise exception 'New profiles must start as an active basic_user (attempted by role %)', current_user
        using errcode = '42501';
    end if;
  else
    if new.role        is distinct from old.role
       or new.status      is distinct from old.status
       or new.is_disabled is distinct from old.is_disabled
       or new.deleted_at  is distinct from old.deleted_at
       or new.deleted_by  is distinct from old.deleted_by then
      raise exception
        'role/status/is_disabled/deleted_* may only be changed via the admin/role RPCs (attempted by role %)',
        current_user
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_profiles_guard_privileged() from public, anon, authenticated;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before insert or update on public.profiles
  for each row execute function public.tg_profiles_guard_privileged();

-- Every legitimate cross-user profile write a bar owner made (promote/demote after a team change)
-- now goes through recompute_user_role / create_venue / remove_venue_team_member.
drop policy if exists "Bar owners can manage team roles" on public.profiles;

-- anon never writes profiles (sign-up inserts only after signUp returns a session).
revoke insert, update, delete on public.profiles from anon;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 3. venue_owners / venue_directors — only an ACTIVE owner of that venue, or an admin
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (Matches the existing DELETE policies. Creating a brand-new venue's first owner is the
-- create_venue RPC's job; there is deliberately no "unowned venue" exception.)

drop policy if exists "Bar owners can insert venue_owners" on public.venue_owners;
create policy "Venue owners and admins can insert venue_owners" on public.venue_owners
  as permissive for insert to authenticated
  with check (public._authz_is_admin() or public.is_venue_owner(venue_id));

drop policy if exists "Bar owners can insert venue_directors" on public.venue_directors;
create policy "Venue owners and admins can insert venue_directors" on public.venue_directors
  as permissive for insert to authenticated
  with check (public._authz_is_admin() or public.is_venue_owner(venue_id));

drop policy if exists "Bar owners can update venue_directors" on public.venue_directors;
create policy "Venue owners and admins can update venue_directors" on public.venue_directors
  as permissive for update to authenticated
  using (public._authz_is_admin() or public.is_venue_owner(venue_id))
  with check (public._authz_is_admin() or public.is_venue_owner(venue_id));

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 4. tournaments / tournament_templates — venue authorization
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- INSERT: non-admins create only as themselves, at a venue they actively own or direct.
-- (Every legitimate non-admin insert path already does exactly this: useSubmitTournament,
-- useBarTournamentManager / useTournamentDirectorManager drafts. Admins keep any venue/director,
-- e.g. bulk import.)
drop policy if exists "Directors and venue owners can insert tournaments" on public.tournaments;
create policy "Venue managers and admins can insert tournaments" on public.tournaments
  as permissive for insert to authenticated
  with check (
    public._authz_is_admin()
    or (director_id = public._authz_my_id_auto() and public._authz_manages_venue(venue_id))
  );

-- UPDATE: the existing USING policies stay (director or venue owner may edit). A trigger — not a
-- WITH CHECK — guards venue/director CHANGES, because a policy cannot compare OLD vs NEW: a TD who
-- was later removed from a venue must still be able to save live state on their own event, but
-- must not be able to move it (or anything) onto a venue they don't manage.
--   * venue_id change    -> caller must actively own or direct the NEW venue
--   * director_id change -> caller must actively own the venue (old and new), i.e. the bar-owner
--                           "Reassign Director" flow; admins unrestricted.
-- Shared by tournaments and tournament_templates (same column names).
create or replace function public.tg_guard_venue_director_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.venue_id is not distinct from old.venue_id
     and new.director_id is not distinct from old.director_id then
    return new;
  end if;
  if public._authz_is_admin() then
    return new;
  end if;

  if new.venue_id is distinct from old.venue_id
     and not public._authz_manages_venue(new.venue_id) then
    raise exception 'Not authorized to move this % to venue %', tg_table_name, new.venue_id
      using errcode = '42501';
  end if;

  if new.director_id is distinct from old.director_id
     and not (public.is_venue_owner(old.venue_id) and public.is_venue_owner(new.venue_id)) then
    raise exception 'Only the venue owner or an admin can reassign the director of this %', tg_table_name
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_guard_venue_director_change() from public, anon, authenticated;

drop trigger if exists tournaments_guard_venue_director on public.tournaments;
create trigger tournaments_guard_venue_director
  before update on public.tournaments
  for each row execute function public.tg_guard_venue_director_change();

-- Templates feed generate_recurring_tournaments(), so they get the same rules.
drop policy if exists "Tournament directors can insert their own templates" on public.tournament_templates;
drop policy if exists "Directors can insert templates" on public.tournament_templates;
create policy "Venue managers and admins can insert templates" on public.tournament_templates
  as permissive for insert to authenticated
  with check (
    public._authz_is_admin()
    or (director_id = public._authz_my_id_auto() and public._authz_manages_venue(venue_id))
  );

drop trigger if exists tournament_templates_guard_venue_director on public.tournament_templates;
create trigger tournament_templates_guard_venue_director
  before update on public.tournament_templates
  for each row execute function public.tg_guard_venue_director_change();

-- The nightly cron (runs as postgres) is its only caller; no client/edge code calls it.
alter function public.generate_recurring_tournaments() set search_path = public, pg_temp;
revoke execute on function public.generate_recurring_tournaments() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 5. create_conversation_with_participants — the creator is always the caller
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Same signature and behavior; every client caller (compose-message, NotificationsModal, review
-- reply) already passes the signed-in user's id, so no client change is needed.
create or replace function public.create_conversation_with_participants(
  p_created_by    uuid,
  p_subject       text    default null::text,
  p_category      text    default 'general'::text,
  p_tournament_id integer default null::integer,
  p_is_support    boolean default false,
  p_recipient_id  uuid    default null::uuid,
  p_first_message text    default ''::text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_convo_id UUID;
  v_admin RECORD;
BEGIN
  -- 0. The creator must be the authenticated caller (no impersonation)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Conversations can only be created as yourself' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(p_is_support, false) AND p_recipient_id = p_created_by THEN
    RAISE EXCEPTION 'You cannot start a conversation with yourself' USING ERRCODE = '22023';
  END IF;

  -- 1. Create conversation
  INSERT INTO conversations (created_by, subject, category, tournament_id, is_support)
  VALUES (p_created_by, p_subject, p_category, p_tournament_id, p_is_support)
  RETURNING id INTO v_convo_id;

  -- 2. Add creator as participant
  INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
  VALUES (v_convo_id, p_created_by, now());

  -- 3. Add recipient(s)
  IF p_is_support THEN
    -- Add ALL admins
    FOR v_admin IN
      SELECT id FROM profiles
      WHERE role IN ('compete_admin', 'super_admin')
      AND id != p_created_by
    LOOP
      INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES (v_convo_id, v_admin.id);
    END LOOP;
  ELSIF p_recipient_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id)
    VALUES (v_convo_id, p_recipient_id);
  END IF;

  -- 4. Send first message
  IF p_first_message != '' THEN
    INSERT INTO conversation_messages (conversation_id, sender_id, body)
    VALUES (v_convo_id, p_created_by, p_first_message);
  END IF;

  RETURN v_convo_id;
END;
$function$;

revoke all on function public.create_conversation_with_participants(uuid, text, text, integer, boolean, uuid, text) from public, anon;
grant execute on function public.create_conversation_with_participants(uuid, text, text, integer, boolean, uuid, text) to authenticated;
