-- ============================================================================================
-- Account-deletion integrity (post #47 incident)             PENDING — NOT APPLIED
-- ============================================================================================
-- Deleting an account must never delete shared / historical / operational data merely because
-- the user created, owned, operated or took part in it.
--
-- Model: TOMBSTONE. The profiles row is kept (so the ~50 NOT NULL references to it — giveaway
-- entries, winner history, draws, directed tournaments, sent messages, ... — stay valid) and is
-- scrubbed of personal data; the auth user (credentials, identities, sessions) IS deleted.
--
--   0. PROPOSED (approval pending): giveaway entry PII nullable, all-or-nothing, so a deleted
--      account's entries are redacted to NULL instead of fabricated values.
--   1. FK hardening   CASCADE from a user into shared/history tables  -> RESTRICT
--                     nullable historical attribution (…_by)          -> SET NULL
--                     reviews + SMS-consent records re-pointed from auth.users to profiles
--                     profiles.id -> auth.users FK replaced by guard triggers (see §2)
--   2. Guards         an auth user with a profile is deleted ONLY inside delete_user_account
--                     (dashboard / admin API / SQL refused); new profile ids must be auth users;
--                     tombstone identifiers reserved; a deleted profile can gain no new
--                     relationship (owner/director/player/entrant/participant) and receives no
--                     new notifications or messages.
--   3. delete_user_account  rewritten: server-side, self only, refuses admins, structured
--                     blockers for ACTIVE ownership, explicit deletes of approved personal
--                     tables only, tombstone instead of DELETE FROM profiles.
--   4. Grants         anon / PUBLIC can no longer execute delete_user_account.
--
-- Tests : supabase/tests/account_deletion_integrity.test.ts (PGlite, full prod schema replay)
-- Rollback: supabase/rollback/20261014120000_account_deletion_integrity_rollback.sql
-- ============================================================================================

-- ── 0. PROPOSED SCHEMA CHANGE (needs explicit approval) — giveaway entry PII may be NULL ────
-- Entry PII (legal name, birthday, email, phone) is NOT NULL today, so redacting a deleted
-- account's entries would require fabricated values. Smallest safe change: allow NULL, but
-- only as an all-or-nothing redaction — a live entry still needs all four fields (the entry
-- RPCs / RLS insert path already require them), a redacted entry has none of them.
-- Existing rows all satisfy the check (every row has all four today).
ALTER TABLE public.giveaway_entries
  ALTER COLUMN name_as_on_id DROP NOT NULL,
  ALTER COLUMN birthday      DROP NOT NULL,
  ALTER COLUMN email         DROP NOT NULL,
  ALTER COLUMN phone         DROP NOT NULL,
  ADD CONSTRAINT giveaway_entries_pii_complete_or_redacted CHECK (
    (name_as_on_id IS NOT NULL AND birthday IS NOT NULL AND email IS NOT NULL AND phone IS NOT NULL)
    OR (name_as_on_id IS NULL AND birthday IS NULL AND email IS NULL AND phone IS NULL));

-- ── 1. FK hardening ────────────────────────────────────────────────────────────────────────

-- 1a. Shared / historical rows: CASCADE -> RESTRICT (a user can no longer take these with them).
ALTER TABLE public.conversations DROP CONSTRAINT conversations_created_by_fkey,
  ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.conversation_messages DROP CONSTRAINT conversation_messages_sender_id_fkey,
  ADD CONSTRAINT conversation_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.conversation_participants DROP CONSTRAINT conversation_participants_user_id_fkey,
  ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.notification_messages DROP CONSTRAINT notification_messages_sender_id_fkey,
  ADD CONSTRAINT notification_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.giveaway_credit_ledger DROP CONSTRAINT giveaway_credit_ledger_profile_id_fkey,
  ADD CONSTRAINT giveaway_credit_ledger_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id_auto) ON DELETE RESTRICT;
ALTER TABLE public.giveaway_wallets DROP CONSTRAINT giveaway_wallets_profile_id_fkey,
  ADD CONSTRAINT giveaway_wallets_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id_auto) ON DELETE RESTRICT;
