-- 20261012120100_account_deletion_hardening.sql
-- Google Play account-deletion compliance. delete_user_account() failed for some users and
-- left personal data behind. This migration:
--
--   1. Unblocks deletion: bar_requests, image_scan_logs, venue_audits and reassignment_logs
--      referenced the account with NO ACTION FKs the function never cleared. Their FKs become
--      ON DELETE SET NULL (reassignment_logs' user columns become nullable), and the function
--      also clears them explicitly (scan logs of the user's uploads are deleted; the
--      reassignment audit keeps the event but renames the deleted party "Deleted user").
--   2. Scrubs retained history: the account's `players` identity row is KEPT (tournament
--      results, brackets, chip history and teams reference it) but loses email, phone and
--      its profile link and becomes DISABLED (so it can never be re-claimed by email);
--      its pending invitations are deleted; chip_entries drop the stored phone and the
--      profile link. The player's name stays on past results for event integrity.
--   3. Protects team history: tournament_teams.captain_id is ON DELETE CASCADE, so deleting
--      a Scotch/team captain used to delete the whole team (partner included). Captaincy is
--      moved to the captain's retained `players` row before the profile is deleted.
--   4. Protects other players' tournament history: a TD / bar owner whose tournaments contain
--      OTHER players' registrations, teams or chip entries can no longer wipe them via
--      self-service deletion. The RPC stops with a clear message routing the request to
--      support (the in-app error shows the server message verbatim, incl. on old builds).
--      Staff with only plain listings (no participants) still delete exactly as before.
--   5. Keeps the deleted user's history linked to their retained player row. Clearing a
--      registration's / team seat's / chip row's profile id made the players-sync triggers
--      re-derive the player uuid from NULL: on tournament_players that violated
--      tournament_players_identity_chk, so deleting ANY user with a registration failed; on
--      team seats it silently orphaned the row. The tournament_players / team-member /
--      team-captain sync triggers now keep the player uuid when the profile id is cleared
--      (a path that previously always errored or orphaned data); chip rows are unlinked and
--      their player uuid restored explicitly (their trigger is unchanged).
--
-- Verified in a rolled-back production transaction (see the Stage report): the current
-- function fails for a bar-request submitter and for a registered player; the new one
-- deletes both (profile + auth user gone, player row de-identified, every registration /
-- team seat / chip entry / chip result count unchanged) and refuses a TD with players.
--
-- Everything else in the original function is unchanged.

begin;

-- ── 1. FKs that blocked deletion ──────────────────────────────────────────────────────
alter table public.bar_requests drop constraint if exists bar_requests_submitted_by_fkey;
alter table public.bar_requests add constraint bar_requests_submitted_by_fkey
  foreign key (submitted_by) references auth.users(id) on delete set null;
alter table public.bar_requests drop constraint if exists bar_requests_reviewed_by_fkey;
alter table public.bar_requests add constraint bar_requests_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table public.image_scan_logs drop constraint if exists image_scan_logs_user_id_fkey;
alter table public.image_scan_logs add constraint image_scan_logs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.venue_audits drop constraint if exists venue_audits_owner_id_fkey;
alter table public.venue_audits add constraint venue_audits_owner_id_fkey
  foreign key (owner_id) references public.profiles(id_auto) on delete set null;

alter table public.reassignment_logs alter column previous_user_id drop not null;
alter table public.reassignment_logs alter column new_user_id drop not null;
alter table public.reassignment_logs alter column reassigned_by drop not null;
alter table public.reassignment_logs drop constraint if exists reassignment_logs_previous_user_fkey;
alter table public.reassignment_logs add constraint reassignment_logs_previous_user_fkey
  foreign key (previous_user_id) references public.profiles(id_auto) on delete set null;
alter table public.reassignment_logs drop constraint if exists reassignment_logs_new_user_fkey;
alter table public.reassignment_logs add constraint reassignment_logs_new_user_fkey
  foreign key (new_user_id) references public.profiles(id_auto) on delete set null;
alter table public.reassignment_logs drop constraint if exists reassignment_logs_reassigned_by_fkey;
alter table public.reassignment_logs add constraint reassignment_logs_reassigned_by_fkey
  foreign key (reassigned_by) references public.profiles(id_auto) on delete set null;

