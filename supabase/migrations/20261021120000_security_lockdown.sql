-- supabase/migrations/20261021120000_security_lockdown.sql
--
-- Production security lockdown (2026-10-03 audit). Every hole below was reproduced against prod in
-- a rolled-back transaction (supabase/tests/security_lockdown_prod_verification.sql, before/after).
-- Privilege-narrowing only: no data is rewritten, no table / column is added or dropped, and every
-- legitimate app path keeps working (they run as SECURITY DEFINER RPCs, or as a tournament
-- manager, or only touch the columns left client-writable below).
-- Rollback: supabase/rollback/20261021120000_security_lockdown_rollback.sql (restores every grant,
-- policy and function body this file changes, verbatim from prod).
--
-- NOT in this migration (held — see report): the profiles email / phone read surface. The public
-- native builds (iOS 1.25, Android 1.0.20 — no OTA) select `profiles!director_id(*)` in the
-- tournament list, so any column revoke would fail those whole queries for every old-app user.
--
-- A. Public views are READ-ONLY for clients.
--    profiles_public / chip_config_public / chip_events_public are simple (auto-updatable) views
--    owned by postgres, so a write through them bypasses the base tables' RLS. Earlier migrations
--    only did `revoke all … from public`, which leaves Supabase's DIRECT anon/authenticated grants:
--    anon could rewrite every profile and delete / forge / supersede chip config + events. No app
--    code writes through these views. SELECT stays; service_role keeps its grants.
--
-- B. hide_tournament_and_resolve_report: SECURITY DEFINER, executable by anon, and it authorized
--    on a CLIENT-SUPPLIED admin id (admin ids are public) → anyone could hide any tournament and
--    resolve any report. The app never calls it (Report Management hides via
--    tournamentService.hideTournament under RLS). Client EXECUTE is revoked, and the body now
--    authorizes on auth.uid() (+ pinned search_path), so a future grant can't reopen the hole.
--
-- D. Fargo / winnings self-verification: the profiles "update own" policy has no column limits and
--    tg_profiles_guard_privileged covers role/status only, so a user could set their own
--    fargo + fargo_status='verified' (+ verified_by / total_winnings). No client — current or the
--    public native builds — writes these columns: verification is approve_registration_with_fargo /
--    confirm_team_member_fargo / _promote_verified_fargo (SECURITY DEFINER, run as postgres).
--    New guard: client roles may not set fargo / fargo_status / fargo_verified_by /
--    fargo_last_verified_at / id_auto; total_winnings only by an admin (the legacy giveaway draw).
--
-- E. Registration escalation: tournament_players INSERT/UPDATE policies only check
--    "my row OR director OR admin", with no column / lifecycle limits → a player could insert
--    themselves into a CLOSED event as checked_in + paid + seeded, or flip their own row to paid /
--    checked_in / side pots. New guard for NON-managers only (managers — can_manage_tournament:
--    admin, director, venue owner, venue director — are unchanged; every server writer is
--    SECURITY DEFINER):
--      • insert only as 'preregistered' while live_state = 'registration_open' (the app's own
--        rule, current and old builds), with every privileged column at its default;
--      • update only: cancel own (→ 'cancelled'), re-register ('cancelled' → 'preregistered' while
--        registration is open), and edit the suggested fargo_rating while preregistered.
--
-- F. conversation_participants: participants_insert let any user add THEMSELVES to any
--    conversation (then read its whole history and post); participants_update had no WITH CHECK
--    (move own row to another conversation). Every legitimate participant insert is a SECURITY
--    DEFINER RPC (create_conversation_with_participants, set_review_archived,
--    set_conversation_archived); clients only update their own last_read_at / archived_at. Direct
--    insert → admins only; update keeps user_id = auth.uid() as USING and WITH CHECK; a guard
--    refuses changing conversation_id / user_id from client roles.

begin;

-- A ───────────────────────────────────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate, references, trigger
  on public.profiles_public, public.chip_config_public, public.chip_events_public
  from anon, authenticated;