ALTER TABLE public.referral_codes DROP CONSTRAINT referral_codes_profile_id_fkey,
  ADD CONSTRAINT referral_codes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id_auto) ON DELETE RESTRICT;
ALTER TABLE public.referrals DROP CONSTRAINT referrals_referred_profile_id_fkey,
  ADD CONSTRAINT referrals_referred_profile_id_fkey FOREIGN KEY (referred_profile_id) REFERENCES public.profiles(id_auto) ON DELETE RESTRICT;
ALTER TABLE public.reports DROP CONSTRAINT reports_reporter_id_fkey,
  ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- 1b. Team captain: CASCADE deleted the whole team (partner's history too) -> SET NULL.
--     (captain_player_id keeps the team's link to the retained player row.)
ALTER TABLE public.tournament_teams DROP CONSTRAINT tournament_teams_captain_id_fkey,
  ADD CONSTRAINT tournament_teams_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;

-- 1c. Nullable historical attribution: NO ACTION -> SET NULL (history kept, actor unknown).
ALTER TABLE public.tournaments DROP CONSTRAINT tournaments_archived_by_fkey,
  ADD CONSTRAINT tournaments_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.tournaments DROP CONSTRAINT tournaments_cancelled_by_fkey,
  ADD CONSTRAINT tournaments_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.tournament_templates DROP CONSTRAINT tournament_templates_archived_by_fkey,
  ADD CONSTRAINT tournament_templates_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.venue_directors DROP CONSTRAINT venue_directors_archived_by_fkey,
  ADD CONSTRAINT venue_directors_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.venue_directors DROP CONSTRAINT venue_directors_assigned_by_fkey,
  ADD CONSTRAINT venue_directors_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.venue_owners DROP CONSTRAINT venue_owners_archived_by_fkey,
  ADD CONSTRAINT venue_owners_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.venue_owners DROP CONSTRAINT venue_owners_assigned_by_fkey,
  ADD CONSTRAINT venue_owners_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.venues DROP CONSTRAINT venues_archived_by_fkey,
  ADD CONSTRAINT venues_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.giveaways DROP CONSTRAINT giveaways_winner_drawn_by_fkey,
  ADD CONSTRAINT giveaways_winner_drawn_by_fkey FOREIGN KEY (winner_drawn_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.giveaway_winner_history DROP CONSTRAINT giveaway_winner_history_disqualified_by_fkey,
  ADD CONSTRAINT giveaway_winner_history_disqualified_by_fkey FOREIGN KEY (disqualified_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.giveaway_draws DROP CONSTRAINT giveaway_draws_invalidated_by_fkey,
  ADD CONSTRAINT giveaway_draws_invalidated_by_fkey FOREIGN KEY (invalidated_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.support_tickets DROP CONSTRAINT support_tickets_assigned_to_fkey,
  ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;
ALTER TABLE public.support_tickets DROP CONSTRAINT support_tickets_resolved_by_fkey,
  ADD CONSTRAINT support_tickets_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;

-- 1d. Reviews + SMS consent records hung off auth.users with CASCADE (deleting the auth user
--     deleted every review the person wrote and their consent audit trail). Same uuid, now
--     referencing the (tombstone-able) profile, RESTRICT.
ALTER TABLE public.tournament_reviews DROP CONSTRAINT tournament_reviews_reviewer_id_fkey,
  ADD CONSTRAINT tournament_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.sms_consent_events DROP CONSTRAINT sms_consent_events_user_id_fkey,
  ADD CONSTRAINT sms_consent_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- 1e. profiles.id -> auth.users (NO ACTION) made a tombstone impossible (the auth user could
--     never be deleted while the profile row exists). Replaced by the two guards in §2, which
--     keep both halves of the old guarantee.
ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;

-- ── 2. Guards ──────────────────────────────────────────────────────────────────────────────

-- 2a. A profile's id must be a real auth user when the profile is created or its id changes.
CREATE OR REPLACE FUNCTION public.tg_profiles_require_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not exists (select 1 from auth.users u where u.id = new.id) then
    raise exception 'profiles.id % has no auth user', new.id using errcode = '23503';
  end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.tg_profiles_require_auth_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_require_auth_user
  BEFORE INSERT OR UPDATE OF id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_require_auth_user();

-- 2b. An auth user that has a profile can only be deleted INSIDE the approved deletion flow:
--     delete_user_account tombstones the profile and then marks this transaction for exactly
--     that user id. Anything else (Supabase dashboard "Delete user", admin API, raw SQL, an
--     admin soft-deleted profile that still holds personal data) is refused. Auth users with no
--     profile (abandoned sign-ups) delete as before.
CREATE OR REPLACE FUNCTION public.tg_auth_users_block_live_profile_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if exists (select 1 from public.profiles p where p.id = old.id)
     and not (
       coalesce(current_setting('compete.account_deletion_uid', true), '') = old.id::text
       and exists (select 1 from public.profiles p
                    where p.id = old.id and p.status = 'deleted' and p.deleted_at is not null
                      and p.user_name = 'deleted:' || p.id_auto)) then
    raise exception 'This user has a Compete profile; accounts are deleted only through delete_user_account'
      using errcode = '23503';
  end if;
  return old;
end;
$function$;
REVOKE ALL ON FUNCTION public.tg_auth_users_block_live_profile_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER auth_users_block_live_profile_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_auth_users_block_live_profile_delete();

-- 2c. Tombstone identifiers are reserved: no live profile may use them, so they can never
--     collide with sign-up, username availability, or username/email login. (The app already
--     strips ':' from usernames; this also covers direct API writes.) 0 prod rows match today.
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tombstone_identifiers_reserved CHECK (
  status = 'deleted'
  OR (lower(user_name) NOT LIKE 'deleted:%' AND lower(email) NOT LIKE '%@deleted.invalid'));

-- 2d. A deleted profile (tombstone, or admin soft-deleted) can never gain a NEW relationship:
--     it cannot be made a venue owner/director, tournament/series director, team captain or
--     member, registered player, giveaway entrant, credit recipient or conversation participant
--     (RAISE), and it silently receives no new notifications or messages (row SKIPPED, so a
--     broadcast to many users is never aborted by one deleted recipient). Existing historical
--     rows that already point at the profile are untouched; only new / changed references are
--     checked.
CREATE OR REPLACE FUNCTION public._profile_is_deleted(p_id_auto bigint, p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.profiles p
                  where (p.id_auto = p_id_auto or p.id = p_uid)
                    and (p.status = 'deleted' or p.deleted_at is not null));
$function$;
REVOKE ALL ON FUNCTION public._profile_is_deleted(bigint, uuid) FROM PUBLIC, anon, authenticated;

-- TG_ARGV: [0] column name, [1] 'id_auto' | 'uuid', [2] 'raise' | 'skip'
CREATE OR REPLACE FUNCTION public.tg_reject_deleted_profile_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_new text := to_jsonb(new) ->> tg_argv[0];
begin
  if v_new is null then return new; end if;
  if tg_op = 'UPDATE' and v_new is not distinct from (to_jsonb(old) ->> tg_argv[0]) then return new; end if;
  if (tg_argv[1] = 'id_auto' and public._profile_is_deleted(v_new::bigint, null))
     or (tg_argv[1] = 'uuid' and public._profile_is_deleted(null, v_new::uuid)) then
    if tg_argv[2] = 'skip' then return null; end if;
    raise exception 'This account has been deleted and cannot be added here (%.%)', tg_table_name, tg_argv[0]
      using errcode = '23503';
  end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.tg_reject_deleted_profile_ref() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER venue_owners_no_deleted_profile BEFORE INSERT OR UPDATE OF owner_id ON public.venue_owners
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('owner_id', 'id_auto', 'raise');
CREATE TRIGGER venue_directors_no_deleted_profile BEFORE INSERT OR UPDATE OF director_id ON public.venue_directors
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('director_id', 'id_auto', 'raise');
CREATE TRIGGER tournaments_no_deleted_director BEFORE INSERT OR UPDATE OF director_id ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('director_id', 'id_auto', 'raise');
CREATE TRIGGER tournament_templates_no_deleted_director BEFORE INSERT OR UPDATE OF director_id ON public.tournament_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('director_id', 'id_auto', 'raise');
CREATE TRIGGER tournament_teams_no_deleted_captain BEFORE INSERT OR UPDATE OF captain_id ON public.tournament_teams
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('captain_id', 'id_auto', 'raise');
CREATE TRIGGER tournament_team_members_no_deleted_player BEFORE INSERT OR UPDATE OF player_id ON public.tournament_team_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('player_id', 'id_auto', 'raise');
CREATE TRIGGER tournament_players_no_deleted_player BEFORE INSERT OR UPDATE OF player_id ON public.tournament_players
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('player_id', 'id_auto', 'raise');
CREATE TRIGGER giveaway_entries_no_deleted_entrant BEFORE INSERT OR UPDATE OF user_id ON public.giveaway_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('user_id', 'id_auto', 'raise');
-- A deleted profile can never be recorded as a NEW winner (covers the app's client-side re-draw
-- after a disqualification, which picks from all remaining entries, and the server wallet draw).
CREATE TRIGGER giveaways_no_deleted_winner BEFORE INSERT OR UPDATE OF winner_id ON public.giveaways
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('winner_id', 'id_auto', 'raise');
CREATE TRIGGER giveaway_winner_history_no_deleted_profile BEFORE INSERT OR UPDATE OF user_id ON public.giveaway_winner_history
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('user_id', 'id_auto', 'raise');
CREATE TRIGGER giveaway_draws_no_deleted_winner BEFORE INSERT OR UPDATE OF winner_id ON public.giveaway_draws
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('winner_id', 'id_auto', 'raise');
CREATE TRIGGER giveaway_credit_ledger_no_deleted_profile BEFORE INSERT OR UPDATE OF profile_id ON public.giveaway_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('profile_id', 'id_auto', 'raise');
CREATE TRIGGER conversation_participants_no_deleted_profile BEFORE INSERT OR UPDATE OF user_id ON public.conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('user_id', 'uuid', 'raise');
CREATE TRIGGER notifications_skip_deleted_profile BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('user_id', 'id_auto', 'skip');
CREATE TRIGGER message_recipients_skip_deleted_profile BEFORE INSERT ON public.message_recipients
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('user_id', 'id_auto', 'skip');
CREATE TRIGGER notification_message_recipients_skip_deleted_profile BEFORE INSERT ON public.notification_message_recipients
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_deleted_profile_ref('user_id', 'uuid', 'skip');

-- ── 3. delete_user_account ─────────────────────────────────────────────────────────────────

-- Active-ownership blockers for one account, as a JSON array (empty = none). Historical
-- ownership (finished tournaments, archived templates/venue links, past giveaways) never blocks.
CREATE OR REPLACE FUNCTION public._account_deletion_blockers(p_id_auto bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(b) filter (where (b->>'count')::int > 0), '[]'::jsonb)
  from (
    select jsonb_build_object('code', 'active_tournaments_directed',
             'count', count(*), 'ids', coalesce(jsonb_agg(t.id order by t.id) filter (where t.id is not null), '[]'::jsonb)) b
      from public.tournaments t
     where t.director_id = p_id_auto
       and t.status = 'active' and t.archived_at is null
       and (t.tournament_date >= current_date
            or t.live_state in ('registration_open', 'registration_closed', 'in_progress'))
    union all
    select jsonb_build_object('code', 'active_templates_directed',
             'count', count(*), 'ids', coalesce(jsonb_agg(tt.id order by tt.id) filter (where tt.id is not null), '[]'::jsonb))
      from public.tournament_templates tt
     where tt.director_id = p_id_auto and tt.archived_at is null and coalesce(tt.status, 'active') in ('active', 'paused')
    union all
    select jsonb_build_object('code', 'active_venue_ownership',
             'count', count(*), 'ids', coalesce(jsonb_agg(vo.venue_id order by vo.venue_id) filter (where vo.venue_id is not null), '[]'::jsonb))
      from public.venue_owners vo
     where vo.owner_id = p_id_auto and vo.archived_at is null
  ) x;
$function$;
REVOKE ALL ON FUNCTION public._account_deletion_blockers(bigint) FROM PUBLIC, anon, authenticated;

-- What would block the CALLER's own deletion (lets the app explain before trying). Read-only.
CREATE OR REPLACE FUNCTION public.get_my_account_deletion_blockers()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id_auto bigint; v_role text;
begin
  select id_auto, role into v_id_auto, v_role from public.profiles
   where id = auth.uid() and deleted_at is null;
  if v_id_auto is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v_role in ('compete_admin', 'super_admin') then
    return jsonb_build_array(jsonb_build_object('code', 'admin_account', 'count', 1, 'ids', '[]'::jsonb));
  end if;
  return public._account_deletion_blockers(v_id_auto);
end;
$function$;
REVOKE ALL ON FUNCTION public.get_my_account_deletion_blockers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_deletion_blockers() TO authenticated;

-- Self-service account deletion. Still `returns void` and still RAISES on refusal, so every
-- shipped app build keeps working (a refusal can never look like success). The refusal message
-- is unchanged; the structured reason is in the error DETAIL as JSON:
--   {"code":"admin_account"}  |  {"code":"owns_active_records","blockers":[{code,count,ids},...]}
CREATE OR REPLACE FUNCTION public.delete_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_id_auto    bigint;
  v_role       text;
  v_blockers   jsonb;
  v_player_ids uuid[];
  v_big_ids    bigint[];
  v_txt_ids    text[];
  v_hist_uuids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- Lock the caller's own profile (concurrent deletes / role changes wait here).
  -- (An admin soft-deleted profile still holding personal data may complete its own deletion.)
  SELECT id_auto, role INTO v_id_auto, v_role
    FROM profiles WHERE id = v_uid
     FOR UPDATE;
  IF v_id_auto IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', v_uid;
  END IF;

  -- ── Refusals: nothing below runs ───────────────────────────────────────────────────────
  IF v_role IN ('compete_admin', 'super_admin') THEN
    RAISE EXCEPTION 'This account must be transferred or removed by another administrator.'
      USING ERRCODE = 'P0001', DETAIL = jsonb_build_object('code', 'admin_account')::text;
  END IF;

  v_blockers := public._account_deletion_blockers(v_id_auto);
  IF jsonb_array_length(v_blockers) > 0 THEN
    RAISE EXCEPTION 'This account must be transferred or removed by another administrator.'
      USING ERRCODE = 'P0001',
            DETAIL  = jsonb_build_object('code', 'owns_active_records', 'blockers', v_blockers)::text,
            HINT    = 'Reassign or end the listed tournaments, recurring series and venue ownership first.';
  END IF;

  -- ── A. Personal / private data: deleted (explicitly — nothing relies on cascades) ───────
  DELETE FROM alert_matches WHERE alert_id IN (SELECT id FROM search_alerts WHERE user_id = v_id_auto);
  DELETE FROM search_alerts WHERE user_id = v_id_auto;
  DELETE FROM saved_searches WHERE user_id = v_id_auto;
  DELETE FROM favorites WHERE user_id = v_id_auto;
  DELETE FROM notifications WHERE user_id = v_id_auto;                 -- own inbox
  DELETE FROM message_recipients WHERE user_id = v_id_auto;            -- own inbox copies
  DELETE FROM notification_message_recipients WHERE user_id = v_uid;   -- own inbox copies
  DELETE FROM notification_preferences WHERE user_id = v_uid;
  DELETE FROM push_tokens WHERE user_id = v_uid;
  DELETE FROM message_rate_limits WHERE sender_id = v_uid;
  DELETE FROM tournament_templates_user WHERE user_id = v_id_auto;
  DELETE FROM tournament_settings_templates WHERE user_id = v_id_auto;
  DELETE FROM featured_players WHERE user_id = v_id_auto;              -- a showcase of this person
  DELETE FROM user_blocks WHERE blocker_id = v_uid OR blocked_id = v_uid;
  DELETE FROM sms_verification_attempts WHERE user_id = v_uid;
  DELETE FROM tournament_review_reads WHERE viewer_id = v_uid;
  DELETE FROM tournament_review_archives WHERE viewer_id = v_uid;
  DELETE FROM image_scan_logs WHERE user_id = v_uid;

  -- ── B. Shared / historical rows: KEPT, de-identified where they carry personal fields ───
  -- Giveaways NOT yet drawn (no winner, no winner record; any status except cancelled — an
  -- archived undrawn giveaway can be restored and drawn): this account's entries are WITHDRAWN,
  -- so a deleted account can never win a future draw (no app update needed; other users' entries
  -- are untouched). An entry already referenced by a winner-history or draw record is history
  -- and is kept (redacted below); the §2d guards stop it from ever becoming a new winner.
  DELETE FROM giveaway_entries e
   USING giveaways g
   WHERE e.user_id = v_id_auto
     AND g.id = e.giveaway_id
     AND g.status <> 'cancelled'
     AND g.winner_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM giveaway_winner_history w WHERE w.giveaway_id = g.id AND w.status = 'winner')
     AND NOT EXISTS (SELECT 1 FROM giveaway_winner_history w WHERE w.entry_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM giveaway_draws d WHERE d.entry_id = e.id);

  -- Concluded giveaways: entries stay (ids, giveaway, quantity, timestamps, draws and winner
  -- history all preserved). Entrant PII is removed (NULL — see §0), except on entries recorded
  -- as a WINNING entry, which keep their prize record intact.
  UPDATE giveaway_entries e
     SET name_as_on_id = NULL, birthday = NULL, email = NULL, phone = NULL, opted_in_promotions = false
   WHERE e.user_id = v_id_auto
     AND NOT EXISTS (SELECT 1 FROM giveaway_winner_history w WHERE w.entry_id = e.id AND w.status = 'winner');

  -- The account's referral code stops working; referral history and credits are kept.
  UPDATE referral_codes SET disabled_at = now() WHERE profile_id = v_id_auto AND disabled_at IS NULL;

  -- Active director assignments end (the row and its history stay).
  UPDATE venue_directors SET archived_at = now() WHERE director_id = v_id_auto AND archived_at IS NULL;

  -- Reassignment log stores names as text: de-identify them (ids still point at the tombstone).
  UPDATE reassignment_logs SET previous_user_name = 'Deleted user' WHERE previous_user_id = v_id_auto;
  UPDATE reassignment_logs SET new_user_name = 'Deleted user' WHERE new_user_id = v_id_auto;
  UPDATE reassignment_logs SET reassigned_by_name = 'Deleted user' WHERE reassigned_by = v_id_auto;

  -- Tournament / chip history: unchanged from the previous version — rows are kept, unlinked
  -- from the profile, and stay attached to the retained (de-identified) player row.
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_player_ids
    FROM players WHERE profile_id = v_uid;

  UPDATE tournament_players SET player_id = NULL WHERE player_id = v_id_auto;
  UPDATE tournament_team_members SET player_id = NULL WHERE player_id = v_id_auto;

  SELECT coalesce(array_agg(id), ARRAY[]::text[]), coalesce(array_agg(p1_player_id), ARRAY[]::uuid[])
    INTO v_txt_ids, v_hist_uuids FROM chip_entries WHERE p1_profile_id = v_id_auto;
  IF array_length(v_txt_ids, 1) > 0 THEN
    UPDATE chip_entries SET p1_profile_id = NULL WHERE id = ANY(v_txt_ids);
    UPDATE chip_entries ce SET p1_player_id = u.pu FROM unnest(v_txt_ids, v_hist_uuids) AS u(id, pu) WHERE ce.id = u.id;
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::text[]), coalesce(array_agg(p2_player_id), ARRAY[]::uuid[])
    INTO v_txt_ids, v_hist_uuids FROM chip_entries WHERE p2_profile_id = v_id_auto;
  IF array_length(v_txt_ids, 1) > 0 THEN
    UPDATE chip_entries SET p2_profile_id = NULL WHERE id = ANY(v_txt_ids);
    UPDATE chip_entries ce SET p2_player_id = u.pu FROM unnest(v_txt_ids, v_hist_uuids) AS u(id, pu) WHERE ce.id = u.id;
  END IF;
  UPDATE chip_entries SET p1_phone = NULL WHERE p1_phone IS NOT NULL AND p1_player_id = ANY(v_player_ids);

  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]), coalesce(array_agg(p1_player_id), ARRAY[]::uuid[])
    INTO v_big_ids, v_hist_uuids FROM chip_results WHERE p1_profile_id = v_id_auto;
  IF array_length(v_big_ids, 1) > 0 THEN
    UPDATE chip_results SET p1_profile_id = NULL WHERE id = ANY(v_big_ids);
    UPDATE chip_results cr SET p1_player_id = u.pu FROM unnest(v_big_ids, v_hist_uuids) AS u(id, pu) WHERE cr.id = u.id;
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]), coalesce(array_agg(p2_player_id), ARRAY[]::uuid[])
    INTO v_big_ids, v_hist_uuids FROM chip_results WHERE p2_profile_id = v_id_auto;
  IF array_length(v_big_ids, 1) > 0 THEN
    UPDATE chip_results SET p2_profile_id = NULL WHERE id = ANY(v_big_ids);
    UPDATE chip_results cr SET p2_player_id = u.pu FROM unnest(v_big_ids, v_hist_uuids) AS u(id, pu) WHERE cr.id = u.id;
  END IF;

  UPDATE tournament_teams
     SET captain_id = NULL, captain_player_id = coalesce(captain_player_id, v_player_ids[1])
   WHERE captain_id = v_id_auto AND coalesce(captain_player_id, v_player_ids[1]) IS NOT NULL;

  IF array_length(v_player_ids, 1) > 0 THEN
    DELETE FROM player_invitations WHERE player_id = ANY(v_player_ids);
    UPDATE players
       SET email = NULL, phone_e164 = NULL, profile_id = NULL, account_status = 'DISABLED', updated_at = now()
     WHERE id = ANY(v_player_ids);
  END IF;

  -- ── Tombstone: the profile row stays (every reference remains valid), personal data goes ─
  UPDATE profiles
     SET email = 'deleted+' || v_id_auto || '@deleted.invalid',
         user_name = 'deleted:' || v_id_auto,
         name = 'Deleted User',
         first_name = NULL, last_name = NULL, avatar_url = NULL,
         home_city = NULL, zip_code = NULL, preferred_game = NULL, favorite_player = NULL,
         phone_number = NULL, phone_verified_at = NULL,
         phone_verification_provider = NULL, phone_verification_method = NULL,
         fargo = NULL, fargo_last_verified_at = NULL, fargo_verified_by = NULL,
         last_login_at = NULL, last_active_at = NULL,
         notify_saved_search_matches = false, notify_favorite_updates = false,
         notify_tournament_reminders = false, notify_cancellations = false,
         notify_new_giveaways = false, notify_giveaway_winners = false,
         notify_promotions = false, notify_app_updates = false,
         role = 'basic_user', status = 'deleted', is_disabled = true,
         deleted_at = now(), deleted_by = v_id_auto, updated_at = now()
   WHERE id = v_uid;

  -- Credentials, identities (Apple/Google), sessions, MFA: gone. The §2b guard allows it only
  -- for this tombstoned profile, in this transaction. Same email / Apple ID can sign up fresh.
  PERFORM set_config('compete.account_deletion_uid', v_uid::text, true);
  DELETE FROM auth.users WHERE id = v_uid;
  PERFORM set_config('compete.account_deletion_uid', '', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