-- ── 3 (applied first). captain sync trigger: clearing captain_id keeps the player link ──
-- Before: captain_id → NULL with captain_player_id unchanged re-derived captain_player_id
-- from NULL, leaving both NULL — which ALWAYS violated tournament_teams' CHECK
-- (captain_id IS NOT NULL OR captain_player_id IS NOT NULL). Guarding that branch only changes
-- a path that previously always errored; every other path is identical.
CREATE OR REPLACE FUNCTION public.tg_sync_tt_captain_player_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_d uuid;
begin
  v_d := public.map_id_auto_to_player(new.captain_id);
  if tg_op = 'UPDATE' then
    if new.captain_id is distinct from old.captain_id
       and new.captain_id is not null
       and new.captain_player_id is not distinct from old.captain_player_id then
      new.captain_player_id := v_d;
    elsif new.captain_player_id is null and new.captain_id is not null then
      new.captain_player_id := v_d;
    elsif new.captain_player_id is not null and new.captain_id is not null
          and new.captain_player_id is distinct from v_d then
      raise exception 'players sync: tournament_teams.captain_player_id (%) conflicts with captain_id (%)', new.captain_player_id, new.captain_id;
    end if;
  else
    if new.captain_player_id is null and new.captain_id is not null then
      new.captain_player_id := v_d;
    elsif new.captain_player_id is not null and new.captain_id is not null
          and new.captain_player_id is distinct from v_d then
      raise exception 'players sync: tournament_teams.captain_player_id (%) conflicts with captain_id (%)', new.captain_player_id, new.captain_id;
    end if;
  end if;
  return new;
end $function$;

-- Same guard for registrations / team seats. Clearing player_id with player_uuid unchanged
-- used to re-derive player_uuid from NULL: on tournament_players that violated
-- tournament_players_identity_chk (so deleting ANY registered user failed), and on
-- tournament_team_members it silently orphaned the seat. No app flow clears player_id.
CREATE OR REPLACE FUNCTION public.tg_sync_tp_player_uuid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_d uuid;
begin
  v_d := public.map_id_auto_to_player(new.player_id);
  if tg_op = 'UPDATE' then
    if new.player_id is distinct from old.player_id
       and new.player_id is not null
       and new.player_uuid is not distinct from old.player_uuid then
      new.player_uuid := v_d;
    elsif new.player_uuid is null and new.player_id is not null then
      new.player_uuid := v_d;
    elsif new.player_uuid is not null and new.player_id is not null
          and new.player_uuid is distinct from v_d then
      raise exception 'players sync: tournament_players.player_uuid (%) conflicts with player_id (%)', new.player_uuid, new.player_id;
    end if;
  else
    if new.player_uuid is null and new.player_id is not null then
      new.player_uuid := v_d;
    elsif new.player_uuid is not null and new.player_id is not null
          and new.player_uuid is distinct from v_d then
      raise exception 'players sync: tournament_players.player_uuid (%) conflicts with player_id (%)', new.player_uuid, new.player_id;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tg_sync_ttm_player_uuid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_d uuid;
begin
  v_d := public.map_id_auto_to_player(new.player_id);
  if tg_op = 'UPDATE' then
    if new.player_id is distinct from old.player_id
       and new.player_id is not null
       and new.player_uuid is not distinct from old.player_uuid then
      new.player_uuid := v_d;
    elsif new.player_uuid is null and new.player_id is not null then
      new.player_uuid := v_d;
    elsif new.player_uuid is not null and new.player_id is not null
          and new.player_uuid is distinct from v_d then
      raise exception 'players sync: tournament_team_members.player_uuid (%) conflicts with player_id (%)', new.player_uuid, new.player_id;
    end if;
  else
    if new.player_uuid is null and new.player_id is not null then
      new.player_uuid := v_d;
    elsif new.player_uuid is not null and new.player_id is not null
          and new.player_uuid is distinct from v_d then
      raise exception 'players sync: tournament_team_members.player_uuid (%) conflicts with player_id (%)', new.player_uuid, new.player_id;
    end if;
  end if;
  return new;
end $function$;

-- ── 2. delete_user_account ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid   := auth.uid();
  v_id_auto    bigint;
  v_role       text;
  v_venue_ids  int[];
  v_tourn_ids  int[];
  v_tmpl_ids   int[];
  v_conv_ids   uuid[];
  v_msg_ids    int[];
  v_nmsg_ids   uuid[];
  v_player_ids uuid[];
  v_big_ids    bigint[];
  v_txt_ids    text[];
  v_hist_uuids uuid[];