-- B ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.hide_tournament_and_resolve_report(
  p_tournament_id bigint, p_report_id uuid, p_admin_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  -- Authorization comes from the signed-in caller — never from p_admin_id.
  if v_admin is null or not public._authz_is_admin() then
    raise exception 'Unauthorized: admin role required' using errcode = '42501';
  end if;
  if p_admin_id is not null and p_admin_id <> v_admin then
    raise exception 'p_admin_id must be the signed-in admin' using errcode = '42501';
  end if;

  update public.tournaments
     set is_hidden = true, updated_at = now()
   where id = p_tournament_id;

  update public.reports
     set status = 'resolved', reviewed_by = v_admin, reviewed_at = now()
   where id = p_report_id;
end;
$function$;

revoke execute on function public.hide_tournament_and_resolve_report(bigint, uuid, uuid) from public, anon, authenticated;

-- D ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_profiles_guard_fargo()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- SECURITY DEFINER RPCs (verification, giveaway draw, account deletion) run as postgres.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.fargo is not null
       or coalesce(new.fargo_status, 'unverified') <> 'unverified'
       or new.fargo_verified_by is not null
       or new.fargo_last_verified_at is not null
       or coalesce(new.total_winnings, 0) <> 0 then
      raise exception 'Fargo / winnings fields are set by a tournament director or admin, not at sign-up (attempted by role %)', current_user
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.fargo                  is distinct from old.fargo
     or new.fargo_status           is distinct from old.fargo_status
     or new.fargo_verified_by      is distinct from old.fargo_verified_by
     or new.fargo_last_verified_at is distinct from old.fargo_last_verified_at
     or new.id_auto                is distinct from old.id_auto then
    raise exception 'Fargo verification is done by a tournament director (attempted by role %)', current_user
      using errcode = '42501';
  end if;
  if new.total_winnings is distinct from old.total_winnings and not public._authz_is_admin() then
    raise exception 'total_winnings may only be changed by an admin (attempted by role %)', current_user
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_guard_fargo on public.profiles;
create trigger profiles_guard_fargo
  before insert or update on public.profiles
  for each row execute function public.tg_profiles_guard_fargo();

-- E ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_tournament_players_guard_self()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_open boolean;
begin
  -- SECURITY DEFINER RPCs (register_player_for_tournament, approve_registration_with_fargo,
  -- claim linking, chip/elimination sync, account deletion) run as postgres.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  -- Tournament managers (admin / director / venue owner / venue director): unchanged.
  if public.can_manage_tournament(new.tournament_id)
     and (tg_op = 'INSERT' or public.can_manage_tournament(old.tournament_id)) then
    return new;
  end if;

  select (t.live_state = 'registration_open' and t.status = 'active')
    into v_open
    from public.tournaments t
   where t.id = new.tournament_id;
  v_open := coalesce(v_open, false);

  if tg_op = 'INSERT' then
    if not v_open then
      raise exception 'Registration is closed for this tournament' using errcode = '42501';
    end if;
    if new.status is distinct from 'preregistered'
       or coalesce(new.paid_entry, false)
       or coalesce(new.paid_side_pots, '[]'::jsonb) <> '[]'::jsonb
       or new.checked_in_at is not null
       or new.seed is not null
       or new.queue_position is not null
       or new.eliminated_at is not null
       or new.race_override is not null
       or new.fargo_at_registration is not null
       or coalesce(new.is_starter_rating, false)
       or new.guest_name is not null
       or coalesce(new.fargo_cap_override, false)
       or new.fargo_cap_at_override is not null
       or new.player_fargo_at_override is not null
       or new.fargo_cap_override_reason is not null
       or new.fargo_cap_override_notes is not null
       or new.overridden_by is not null
       or new.overridden_at is not null then
      raise exception 'Players register as preregistered; check-in, payment, seeding and overrides are set by the tournament director'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE by the player on their own row (RLS already limits rows to their own).
  if new.tournament_id              is distinct from old.tournament_id
     or new.player_id                is distinct from old.player_id
     or new.player_uuid              is distinct from old.player_uuid
     or new.guest_name               is distinct from old.guest_name
     or new.paid_entry               is distinct from old.paid_entry
     or new.paid_side_pots           is distinct from old.paid_side_pots
     or new.checked_in_at            is distinct from old.checked_in_at
     or new.seed                     is distinct from old.seed
     or new.queue_position           is distinct from old.queue_position
     or new.eliminated_at            is distinct from old.eliminated_at
     or new.race_override            is distinct from old.race_override
     or new.fargo_at_registration    is distinct from old.fargo_at_registration
     or new.is_starter_rating        is distinct from old.is_starter_rating
     or new.registered_at            is distinct from old.registered_at
     or new.fargo_cap_override       is distinct from old.fargo_cap_override
     or new.fargo_cap_at_override    is distinct from old.fargo_cap_at_override
     or new.player_fargo_at_override is distinct from old.player_fargo_at_override
     or new.fargo_cap_override_reason is distinct from old.fargo_cap_override_reason
     or new.fargo_cap_override_notes is distinct from old.fargo_cap_override_notes
     or new.overridden_by            is distinct from old.overridden_by
     or new.overridden_at            is distinct from old.overridden_at then
    raise exception 'Only the tournament director can change check-in, payment, seeding or overrides'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'cancelled' then
      null; -- a player may always withdraw their own registration
    elsif new.status = 'preregistered' and old.status = 'cancelled' and v_open then
      null; -- re-register a cancelled row while registration is open
    else
      raise exception 'Registration status % → % is set by the tournament director', old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  if new.fargo_rating is distinct from old.fargo_rating and new.status <> 'preregistered' then
    raise exception 'The suggested Fargo can only be edited while preregistered' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- Name sorts BEFORE tp_sync_player_uuid / tournament_players_set_updated_at, so it sees the
-- client's row before those triggers fill player_uuid / updated_at.
drop trigger if exists tournament_players_guard_self on public.tournament_players;
create trigger tournament_players_guard_self
  before insert or update on public.tournament_players
  for each row execute function public.tg_tournament_players_guard_self();

-- F ───────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists participants_insert on public.conversation_participants;
create policy participants_insert on public.conversation_participants
  for insert to authenticated
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = any (array['super_admin'::text, 'compete_admin'::text])
  ));

drop policy if exists participants_update on public.conversation_participants;
create policy participants_update on public.conversation_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.tg_conversation_participants_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user in ('authenticated', 'anon')
     and (new.conversation_id is distinct from old.conversation_id
       or new.user_id is distinct from old.user_id) then
    raise exception 'conversation_id / user_id cannot be changed (attempted by role %)', current_user
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists conversation_participants_guard on public.conversation_participants;
create trigger conversation_participants_guard
  before update on public.conversation_participants
  for each row execute function public.tg_conversation_participants_guard();

commit;
