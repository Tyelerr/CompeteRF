-- 20260810120000_phase5_pending_player_edit.sql
-- Phase 5 follow-up: (1) safe pre-claim edit of PENDING players; (2) distinct,
-- user-safe claim-conflict errors. See the audit in chat.
--
-- Nothing is merged, deleted, or re-pointed here — players.id is preserved so all
-- tournament/team/chip history stays intact. Both functions are SECURITY DEFINER with
-- a pinned search_path; update is manager-gated exactly like create_pending_player.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. update_pending_player — edit contact fields of a PENDING (unclaimed) player
-- ═══════════════════════════════════════════════════════════════════════════════
-- Outcome:
--   UPDATED                          — fields saved on the SAME players.id
--   EMAIL_BELONGS_TO_ACTIVE_PLAYER   — new email is another ACTIVE player (no change)
--   EMAIL_BELONGS_TO_PENDING_PLAYER  — new email is another PENDING player (no change)
-- On a collision the row is NOT modified; the OTHER player's id is returned so the UI
-- can offer "use the existing player instead". Never merges/deletes/switches records.
create or replace function public.update_pending_player(
  p_tournament_id bigint,
  p_player_id     uuid,
  p_first_name    text,
  p_last_name     text,
  p_email         text,
  p_phone         text default null
)
  returns table (
    player_id      uuid,
    outcome        text,
    account_status text,
    display_name   text,
    email_masked   text
  )
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_norm  text := lower(btrim(coalesce(p_email, '')));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_cur   public.players%rowtype;
  v_other public.players%rowtype;
  v_actor_ida  bigint;
  v_actor_role text;
  v_changed    text[] := '{}';
begin
  -- Same authorization as create_pending_player.
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to edit players for this tournament';
  end if;
  if v_first = '' or v_last = '' then
    raise exception 'First and last name are required';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email is required';
  end if;

  -- Lock the target row so a concurrent edit or claim serializes behind this one.
  select * into v_cur from public.players where id = p_player_id for update;
  if not found then
    raise exception 'Player not found for this tournament';
  end if;

  -- Tournament scope: the player must be attached to THIS tournament (roster or team).
  -- Same generic message whether unrelated or nonexistent — do not reveal existence.
  if not exists (
        select 1 from public.tournament_players tp
        where tp.tournament_id = p_tournament_id and tp.player_uuid = p_player_id and tp.status <> 'cancelled'
      )
     and not exists (
        select 1 from public.tournament_team_members m
        where m.tournament_id = p_tournament_id and m.player_uuid = p_player_id and m.invite_status <> 'declined'
      ) then
    raise exception 'Player not found for this tournament';
  end if;

  -- Re-confirm editability AFTER acquiring the lock: if a claim activated this player
  -- while we waited, it is no longer editable (never touch a newly activated account).
  if v_cur.account_status <> 'PENDING' or v_cur.profile_id is not null then
    raise exception 'This player has been claimed and can no longer be edited'
      using errcode = 'check_violation';
  end if;

  -- Email collision (excluding self). Do NOT merge — report and stop. No raw contact.
  select * into v_other from public.players
   where email_normalized = v_norm and id <> p_player_id;
  if found then
    if v_other.account_status = 'ACTIVE' then
      return query select v_other.id, 'EMAIL_BELONGS_TO_ACTIVE_PLAYER'::text,
        v_other.account_status, v_other.display_name, public.mask_email(v_other.email);
      return;
    elsif v_other.account_status = 'PENDING' then
      return query select v_other.id, 'EMAIL_BELONGS_TO_PENDING_PLAYER'::text,
        v_other.account_status, v_other.display_name, public.mask_email(v_other.email);
      return;
    else
      raise exception 'An account with this email is disabled; contact an admin'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Changed-field list for the audit entry.
  if btrim(coalesce(v_cur.first_name, '')) <> v_first then v_changed := v_changed || 'first_name'; end if;
  if btrim(coalesce(v_cur.last_name, ''))  <> v_last  then v_changed := v_changed || 'last_name';  end if;
  if lower(btrim(coalesce(v_cur.email, ''))) <> v_norm then v_changed := v_changed || 'email';      end if;
  if coalesce(v_cur.phone_e164, '') <> coalesce(v_phone, '') then v_changed := v_changed || 'phone'; end if;

  -- Atomic update on the SAME row. email_normalized regenerates automatically. If this
  -- throws unique_violation (email race), the handler returns the collision and NOTHING
  -- below (invitation supersede / audit) has run — it all rolls back together.
  update public.players
     set first_name   = v_first,
         last_name    = v_last,
         display_name = v_first || ' ' || v_last,
         email        = v_email,
         phone_e164   = v_phone,
         updated_at   = now()
   where id = p_player_id;

  -- Only AFTER a successful update: supersede a live invitation if the email changed.
  -- No-op today (no invitations issued yet); defensive for when delivery is wired.
  if 'email' = any (v_changed) then
    update public.player_invitations
       set superseded_at = now()
     where player_id = p_player_id
       and accepted_at is null and superseded_at is null and revoked_at is null;
  end if;

  -- Audit: masked emails only; no raw email/phone stored.
  select id_auto, role into v_actor_ida, v_actor_role from public.profiles where id = auth.uid();
  insert into public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
  values (
    v_actor_ida, v_actor_role, 'update_pending_player', 'player', null,
    jsonb_build_object(
      'player_id',        p_player_id,
      'tournament_id',    p_tournament_id,
      'changed',          v_changed,
      'old_email_masked', public.mask_email(v_cur.email),
      'new_email_masked', public.mask_email(v_email)
    )
  );

  return query select p_player_id, 'UPDATED'::text, 'PENDING'::text,
                      v_first || ' ' || v_last, public.mask_email(v_email);