BEGIN

  SELECT id_auto, role INTO v_id_auto, v_role
  FROM profiles WHERE id = v_uid;

  IF v_id_auto IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', v_uid;
  END IF;

  IF v_role IN ('compete_admin', 'super_admin') THEN
    IF (
      SELECT count(*) FROM profiles
      WHERE role IN ('compete_admin', 'super_admin')
        AND id != v_uid
        AND status = 'active'
    ) = 0 THEN
      RAISE EXCEPTION 'Cannot delete the last admin account. Promote another user to admin first.';
    END IF;
  END IF;

  -- NEW: never let self-service deletion wipe OTHER players' tournament history. Tournaments
  -- this account directs (or that sit at venues it owns, for bar owners) and that contain
  -- other players' registrations / teams / chip entries must be transferred by support first.
  IF EXISTS (
    SELECT 1
      FROM tournaments t
     WHERE (t.director_id = v_id_auto
            OR (v_role = 'bar_owner'
                AND t.venue_id IN (SELECT vo.venue_id FROM venue_owners vo WHERE vo.owner_id = v_id_auto)))
       AND (EXISTS (SELECT 1 FROM tournament_players tp WHERE tp.tournament_id = t.id)
            OR EXISTS (SELECT 1 FROM tournament_teams tt WHERE tt.tournament_id = t.id)
            OR EXISTS (SELECT 1 FROM chip_entries ce WHERE ce.tournament_id = t.id))
  ) THEN
    RAISE EXCEPTION 'Your account manages tournaments that include other players'' registrations or results. To protect their history, please email support@thecompeteapp.com with the subject "Account Deletion Request" and we will transfer those events and delete your account within 30 days.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_role = 'bar_owner' THEN
    SELECT coalesce(array_agg(venue_id), ARRAY[]::int[]) INTO v_venue_ids
    FROM venue_owners WHERE owner_id = v_id_auto;
    IF array_length(v_venue_ids, 1) > 0 THEN
      SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_tourn_ids
      FROM tournaments WHERE venue_id = ANY(v_venue_ids);
      SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_tmpl_ids
      FROM tournament_templates WHERE venue_id = ANY(v_venue_ids);
      IF array_length(v_tourn_ids, 1) > 0 THEN
        SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_conv_ids
        FROM conversations WHERE tournament_id = ANY(v_tourn_ids);
        IF array_length(v_conv_ids, 1) > 0 THEN
          DELETE FROM conversation_messages WHERE conversation_id = ANY(v_conv_ids);
          DELETE FROM conversation_participants WHERE conversation_id = ANY(v_conv_ids);
          DELETE FROM conversations WHERE id = ANY(v_conv_ids);
        END IF;
        DELETE FROM alert_matches WHERE tournament_id = ANY(v_tourn_ids);
        DELETE FROM favorites WHERE tournament_id = ANY(v_tourn_ids);
        DELETE FROM tournament_analytics WHERE tournament_id = ANY(v_tourn_ids);
        SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_msg_ids
        FROM messages WHERE tournament_id = ANY(v_tourn_ids);
        IF array_length(v_msg_ids, 1) > 0 THEN
          DELETE FROM message_recipients WHERE message_id = ANY(v_msg_ids);
          DELETE FROM messages WHERE id = ANY(v_msg_ids);
        END IF;
        SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_nmsg_ids
        FROM notification_messages WHERE tournament_id = ANY(v_tourn_ids);
        IF array_length(v_nmsg_ids, 1) > 0 THEN
          DELETE FROM notification_message_recipients WHERE message_id = ANY(v_nmsg_ids);
          DELETE FROM notification_messages WHERE id = ANY(v_nmsg_ids);
        END IF;
        DELETE FROM tournaments WHERE id = ANY(v_tourn_ids);
      END IF;
      IF array_length(v_tmpl_ids, 1) > 0 THEN
        DELETE FROM favorites WHERE template_id = ANY(v_tmpl_ids);
        UPDATE tournaments SET template_id = NULL WHERE template_id = ANY(v_tmpl_ids);
        UPDATE tournaments SET parent_template_id = NULL WHERE parent_template_id = ANY(v_tmpl_ids);
        SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_msg_ids
        FROM messages WHERE template_id = ANY(v_tmpl_ids);
        IF array_length(v_msg_ids, 1) > 0 THEN
          DELETE FROM message_recipients WHERE message_id = ANY(v_msg_ids);
          DELETE FROM messages WHERE id = ANY(v_msg_ids);
        END IF;
        DELETE FROM tournament_templates WHERE id = ANY(v_tmpl_ids);
      END IF;
      SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_msg_ids
      FROM messages WHERE venue_id = ANY(v_venue_ids);
      IF array_length(v_msg_ids, 1) > 0 THEN
        DELETE FROM message_recipients WHERE message_id = ANY(v_msg_ids);
        DELETE FROM messages WHERE id = ANY(v_msg_ids);
      END IF;
      SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_nmsg_ids
      FROM notification_messages WHERE venue_id = ANY(v_venue_ids);
      IF array_length(v_nmsg_ids, 1) > 0 THEN
        DELETE FROM notification_message_recipients WHERE message_id = ANY(v_nmsg_ids);
        DELETE FROM notification_messages WHERE id = ANY(v_nmsg_ids);
      END IF;
      DELETE FROM venue_audits WHERE venue_id = ANY(v_venue_ids);
      DELETE FROM venue_tables WHERE venue_id = ANY(v_venue_ids);
      DELETE FROM venue_directors WHERE venue_id = ANY(v_venue_ids);
      DELETE FROM venue_owners WHERE venue_id = ANY(v_venue_ids);
      DELETE FROM featured_bars WHERE venue_id = ANY(v_venue_ids);
      DELETE FROM venues WHERE id = ANY(v_venue_ids);
    END IF;
  END IF;

  IF v_role IN ('bar_owner', 'tournament_director') THEN
    SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_tourn_ids
    FROM tournaments WHERE director_id = v_id_auto;
    IF array_length(v_tourn_ids, 1) > 0 THEN
      SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_conv_ids
      FROM conversations WHERE tournament_id = ANY(v_tourn_ids);
      IF array_length(v_conv_ids, 1) > 0 THEN
        DELETE FROM conversation_messages WHERE conversation_id = ANY(v_conv_ids);
        DELETE FROM conversation_participants WHERE conversation_id = ANY(v_conv_ids);
        DELETE FROM conversations WHERE id = ANY(v_conv_ids);
      END IF;
      DELETE FROM alert_matches WHERE tournament_id = ANY(v_tourn_ids);
      DELETE FROM favorites WHERE tournament_id = ANY(v_tourn_ids);
      DELETE FROM tournament_analytics WHERE tournament_id = ANY(v_tourn_ids);
      SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_msg_ids
      FROM messages WHERE tournament_id = ANY(v_tourn_ids);
      IF array_length(v_msg_ids, 1) > 0 THEN
        DELETE FROM message_recipients WHERE message_id = ANY(v_msg_ids);
        DELETE FROM messages WHERE id = ANY(v_msg_ids);
      END IF;
      SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_nmsg_ids
      FROM notification_messages WHERE tournament_id = ANY(v_tourn_ids);
      IF array_length(v_nmsg_ids, 1) > 0 THEN
        DELETE FROM notification_message_recipients WHERE message_id = ANY(v_nmsg_ids);
        DELETE FROM notification_messages WHERE id = ANY(v_nmsg_ids);
      END IF;
      DELETE FROM tournaments WHERE id = ANY(v_tourn_ids);
    END IF;
    SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_tmpl_ids
    FROM tournament_templates WHERE director_id = v_id_auto;
    IF array_length(v_tmpl_ids, 1) > 0 THEN
      DELETE FROM favorites WHERE template_id = ANY(v_tmpl_ids);
      UPDATE tournaments SET template_id = NULL WHERE template_id = ANY(v_tmpl_ids);
      UPDATE tournaments SET parent_template_id = NULL WHERE parent_template_id = ANY(v_tmpl_ids);
      SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_msg_ids
      FROM messages WHERE template_id = ANY(v_tmpl_ids);
      IF array_length(v_msg_ids, 1) > 0 THEN
        DELETE FROM message_recipients WHERE message_id = ANY(v_msg_ids);
        DELETE FROM messages WHERE id = ANY(v_msg_ids);
      END IF;
      DELETE FROM tournament_templates WHERE id = ANY(v_tmpl_ids);
    END IF;
  END IF;

  DELETE FROM alert_matches WHERE alert_id IN (
    SELECT id FROM search_alerts WHERE user_id = v_id_auto
  );
  DELETE FROM search_alerts WHERE user_id = v_id_auto;
  DELETE FROM saved_searches WHERE user_id = v_id_auto;
  DELETE FROM favorites WHERE user_id = v_id_auto;
  DELETE FROM giveaway_winner_history WHERE user_id = v_id_auto;
  DELETE FROM giveaway_entries WHERE user_id = v_id_auto;
  DELETE FROM notifications WHERE user_id = v_id_auto;
  DELETE FROM notification_message_recipients WHERE user_id = v_uid;
  DELETE FROM notification_preferences WHERE user_id = v_uid;
  DELETE FROM push_tokens WHERE user_id = v_uid;
  SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_msg_ids
  FROM messages WHERE sender_id = v_id_auto;
  IF array_length(v_msg_ids, 1) > 0 THEN
    DELETE FROM message_recipients WHERE message_id = ANY(v_msg_ids);
    DELETE FROM messages WHERE id = ANY(v_msg_ids);
  END IF;
  DELETE FROM message_recipients WHERE user_id = v_id_auto;
  DELETE FROM message_rate_limits WHERE sender_id = v_uid;
  DELETE FROM conversation_messages WHERE sender_id = v_uid;
  DELETE FROM conversation_participants WHERE user_id = v_uid;
  DELETE FROM support_tickets WHERE user_id = v_id_auto;
  DELETE FROM tournament_templates_user WHERE user_id = v_id_auto;
  DELETE FROM featured_players WHERE user_id = v_id_auto;
  DELETE FROM audit_log WHERE user_id = v_id_auto;
  DELETE FROM venue_directors WHERE director_id = v_id_auto;
  DELETE FROM venue_owners WHERE owner_id = v_id_auto;

  -- Giveaways created by this user (created_by is NOT NULL)
  -- Must cascade: winner_history, entries, draws first
  DELETE FROM giveaway_winner_history WHERE giveaway_id IN (
    SELECT id FROM giveaways WHERE created_by = v_id_auto
  );
  DELETE FROM giveaway_entries WHERE giveaway_id IN (
    SELECT id FROM giveaways WHERE created_by = v_id_auto
  );
  DELETE FROM giveaway_draws WHERE giveaway_id IN (
    SELECT id FROM giveaways WHERE created_by = v_id_auto
  );
  DELETE FROM giveaways WHERE created_by = v_id_auto;

  -- Giveaway draws where this user is winner or drawer (NOT NULL cols)
  DELETE FROM giveaway_draws WHERE winner_id = v_id_auto;
  DELETE FROM giveaway_draws WHERE drawn_by = v_id_auto;
  UPDATE giveaway_draws SET invalidated_by = NULL WHERE invalidated_by = v_id_auto;

  -- Giveaway winner history where this user drew (NOT NULL)
  DELETE FROM giveaway_winner_history WHERE drawn_by = v_id_auto;
  UPDATE giveaway_winner_history SET disqualified_by = NULL WHERE disqualified_by = v_id_auto;

  -- Giveaways where this user won (nullable)
  UPDATE giveaways SET winner_id = NULL WHERE winner_id = v_id_auto;
  UPDATE giveaways SET winner_drawn_by = NULL WHERE winner_drawn_by = v_id_auto;

  -- Support tickets (nullable)
  UPDATE support_tickets SET resolved_by = NULL WHERE resolved_by = v_id_auto;
  UPDATE support_tickets SET assigned_to = NULL WHERE assigned_to = v_id_auto;

  -- Tournaments: director_id is NOT NULL, delete any remaining
  SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_tourn_ids
  FROM tournaments WHERE director_id = v_id_auto;
  IF array_length(v_tourn_ids, 1) > 0 THEN
    SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_conv_ids
    FROM conversations WHERE tournament_id = ANY(v_tourn_ids);
    IF array_length(v_conv_ids, 1) > 0 THEN
      DELETE FROM conversation_messages WHERE conversation_id = ANY(v_conv_ids);
      DELETE FROM conversation_participants WHERE conversation_id = ANY(v_conv_ids);
      DELETE FROM conversations WHERE id = ANY(v_conv_ids);
    END IF;
    DELETE FROM alert_matches WHERE tournament_id = ANY(v_tourn_ids);
    DELETE FROM favorites WHERE tournament_id = ANY(v_tourn_ids);
    DELETE FROM tournament_analytics WHERE tournament_id = ANY(v_tourn_ids);
    SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_msg_ids
    FROM messages WHERE tournament_id = ANY(v_tourn_ids);
    IF array_length(v_msg_ids, 1) > 0 THEN
      DELETE FROM message_recipients WHERE message_id = ANY(v_msg_ids);
      DELETE FROM messages WHERE id = ANY(v_msg_ids);
    END IF;
    SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_nmsg_ids
    FROM notification_messages WHERE tournament_id = ANY(v_tourn_ids);
    IF array_length(v_nmsg_ids, 1) > 0 THEN
      DELETE FROM notification_message_recipients WHERE message_id = ANY(v_nmsg_ids);
      DELETE FROM notification_messages WHERE id = ANY(v_nmsg_ids);
    END IF;
    DELETE FROM tournaments WHERE id = ANY(v_tourn_ids);
  END IF;
  UPDATE tournaments SET archived_by = NULL WHERE archived_by = v_id_auto;
  UPDATE tournaments SET cancelled_by = NULL WHERE cancelled_by = v_id_auto;

  -- Tournament templates: director_id is NOT NULL, delete any remaining
  SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_tmpl_ids
  FROM tournament_templates WHERE director_id = v_id_auto;
  IF array_length(v_tmpl_ids, 1) > 0 THEN
    DELETE FROM favorites WHERE template_id = ANY(v_tmpl_ids);
    UPDATE tournaments SET template_id = NULL WHERE template_id = ANY(v_tmpl_ids);
    UPDATE tournaments SET parent_template_id = NULL WHERE parent_template_id = ANY(v_tmpl_ids);
    SELECT coalesce(array_agg(id), ARRAY[]::int[]) INTO v_msg_ids
    FROM messages WHERE template_id = ANY(v_tmpl_ids);
    IF array_length(v_msg_ids, 1) > 0 THEN
      DELETE FROM message_recipients WHERE message_id = ANY(v_msg_ids);
      DELETE FROM messages WHERE id = ANY(v_msg_ids);
    END IF;
    DELETE FROM tournament_templates WHERE id = ANY(v_tmpl_ids);
  END IF;
  UPDATE tournament_templates SET archived_by = NULL WHERE archived_by = v_id_auto;

  -- Venue references (nullable)
  UPDATE venue_directors SET assigned_by = NULL WHERE assigned_by = v_id_auto;
  UPDATE venue_directors SET archived_by = NULL WHERE archived_by = v_id_auto;
  UPDATE venue_owners SET assigned_by = NULL WHERE assigned_by = v_id_auto;
  UPDATE venue_owners SET archived_by = NULL WHERE archived_by = v_id_auto;
  UPDATE venues SET archived_by = NULL WHERE archived_by = v_id_auto;

  -- Conversations created by user (created_by is NOT NULL)
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_conv_ids
  FROM conversations WHERE created_by = v_uid;
  IF array_length(v_conv_ids, 1) > 0 THEN
    DELETE FROM conversation_messages WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM conversation_participants WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM conversations WHERE id = ANY(v_conv_ids);
  END IF;

  -- Notification messages sent by user (sender_id is NOT NULL)
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_nmsg_ids
  FROM notification_messages WHERE sender_id = v_uid;
  IF array_length(v_nmsg_ids, 1) > 0 THEN
    DELETE FROM notification_message_recipients WHERE message_id = ANY(v_nmsg_ids);
    DELETE FROM notification_messages WHERE id = ANY(v_nmsg_ids);
  END IF;

  -- NEW: records that used to block deletion ------------------------------------------
  UPDATE bar_requests SET submitted_by = NULL WHERE submitted_by = v_uid;   -- venue suggestion stays, unlinked
  UPDATE bar_requests SET reviewed_by = NULL WHERE reviewed_by = v_uid;
  DELETE FROM image_scan_logs WHERE user_id = v_uid;                        -- moderation logs of the user's uploads
  UPDATE venue_audits SET owner_id = NULL WHERE owner_id = v_id_auto;       -- venue data stays, unlinked
  UPDATE reassignment_logs SET previous_user_id = NULL, previous_user_name = 'Deleted user' WHERE previous_user_id = v_id_auto;
  UPDATE reassignment_logs SET new_user_id = NULL, new_user_name = 'Deleted user' WHERE new_user_id = v_id_auto;
  UPDATE reassignment_logs SET reassigned_by = NULL, reassigned_by_name = 'Deleted user' WHERE reassigned_by = v_id_auto;

  -- NEW: retained tournament history is kept but de-identified -------------------------
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_player_ids
  FROM players WHERE profile_id = v_uid;

  -- Unlink history rows from the profile while KEEPING their players link. The players-sync
  -- triggers re-derive the player uuid whenever the profile id changes (to NULL here), so
  -- each table is unlinked first and its original player uuid restored in a second update.
  -- (Previously the FK ON DELETE SET NULL did this implicitly and the trigger erased the
  -- player link, orphaning the deleted user's past results.)
  -- Registrations / team seats: the guarded sync triggers (§3) keep player_uuid when
  -- player_id is cleared.
  UPDATE tournament_players SET player_id = NULL WHERE player_id = v_id_auto;
  UPDATE tournament_team_members SET player_id = NULL WHERE player_id = v_id_auto;

  -- Chip rows: their sync triggers are left unchanged, so unlink then restore the uuid.

  SELECT coalesce(array_agg(id), ARRAY[]::text[]), coalesce(array_agg(p1_player_id), ARRAY[]::uuid[])
    INTO v_txt_ids, v_hist_uuids
    FROM chip_entries WHERE p1_profile_id = v_id_auto;
  IF array_length(v_txt_ids, 1) > 0 THEN
    UPDATE chip_entries SET p1_profile_id = NULL WHERE id = ANY(v_txt_ids);
    UPDATE chip_entries ce SET p1_player_id = u.pu
      FROM unnest(v_txt_ids, v_hist_uuids) AS u(id, pu) WHERE ce.id = u.id;
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::text[]), coalesce(array_agg(p2_player_id), ARRAY[]::uuid[])
    INTO v_txt_ids, v_hist_uuids
    FROM chip_entries WHERE p2_profile_id = v_id_auto;
  IF array_length(v_txt_ids, 1) > 0 THEN
    UPDATE chip_entries SET p2_profile_id = NULL WHERE id = ANY(v_txt_ids);
    UPDATE chip_entries ce SET p2_player_id = u.pu
      FROM unnest(v_txt_ids, v_hist_uuids) AS u(id, pu) WHERE ce.id = u.id;
  END IF;
  -- The stored phone on the user's chip entries (p1 is the only phone column).
  UPDATE chip_entries SET p1_phone = NULL
   WHERE p1_phone IS NOT NULL AND p1_player_id = ANY(v_player_ids);

  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]), coalesce(array_agg(p1_player_id), ARRAY[]::uuid[])
    INTO v_big_ids, v_hist_uuids
    FROM chip_results WHERE p1_profile_id = v_id_auto;
  IF array_length(v_big_ids, 1) > 0 THEN
    UPDATE chip_results SET p1_profile_id = NULL WHERE id = ANY(v_big_ids);
    UPDATE chip_results cr SET p1_player_id = u.pu
      FROM unnest(v_big_ids, v_hist_uuids) AS u(id, pu) WHERE cr.id = u.id;
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]), coalesce(array_agg(p2_player_id), ARRAY[]::uuid[])
    INTO v_big_ids, v_hist_uuids
    FROM chip_results WHERE p2_profile_id = v_id_auto;
  IF array_length(v_big_ids, 1) > 0 THEN
    UPDATE chip_results SET p2_profile_id = NULL WHERE id = ANY(v_big_ids);
    UPDATE chip_results cr SET p2_player_id = u.pu
      FROM unnest(v_big_ids, v_hist_uuids) AS u(id, pu) WHERE cr.id = u.id;
  END IF;

  -- Team captaincy moves to the retained player row (captain_id is ON DELETE CASCADE,
  -- which would otherwise delete the whole team, including the partner's history).
  -- The captain sync trigger keeps captain_player_id when captain_id is cleared (see §3).
  UPDATE tournament_teams
     SET captain_id = NULL,
         captain_player_id = coalesce(captain_player_id, v_player_ids[1])
   WHERE captain_id = v_id_auto
     AND coalesce(captain_player_id, v_player_ids[1]) IS NOT NULL;

  IF array_length(v_player_ids, 1) > 0 THEN
    DELETE FROM player_invitations WHERE player_id = ANY(v_player_ids);
    UPDATE players
       SET email = NULL,            -- email_normalized is generated from email
           phone_e164 = NULL,
           profile_id = NULL,
           account_status = 'DISABLED',
           updated_at = now()
     WHERE id = ANY(v_player_ids);
  END IF;

  DELETE FROM profiles WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;

END;
$function$;

commit;