exception when unique_violation then
  -- A concurrent write took this email between the check and the update: report it.
  select * into v_other from public.players where email_normalized = v_norm and id <> p_player_id;
  if found then
    return query select v_other.id,
      case when v_other.account_status = 'ACTIVE'
           then 'EMAIL_BELONGS_TO_ACTIVE_PLAYER' else 'EMAIL_BELONGS_TO_PENDING_PLAYER' end,
      v_other.account_status, v_other.display_name, public.mask_email(v_other.email);
    return;
  end if;
  raise;
end;
$$;

revoke all on function public.update_pending_player(bigint, uuid, text, text, text, text) from public, anon;
grant execute on function public.update_pending_player(bigint, uuid, text, text, text, text) to authenticated;

comment on function public.update_pending_player(bigint, uuid, text, text, text, text) is
  'Phase 5: manager-gated edit of a PENDING (profile_id IS NULL) player''s first/last/email/phone on the same players.id. Rejects ACTIVE/DISABLED. On an email collision returns EMAIL_BELONGS_TO_ACTIVE_PLAYER / EMAIL_BELONGS_TO_PENDING_PLAYER (no merge). Supersedes any live invitation when the email changes. Row-locked + unique-index guarded for race safety.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1b. get_pending_player — raw fields to prefill the edit form (manager-gated)
-- ═══════════════════════════════════════════════════════════════════════════════
-- The search RPC returns a MASKED email and no phone (privacy). Editing needs the
-- real values, so this returns them ONLY to a manager of the tournament, and ONLY for
-- a PENDING (unclaimed) player.
create or replace function public.get_pending_player(
  p_tournament_id bigint,
  p_player_id     uuid
)
  returns table (first_name text, last_name text, email text, phone text)
  language plpgsql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized';
  end if;
  return query
  select pl.first_name, pl.last_name, pl.email, pl.phone_e164
  from public.players pl
  where pl.id = p_player_id
    and pl.account_status = 'PENDING' and pl.profile_id is null
    -- Tournament scope: only a player attached to THIS tournament (roster or team).
    and (
      exists (
        select 1 from public.tournament_players tp
        where tp.tournament_id = p_tournament_id and tp.player_uuid = pl.id and tp.status <> 'cancelled'
      )
      or exists (
        select 1 from public.tournament_team_members m
        where m.tournament_id = p_tournament_id and m.player_uuid = pl.id and m.invite_status <> 'declined'
      )
    );
end;
$$;

revoke all on function public.get_pending_player(bigint, uuid) from public, anon;
grant execute on function public.get_pending_player(bigint, uuid) to authenticated;

comment on function public.get_pending_player(bigint, uuid) is
  'Phase 5: raw first/last/email/phone of a PENDING player for prefilling the manager edit form. Manager-gated; returns nothing for ACTIVE/DISABLED/linked players.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. claim_pending_player — distinct, user-safe conflict errors
-- ═══════════════════════════════════════════════════════════════════════════════
-- Return type is unchanged (uuid on success) so the app's best-effort hydration call
-- is unaffected. Failures now raise DISTINCT SQLSTATEs with user-safe messages that
-- never reveal another user's identity.
--   45001 email not verified · 45002 linked to another account
--   45003 provisioning failed (no matching player) · 45004 other conflict
create or replace function public.claim_pending_player()
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      uuid := auth.uid();
  v_player   uuid;
  v_email    text;
  v_verified timestamptz;
  v_norm     text;
  v_exists   uuid;
  v_owner    uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Links (or confirms already-linked-to-this-account) and returns the player.
  v_player := public._ensure_player_for_user(v_uid);
  if v_player is not null then
    return v_player;
  end if;

  -- Diagnose why linking did not happen — user-safe, no other identity exposed.
  select email, email_confirmed_at into v_email, v_verified from auth.users where id = v_uid;
  if v_verified is null then
    raise exception 'Verify your email to finish setting up your player profile.'
      using errcode = '45001';
  end if;

  v_norm := lower(btrim(coalesce(v_email, '')));
  select id, profile_id into v_exists, v_owner from public.players where email_normalized = v_norm;

  if v_exists is not null and v_owner is not null and v_owner <> v_uid then
    raise exception 'This player profile is already connected to another account. Contact support or a tournament administrator if you believe this is incorrect.'
      using errcode = '45002';
  end if;

  if v_exists is null then
    raise exception 'We could not set up your player profile. Please try again, or contact support.'
      using errcode = '45003';
  end if;

  raise exception 'A conflict prevented linking your player profile. Please contact support.'
    using errcode = '45004';
end;
$$;

revoke all on function public.claim_pending_player() from public, anon;
grant execute on function public.claim_pending_player() to authenticated;

comment on function public.claim_pending_player() is
  'Phase 5: links the caller''s verified-email player to their profile (status -> ACTIVE), preserving history on the same players.id. Idempotent. Raises distinct user-safe SQLSTATEs on failure: 45001 unverified email, 45002 linked to another account, 45003 provisioning failed, 45004 other conflict.';
