--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: _recompute_team_status(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._recompute_team_status(p_team_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update public.tournament_teams t
  set status = case
    when exists (
      select 1 from public.tournament_team_members m
      where m.team_id = t.id and m.invite_status = 'pending'
    ) then 'pending_partner'
    when exists (
      select 1 from public.tournament_team_members m
      where m.team_id = t.id and m.invite_status = 'accepted' and m.is_verified = false
    ) then 'unverified'
    when (select count(*) from public.tournament_team_members m
          where m.team_id = t.id and m.invite_status = 'accepted') >= t.team_size
      then 'registered'
    else 'pending_partner'
  end,
  updated_at = now()
  where t.id = p_team_id;
end; $$;


--
-- Name: _team_caller(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._team_caller() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select id_auto from public.profiles where id = auth.uid();
$$;


--
-- Name: approve_registration_with_fargo(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_registration_with_fargo(p_registration_id bigint, p_fargo integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_tid    bigint;
  v_pid    bigint;
  v_caller bigint;
  v_role   text;
begin
  select tournament_id, player_id
    into v_tid, v_pid
  from public.tournament_players
  where id = p_registration_id;

  if v_tid is null then
    raise exception 'Registration % not found', p_registration_id;
  end if;

  select id_auto, role
    into v_caller, v_role
  from public.profiles
  where id = auth.uid();

  if not exists (
    select 1
    from public.tournaments t
    where t.id = v_tid
      and (
        t.director_id = v_caller
        or v_role in ('compete_admin', 'super_admin')
      )
  ) then
    raise exception 'Not authorized to approve registrations for this tournament';
  end if;

  -- 1–4: the confirmed Fargo becomes the player's verified profile Fargo.
  -- Skipped for guest registrations (no linked account).
  if v_pid is not null then
    update public.profiles
    set fargo                  = p_fargo,
        fargo_status           = 'verified',
        fargo_last_verified_at = now(),
        fargo_verified_by      = v_caller
    where id_auto = v_pid;
  end if;

  -- 5–6: freeze the snapshot for this event and mark the registration approved.
  update public.tournament_players
  set fargo_at_registration = p_fargo,
      fargo_rating          = p_fargo,
      status                = 'approved',
      updated_at            = now()
  where id = p_registration_id;
end;
$$;


--
-- Name: bar_tournament_engagement(bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bar_tournament_engagement(p_tournament_ids bigint[]) RETURNS TABLE(tournament_id bigint, views_count bigint, favorites_count bigint)
    LANGUAGE sql STABLE
    AS $$
  select
    t.id as tournament_id,
    coalesce(v.cnt, 0) as views_count,
    coalesce(f.cnt, 0) as favorites_count
  from unnest(p_tournament_ids) as t(id)
  left join (
    select a.tournament_id, count(*) as cnt
    from public.tournament_analytics a
    where a.event_type = 'view'
      and a.tournament_id = any(p_tournament_ids)
    group by a.tournament_id
  ) v on v.tournament_id = t.id
  left join (
    select fa.tournament_id, count(*) as cnt
    from public.favorites fa
    where fa.tournament_id = any(p_tournament_ids)
    group by fa.tournament_id
  ) f on f.tournament_id = t.id;
$$;


--
-- Name: bump_conversation_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_conversation_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


--
-- Name: cancel_team(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_team(p_team_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_caller bigint; v_captain bigint;
begin
  v_caller := public._team_caller();
  select captain_id into v_captain from public.tournament_teams where id = p_team_id;
  if v_captain is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can cancel the team'; end if;
  delete from public.tournament_teams where id = p_team_id;
end; $$;


--
-- Name: cancel_team_partner(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_team_partner(p_team_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_caller bigint; v_captain bigint; v_locked boolean;
begin
  v_caller := public._team_caller();
  select captain_id, locked into v_captain, v_locked from public.tournament_teams where id = p_team_id;
  if v_captain is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can change the partner'; end if;
  if v_locked then raise exception 'This team is locked — ask the director to unlock it'; end if;
  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';
  perform public._recompute_team_status(p_team_id);
end; $$;


--
-- Name: claim_sms_send(text, uuid, text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_sms_send(p_idempotency_key text, p_user_id uuid, p_message_type text, p_to_e164 text, p_tournament_id bigint DEFAULT NULL::bigint, p_match_id text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id     bigint;
  v_status text;
  v_claim  bigint;
begin
  if p_idempotency_key is null or p_user_id is null or p_to_e164 is null then
    raise exception 'invalid arguments';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key, 0)
  );

  insert into public.sms_messages
    (idempotency_key, user_id, message_type, to_e164, tournament_id, match_id, status)
  values
    (p_idempotency_key, p_user_id, p_message_type, p_to_e164, p_tournament_id, p_match_id, 'queued')
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is not null then
    return 'ok:' || v_id::text;
  end if;

  select id, status into v_id, v_status
  from public.sms_messages where idempotency_key = p_idempotency_key;

  if v_status in ('sent', 'delivered') then
    return 'already_sent';                 -- succeeded: never resend
  elsif v_status = 'delivery_failed' then
    return 'terminal';                     -- terminal (incl. stale_unconfirmed): NEVER auto-resend this key
  elsif v_status = 'sending_failed' then
    update public.sms_messages set status = 'queued', last_status_at = now()
    where id = v_id and status = 'sending_failed'
    returning id into v_claim;
    if v_claim is not null then return 'retry:' || v_id::text; end if;
    return 'in_flight';                    -- another request already claimed the retry
  else
    return 'in_flight';                    -- 'queued': reserved by another in-flight request
  end if;
end;
$$;


--
-- Name: cleanup_old_alert_matches(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_alert_matches(days_to_keep integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM alert_matches 
  WHERE created_at < (now() - INTERVAL '%s days', days_to_keep);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: confirm_team_member_fargo(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_team_member_fargo(p_member_id bigint, p_fargo integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_tid bigint; v_pid bigint; v_caller bigint; v_role text;
begin
  select m.tournament_id, m.player_id into v_tid, v_pid
  from public.tournament_team_members m where m.id = p_member_id;
  if v_tid is null then raise exception 'Team member not found'; end if;

  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid
      and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to confirm Fargo for this tournament';
  end if;

  -- Confirmed Fargo becomes the member's verified profile Fargo (accounts only).
  if v_pid is not null then
    update public.profiles
    set fargo = p_fargo,
        fargo_status = 'verified',
        fargo_last_verified_at = now(),
        fargo_verified_by = v_caller
    where id_auto = v_pid;
  end if;

  -- Freeze the per-event snapshot on the member row.
  update public.tournament_team_members
  set fargo_at_registration = p_fargo,
      suggested_fargo = p_fargo,
      updated_at = now()
  where id = p_member_id;
end; $$;


--
-- Name: create_conversation_with_participants(uuid, text, text, integer, boolean, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_conversation_with_participants(p_created_by uuid, p_subject text DEFAULT NULL::text, p_category text DEFAULT 'general'::text, p_tournament_id integer DEFAULT NULL::integer, p_is_support boolean DEFAULT false, p_recipient_id uuid DEFAULT NULL::uuid, p_first_message text DEFAULT ''::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_convo_id UUID;
  v_admin RECORD;
BEGIN
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
$$;


--
-- Name: create_notification_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_notification_preferences() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: create_team(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_team(p_tournament_id bigint, p_captain_fargo integer) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_caller bigint; v_team bigint;
begin
  v_caller := public._team_caller();
  if v_caller is null then raise exception 'You must be signed in to register a team'; end if;

  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = p_tournament_id
      and m.player_id = v_caller
      and m.invite_status <> 'declined'
  ) then
    raise exception 'You are already on a team for this tournament';
  end if;

  insert into public.tournament_teams (tournament_id, captain_id, status)
  values (p_tournament_id, v_caller, 'pending_partner')
  returning id into v_team;

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (v_team, p_tournament_id, v_caller, 'captain', 'accepted', true, p_captain_fargo);

  return v_team;
end; $$;


--
-- Name: delete_user_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user_account() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  DELETE FROM profiles WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;

END;
$$;


--
-- Name: disable_sms_alerts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disable_sms_alerts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_uid         uuid := auth.uid();
  v_phone       text;
  v_was_enabled boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select phone_number into v_phone from public.profiles where id = v_uid;
  select sms_enabled into v_was_enabled
  from public.notification_preferences where user_id = v_uid;

  update public.notification_preferences
  set sms_enabled = false, sms_opted_out_at = now(), updated_at = now()
  where user_id = v_uid;

  -- Log 'opted_out' ONLY if SMS was actually enabled — no duplicate events when
  -- disabling something already off. phone_number may be NULL (nullable by design).
  if v_was_enabled is true then
    insert into public.sms_consent_events(user_id, phone_number, action, consent_source)
    values (v_uid, v_phone, 'opted_out', 'app_settings');
  end if;
end;
$$;


--
-- Name: enable_sms_alerts(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enable_sms_alerts(p_source text, p_version text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_uid         uuid := auth.uid();
  v_phone       text;
  v_verified    timestamptz;
  v_was_enabled boolean;
  v_old_version text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  -- Clients may only claim these sources; privileged sources are server-only.
  if p_source not in ('app_settings', 'onboarding', 'web_opt_in') then
    raise exception 'Invalid consent source';
  end if;

  select phone_number, phone_verified_at into v_phone, v_verified
  from public.profiles where id = v_uid;

  if v_verified is null then
    raise exception 'Phone must be verified before enabling SMS';
  end if;

  if not exists (select 1 from public.notification_preferences where user_id = v_uid) then
    insert into public.notification_preferences (user_id) values (v_uid);
  end if;

  select sms_enabled, sms_consent_version into v_was_enabled, v_old_version
  from public.notification_preferences where user_id = v_uid;

  update public.notification_preferences
  set sms_enabled         = true,
      sms_consent_at      = now(),
      sms_consent_source  = p_source,
      sms_consent_version = p_version,
      sms_opted_out_at    = null,          -- approved re-consent clears prior opt-out
      updated_at          = now()
  where user_id = v_uid;

  -- Log an 'opted_in' event ONLY on a real transition (was not enabled) or a
  -- re-consent to a NEW wording version — never a duplicate for an unchanged toggle.
  if v_was_enabled is distinct from true or v_old_version is distinct from p_version then
    insert into public.sms_consent_events(user_id, phone_number, action, consent_version, consent_source)
    values (v_uid, v_phone, 'opted_in', p_version, p_source);
  end if;
end;
$$;


--
-- Name: generate_recurring_tournaments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_recurring_tournaments() RETURNS TABLE(template_id integer, dates_inserted integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  tmpl          RECORD;
  horizon_end   DATE;
  check_date    DATE;
  day_num       INT;
  step_days     INT;
  inserted      INT;
  nth           INT;
  month_start   DATE;
  candidate     DATE;
  m             INT;
BEGIN
  FOR tmpl IN
    SELECT *
    FROM tournament_templates
    WHERE status = 'active'
      AND recurrence_type IS NOT NULL
      AND recurrence_day  IS NOT NULL
  LOOP
    inserted    := 0;
    horizon_end := CURRENT_DATE + COALESCE(tmpl.horizon_days, 30);

    -- Respect optional series end date
    IF tmpl.series_end_date IS NOT NULL AND tmpl.series_end_date < horizon_end THEN
      horizon_end := tmpl.series_end_date;
    END IF;

    -- Map recurrence_day text → DOW integer (0=Sun … 6=Sat)
    day_num := CASE lower(tmpl.recurrence_day)
      WHEN 'sunday'    THEN 0
      WHEN 'monday'    THEN 1
      WHEN 'tuesday'   THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday'  THEN 4
      WHEN 'friday'    THEN 5
      WHEN 'saturday'  THEN 6
      ELSE 1
    END;

    -- --------------------------------------------------------
    -- WEEKLY / BIWEEKLY
    -- --------------------------------------------------------
    IF tmpl.recurrence_type IN ('weekly', 'biweekly') THEN
      step_days := CASE tmpl.recurrence_type WHEN 'biweekly' THEN 14 ELSE 7 END;

      -- Start from series_start_date, walk to the first matching weekday
      check_date := tmpl.series_start_date;
      WHILE EXTRACT(DOW FROM check_date)::INT <> day_num LOOP
        check_date := check_date + 1;
      END LOOP;

      -- Generate all occurrences in the window
      WHILE check_date <= horizon_end LOOP
        IF check_date >= CURRENT_DATE THEN
          IF NOT EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.template_id = tmpl.id
              AND tournament_date = check_date
          ) THEN
            INSERT INTO tournaments (
              venue_id, director_id, template_id, parent_template_id,
              name, description, description_es,
              game_type, tournament_format, game_spot, race, table_size,
              equipment, number_of_tables,
              tournament_date, start_time, timezone,
              entry_fee, added_money, side_pots,
              max_fargo, required_fargo_games, reports_to_fargo, open_tournament,
              phone_number, thumbnail, is_recurring, status,
              chip_ranges, calcutta
            ) VALUES (
              tmpl.venue_id, tmpl.director_id, tmpl.id, tmpl.id,
              tmpl.name, tmpl.description, tmpl.description_es,
              tmpl.game_type, tmpl.tournament_format, tmpl.game_spot, tmpl.race, tmpl.table_size,
              tmpl.equipment, tmpl.number_of_tables,
              check_date, tmpl.start_time, 'America/Phoenix',
              tmpl.entry_fee, tmpl.added_money, tmpl.side_pots,
              tmpl.max_fargo, tmpl.required_fargo_games, tmpl.reports_to_fargo, tmpl.open_tournament,
              tmpl.phone_number, tmpl.thumbnail, true, 'active',
              tmpl.chip_ranges, tmpl.calcutta
            );
            inserted := inserted + 1;
          END IF;
        END IF;
        check_date := check_date + step_days;
      END LOOP;

    -- --------------------------------------------------------
    -- MONTHLY  (Nth weekday of month, e.g. "3rd Friday")
    -- --------------------------------------------------------
    ELSIF tmpl.recurrence_type = 'monthly' THEN
      nth := COALESCE(tmpl.recurrence_week, 1);

      FOR m IN 0..23 LOOP
        month_start := DATE_TRUNC('month',
          tmpl.series_start_date + (m * INTERVAL '1 month'))::DATE;

        -- Find first occurrence of day_num in this month
        candidate := month_start;
        WHILE EXTRACT(DOW FROM candidate)::INT <> day_num LOOP
          candidate := candidate + 1;
        END LOOP;
        -- Advance to the Nth occurrence
        candidate := candidate + ((nth - 1) * 7);

        -- Skip if it rolled into the next month (e.g. "5th Friday" in a short month)
        IF EXTRACT(MONTH FROM candidate) <> EXTRACT(MONTH FROM month_start) THEN
          CONTINUE;
        END IF;

        EXIT WHEN candidate > horizon_end;

        IF candidate >= tmpl.series_start_date
           AND candidate >= CURRENT_DATE
           AND candidate <= horizon_end THEN
          IF NOT EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.template_id = tmpl.id
              AND tournament_date = candidate
          ) THEN
            INSERT INTO tournaments (
              venue_id, director_id, template_id, parent_template_id,
              name, description, description_es,
              game_type, tournament_format, game_spot, race, table_size,
              equipment, number_of_tables,
              tournament_date, start_time, timezone,
              entry_fee, added_money, side_pots,
              max_fargo, required_fargo_games, reports_to_fargo, open_tournament,
              phone_number, thumbnail, is_recurring, status,
              chip_ranges, calcutta
            ) VALUES (
              tmpl.venue_id, tmpl.director_id, tmpl.id, tmpl.id,
              tmpl.name, tmpl.description, tmpl.description_es,
              tmpl.game_type, tmpl.tournament_format, tmpl.game_spot, tmpl.race, tmpl.table_size,
              tmpl.equipment, tmpl.number_of_tables,
              candidate, tmpl.start_time, 'America/Phoenix',
              tmpl.entry_fee, tmpl.added_money, tmpl.side_pots,
              tmpl.max_fargo, tmpl.required_fargo_games, tmpl.reports_to_fargo, tmpl.open_tournament,
              tmpl.phone_number, tmpl.thumbnail, true, 'active',
              tmpl.chip_ranges, tmpl.calcutta
            );
            inserted := inserted + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Return summary row for this template
    template_id    := tmpl.id;
    dates_inserted := inserted;
    RETURN NEXT;
  END LOOP;
END;
$$;


--
-- Name: get_admin_id_autos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_id_autos() RETURNS TABLE(id_auto integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id_auto
  FROM profiles
  WHERE role IN ('compete_admin', 'super_admin')
    AND (is_disabled IS NULL OR is_disabled = false)
    AND deleted_at IS NULL;
$$;


--
-- Name: get_admin_push_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_push_tokens() RETURNS TABLE(token text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pt.token
  FROM push_tokens pt
  INNER JOIN profiles p ON p.id = pt.user_id
  WHERE p.role IN ('compete_admin', 'super_admin')
    AND (p.is_disabled IS NULL OR p.is_disabled = false)
    AND p.deleted_at IS NULL
    AND pt.is_active = true;
$$;


--
-- Name: get_auth_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auth_session() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result jsonb;
  user_profile jsonb;
  user_id_auto integer;
  owned_ids jsonb;
  directed_ids jsonb;
BEGIN
  -- 1. Get the full profile row
  SELECT to_jsonb(p.*)
  INTO user_profile
  FROM profiles p
  WHERE p.id = auth.uid();

  -- No profile yet (new signup) → return null session
  IF user_profile IS NULL THEN
    RETURN jsonb_build_object(
      'profile', null,
      'owned_venue_ids', '[]'::jsonb,
      'directed_venue_ids', '[]'::jsonb
    );
  END IF;

  -- 2. Grab id_auto for venue lookups
  user_id_auto := (user_profile->>'id_auto')::integer;

  -- 3. Get venue IDs this user OWNS (bar owners)
  SELECT coalesce(jsonb_agg(vo.venue_id), '[]'::jsonb)
  INTO owned_ids
  FROM venue_owners vo
  WHERE vo.owner_id = user_id_auto
    AND vo.archived_at IS NULL;

  -- 4. Get venue IDs this user DIRECTS (tournament directors)
  SELECT coalesce(jsonb_agg(vd.venue_id), '[]'::jsonb)
  INTO directed_ids
  FROM venue_directors vd
  WHERE vd.director_id = user_id_auto
    AND vd.archived_at IS NULL;

  -- 5. Build the session object
  result := jsonb_build_object(
    'profile', user_profile,
    'owned_venue_ids', owned_ids,
    'directed_venue_ids', directed_ids
  );

  RETURN result;
END;
$$;


--
-- Name: get_avatar_url(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_avatar_url(user_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN (
        SELECT name
        FROM storage.objects 
        WHERE bucket_id = 'profile-images' 
        AND name LIKE user_id || '/avatar%'
        ORDER BY created_at DESC 
        LIMIT 1
    );
END;
$$;


--
-- Name: get_team_invite_by_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_invite_by_token(p_token text) RETURNS TABLE(team_id bigint, tournament_id bigint, tournament_name text, captain_name text, captain_fargo integer, team_status text, is_valid boolean, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_team_id  bigint;
  v_tid      bigint;
  v_status   text;
  v_captain  bigint;
  v_tname    text;
  v_tstatus  text;
  v_tlive    text;
  v_cname    text;
  v_cfargo   int;
begin
  select tt.id, tt.tournament_id, tt.status, tt.captain_id
    into v_team_id, v_tid, v_status, v_captain
  from public.tournament_teams tt
  where tt.invite_token = p_token;

  if not found then
    return query select null::bigint, null::bigint, null::text, null::text, null::int, null::text,
                        false, 'This invite link is invalid.'::text;
    return;
  end if;

  select t.name, t.status, t.live_state
    into v_tname, v_tstatus, v_tlive
  from public.tournaments t where t.id = v_tid;

  select coalesce(nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.name, pr.user_name)
    into v_cname
  from public.profiles pr where pr.id_auto = v_captain;

  select coalesce(cm.fargo_at_registration, pr.fargo, cm.suggested_fargo)
    into v_cfargo
  from public.tournament_team_members cm
  left join public.profiles pr on pr.id_auto = cm.player_id
  where cm.team_id = v_team_id and cm.role = 'captain'
  limit 1;

  team_id         := v_team_id;
  tournament_id   := v_tid;
  tournament_name := coalesce(v_tname, 'this tournament');
  captain_name    := coalesce(v_cname, 'A player');
  captain_fargo   := v_cfargo;
  team_status     := v_status;

  if v_tname is null then
    is_valid := false; reason := 'This tournament could not be found.';
  elsif v_tstatus = 'completed' or v_tlive = 'finished' then
    is_valid := false; reason := 'This tournament has ended.';
  elsif v_status = 'registered' then
    is_valid := false; reason := 'This team is already full.';
  else
    is_valid := true; reason := null::text;
  end if;

  return next;
end;
$$;


--
-- Name: get_tournament_team_roster(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tournament_team_roster(p_tid bigint) RETURNS TABLE(team_id bigint, team_status text, team_locked boolean, team_approved boolean, team_checked_in boolean, team_paid boolean, team_name text, team_chip_override integer, team_paid_side_pots text[], team_size integer, member_id bigint, role text, invite_status text, player_id bigint, member_name text, member_fargo integer, fargo_verified boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  return query
    select
      tt.id, tt.status, tt.locked, tt.approved, tt.checked_in, tt.paid, tt.name,
      tt.chip_override, tt.paid_side_pots, tt.team_size,
      m.id, m.role, m.invite_status, m.player_id,
      coalesce(
        nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
        pr.name, pr.user_name, m.temp_name
      ) as member_name,
      coalesce(m.fargo_at_registration, pr.fargo, m.suggested_fargo) as member_fargo,
      (m.fargo_at_registration is not null) as fargo_verified
    from public.tournament_teams tt
    join public.tournament_team_members m on m.team_id = tt.id
    left join public.profiles pr on pr.id_auto = m.player_id
    where tt.tournament_id = p_tid
      and m.invite_status <> 'declined';
end; $$;


--
-- Name: get_user_last_sign_in(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_last_sign_in(user_id uuid) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'auth', 'public'
    AS $$
  SELECT last_sign_in_at
  FROM auth.users
  WHERE id = user_id;
$$;


--
-- Name: hide_tournament_and_resolve_report(bigint, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hide_tournament_and_resolve_report(p_tournament_id bigint, p_report_id uuid, p_admin_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_admin_id
      AND role IN ('super_admin', 'compete_admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Hide the tournament
  UPDATE tournaments
  SET is_hidden = true,
      updated_at = now()
  WHERE id = p_tournament_id;

  -- Auto-resolve the report
  UPDATE reports
  SET status = 'resolved',
      reviewed_by = p_admin_id,
      reviewed_at = now()
  WHERE id = p_report_id;
END;
$$;


--
-- Name: invite_team_partner(bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_team_partner(p_team_id bigint, p_method text, p_value text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_caller bigint; v_tid bigint; v_captain bigint; v_locked boolean; v_target bigint;
begin
  v_caller := public._team_caller();
  select tournament_id, captain_id, locked into v_tid, v_captain, v_locked
  from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can invite a partner'; end if;
  if v_locked then raise exception 'This team is locked — ask the director to unlock it to change the partner'; end if;

  if p_method = 'username' then
    select id_auto into v_target from public.profiles where lower(user_name) = lower(p_value);
  elsif p_method = 'email' then
    select id_auto into v_target from public.profiles where lower(email) = lower(p_value);
  else
    v_target := null; -- phone / other → non-account pending invite
  end if;

  if v_target is not null then
    if v_target = v_caller then raise exception 'You cannot invite yourself'; end if;
    if exists (
      select 1 from public.tournament_team_members m
      where m.tournament_id = v_tid and m.player_id = v_target and m.invite_status <> 'declined'
    ) then
      raise exception 'That player is already on a team for this tournament';
    end if;
  end if;

  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, invite_method, invite_value, is_verified)
  values (p_team_id, v_tid, v_target, 'member', 'pending', p_method, p_value, false);

  perform public._recompute_team_status(p_team_id);

  return v_target;
end; $$;


--
-- Name: is_chip_manager(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_chip_manager(p_tid bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = p_tid
      and (
        t.director_id = (select id_auto from public.profiles where id = auth.uid())
        or (select role from public.profiles where id = auth.uid())
             in ('compete_admin', 'super_admin')
      )
  );
$$;


--
-- Name: is_venue_owner(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_venue_owner(p_venue_id integer) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_owners
    WHERE venue_id = p_venue_id
    AND owner_id = (
      SELECT id_auto FROM public.profiles WHERE id = auth.uid()
    )
    AND archived_at IS NULL
  );
$$;


--
-- Name: join_team_by_token(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_team_by_token(p_token text, p_fargo integer) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  bigint;
  v_team_id bigint;
  v_tid     bigint;
  v_status  text;
  v_locked  boolean;
  v_captain bigint;
  v_size    int;
begin
  v_caller := public._team_caller();
  if v_caller is null then
    raise exception 'You must be signed in to join a team.';
  end if;

  select id, tournament_id, status, locked, captain_id, team_size
    into v_team_id, v_tid, v_status, v_locked, v_captain, v_size
  from public.tournament_teams
  where invite_token = p_token;

  if v_team_id is null then
    raise exception 'This invite link is invalid.';
  end if;
  if v_captain = v_caller then
    raise exception 'You are the captain of this team.';
  end if;
  if v_locked or v_status = 'registered' then
    raise exception 'This team is already full.';
  end if;
  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = v_tid and m.player_id = v_caller and m.invite_status <> 'declined'
  ) then
    raise exception 'You are already on a team for this tournament.';
  end if;
  if (
    select count(*) from public.tournament_team_members m
    where m.team_id = v_team_id and m.invite_status = 'accepted'
  ) >= v_size then
    raise exception 'This team is already full.';
  end if;

  -- Fill the open slot with the joining player (replaces any stale pending slot).
  delete from public.tournament_team_members where team_id = v_team_id and role <> 'captain';
  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (v_team_id, v_tid, v_caller, 'member', 'accepted', true, p_fargo);

  update public.tournament_teams set locked = true, updated_at = now() where id = v_team_id;
  perform public._recompute_team_status(v_team_id);

  return v_team_id;
end;
$$;


--
-- Name: mark_phone_verified(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_phone_verified(p_user_id uuid, p_phone_e164 text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_current text;
begin
  if p_user_id is null or p_phone_e164 is null then
    raise exception 'invalid arguments';
  end if;

  select phone_number into v_current from public.profiles where id = p_user_id;

  -- Stale-number guard: the number must still be the user's current canonical one.
  if v_current is null or v_current is distinct from p_phone_e164 then
    raise exception 'phone no longer current';
  end if;

  update public.profiles
  set phone_verified_at           = now(),
      phone_verification_provider = 'telnyx',
      phone_verification_method   = 'sms_otp',
      updated_at                  = now()
  where id = p_user_id;

  insert into public.sms_consent_events(user_id, phone_number, action, metadata)
  values (p_user_id, p_phone_e164, 'verification_completed', '{}'::jsonb);
end;
$$;


--
-- Name: recover_stale_sms_send(interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recover_stale_sms_send(p_older_than interval DEFAULT '01:00:00'::interval) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_count integer;
begin
  update public.sms_messages
  set status = 'delivery_failed', error_code = 'stale_unconfirmed', last_status_at = now()
  where status = 'queued' and created_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


--
-- Name: reserve_sms_verification_attempt(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_sms_verification_attempt(p_user_id uuid, p_action text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_now        timestamptz := now();
  v_last_start timestamptz;
  v_starts_hr  integer;
  v_starts_day integer;
  v_checks     integer;
  v_id         bigint;
begin
  if p_user_id is null then return 'error'; end if;
  if p_action not in ('start', 'check', 'test') then return 'error'; end if;

  -- Serialize this user's verification/test activity until the transaction ends.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  if p_action = 'test' then
    -- Protected test-send limits: 60s cooldown + <=5/hour (Telnyx-cost guard).
    select pg_catalog.max(created_at) into v_last_start
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'test';
    if v_last_start is not null and (v_now - v_last_start) < interval '60 seconds' then
      return 'cooldown';
    end if;
    select pg_catalog.count(*) into v_starts_hr
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'test' and created_at > v_now - interval '1 hour';
    if v_starts_hr >= 5 then return 'rate_limited'; end if;
  elsif p_action = 'start' then
    select pg_catalog.max(created_at) into v_last_start
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'start';
    if v_last_start is not null and (v_now - v_last_start) < interval '60 seconds' then
      return 'cooldown';
    end if;

    select pg_catalog.count(*) into v_starts_hr
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'start' and created_at > v_now - interval '1 hour';
    if v_starts_hr >= 5 then return 'rate_limited'; end if;

    select pg_catalog.count(*) into v_starts_day
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'start' and created_at > v_now - interval '1 day';
    if v_starts_day >= 10 then return 'rate_limited'; end if;
  else
    -- check: cap failed+ attempts in a short rolling window
    select pg_catalog.count(*) into v_checks
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'check' and created_at > v_now - interval '15 minutes';
    if v_checks >= 5 then return 'rate_limited'; end if;
  end if;

  insert into public.sms_verification_attempts(user_id, action, status)
  values (p_user_id, p_action, 'reserved')
  returning id into v_id;

  return 'ok:' || v_id::text;
end;
$$;


--
-- Name: respond_to_team_invite(bigint, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_to_team_invite(p_team_id bigint, p_accept boolean, p_fargo integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_caller bigint; v_tid bigint; v_mid bigint;
begin
  v_caller := public._team_caller();
  select id, tournament_id into v_mid, v_tid
  from public.tournament_team_members
  where team_id = p_team_id and player_id = v_caller and role = 'member';
  if v_mid is null then raise exception 'No invite found for you on this team'; end if;

  if p_accept then
    if exists (
      select 1 from public.tournament_team_members m
      where m.tournament_id = v_tid and m.player_id = v_caller
        and m.invite_status = 'accepted' and m.team_id <> p_team_id
    ) then
      raise exception 'You are already on another team for this tournament';
    end if;
    update public.tournament_team_members
      set invite_status = 'accepted', is_verified = true, suggested_fargo = p_fargo, updated_at = now()
      where id = v_mid;
    update public.tournament_teams set locked = true, updated_at = now() where id = p_team_id;
  else
    update public.tournament_team_members
      set invite_status = 'declined', updated_at = now()
      where id = v_mid;
  end if;

  perform public._recompute_team_status(p_team_id);
end; $$;


--
-- Name: set_sms_phone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sms_phone(p_phone text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_uid     uuid := auth.uid();
  v_digits  text;
  v_e164    text;
  v_current text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- E.164 is the contract. A full +CC number passes through for ANY country; the
  -- bare-10/11-digit -> +1 rule is the ONLY US-specific convenience.
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_e164 := case
    when p_phone ~ '^\+[1-9]\d{6,14}$'                    then p_phone
    when length(v_digits) = 10                            then '+1' || v_digits
    when length(v_digits) = 11 and left(v_digits, 1) = '1' then '+' || v_digits
    else null
  end;
  if v_e164 is null or v_e164 !~ '^\+[1-9]\d{6,14}$' then
    raise exception 'Invalid phone number';
  end if;

  select phone_number into v_current from public.profiles where id = v_uid;

  -- Unchanged number: do NOT clear verification unnecessarily.
  if v_current is not distinct from v_e164 then
    return;
  end if;

  -- Changing the number invalidates verification + consent for the NEW number.
  update public.profiles
  set phone_number                = v_e164,
      phone_verified_at           = null,
      phone_verification_provider = null,
      phone_verification_method   = null,
      updated_at                  = now()
  where id = v_uid;

  -- Existence-check insert (not ON CONFLICT) so we don't depend on a named unique
  -- constraint on notification_preferences.user_id, which isn't in our migrations.
  if not exists (select 1 from public.notification_preferences where user_id = v_uid) then
    insert into public.notification_preferences (user_id) values (v_uid);
  end if;

  update public.notification_preferences
  set sms_enabled = false, updated_at = now()
  where user_id = v_uid;

  -- History preserved; prior consent is NOT treated as consent for the new number.
  insert into public.sms_consent_events(user_id, phone_number, action, metadata)
  values (v_uid, v_e164, 'phone_changed', jsonb_build_object('previous', v_current));
end;
$_$;


--
-- Name: set_team_approved(bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_team_approved(p_team_id bigint, p_approved boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_tid bigint; v_caller bigint; v_role text;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to approve teams for this tournament';
  end if;
  update public.tournament_teams set approved = p_approved, updated_at = now() where id = p_team_id;
end; $$;


--
-- Name: set_team_checked_in(bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_team_checked_in(p_team_id bigint, p_checked_in boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_tid bigint; v_caller bigint; v_role text;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to check in teams for this tournament';
  end if;
  update public.tournament_teams set checked_in = p_checked_in, updated_at = now() where id = p_team_id;
end; $$;


--
-- Name: set_team_chips(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_team_chips(p_team_id bigint, p_chips integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_tid bigint; v_caller bigint; v_role text;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to set chips for this tournament';
  end if;
  update public.tournament_teams set chip_override = p_chips, updated_at = now() where id = p_team_id;
end; $$;


--
-- Name: set_team_paid(bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_team_paid(p_team_id bigint, p_paid boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
  update public.tournament_teams set paid = p_paid, updated_at = now() where id = p_team_id;
end; $$;


--
-- Name: set_team_side_pots(bigint, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_team_side_pots(p_team_id bigint, p_pots text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_tid bigint; v_caller bigint; v_role text;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to set side pots for this tournament';
  end if;
  update public.tournament_teams
    set paid_side_pots = coalesce(p_pots, '{}'), updated_at = now()
    where id = p_team_id;
end; $$;


--
-- Name: submit_match_state(bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_match_state(p_tournament_id bigint, p_match_id text, p_patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_uid      bigint;
  v_is_td    boolean;
  v_allowed  boolean;
  v_ls       jsonb;
  v_existing jsonb;
  v_clean    jsonb;
begin
  -- 1. Resolve the caller's profile id_auto from auth uid.
  select p.id_auto into v_uid
  from public.profiles p
  where p.id = auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- 2. Authorize: the tournament director, or an active participant.
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id and t.director_id = v_uid
  )
  into v_is_td;

  select
    v_is_td
    or exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = p_tournament_id
        and tp.player_id = v_uid
        and tp.status not in ('cancelled', 'no_show')
    )
  into v_allowed;

  if not v_allowed then
    raise exception 'Not allowed to score this tournament' using errcode = '42501';
  end if;

  -- 3. Whitelist the patch to scoring fields only.
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_clean
  from jsonb_each(p_patch)
  where key in (
    'status', 'winner', 'p1Score', 'p2Score', 'startedAt', 'completedAt', 'result'
  );

  -- 4. Lock the row, then merge the patch into matchState -> <match_id>.
  select coalesce(t.live_settings, '{}'::jsonb)
  into v_ls
  from public.tournaments t
  where t.id = p_tournament_id
  for update;

  if v_ls is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  v_ls := jsonb_set(v_ls, '{matchState}', coalesce(v_ls -> 'matchState', '{}'::jsonb), true);
  v_existing := coalesce(v_ls #> array['matchState', p_match_id], '{}'::jsonb);

  -- 4a. A final match is locked for players; only the TD may change it.
  if not v_is_td and (v_existing ->> 'status') = 'completed' then
    raise exception 'Match is final and locked' using errcode = '42501';
  end if;

  v_ls := jsonb_set(v_ls, array['matchState', p_match_id], v_existing || v_clean, true);

  update public.tournaments
  set live_settings = v_ls,
      updated_at = now()
  where id = p_tournament_id;

  return v_ls;
end;
$$;


--
-- Name: sync_last_login_to_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_last_login_to_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'auth', 'public'
    AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = NEW.last_sign_in_at
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: td_add_team_member(bigint, bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.td_add_team_member(p_team_id bigint, p_player_id bigint, p_fargo integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = v_tid and m.player_id = p_player_id and m.invite_status <> 'declined'
  ) then
    raise exception 'That player is already on a team for this tournament';
  end if;

  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';
  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (p_team_id, v_tid, p_player_id, 'member', 'accepted', false, p_fargo);

  update public.tournament_teams set approved = false, locked = true, updated_at = now() where id = p_team_id;
  perform public._recompute_team_status(p_team_id);
end; $$;


--
-- Name: td_create_team(bigint, bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.td_create_team(p_tournament_id bigint, p_captain_player_id bigint, p_fargo integer) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_caller bigint; v_role text; v_team bigint;
begin
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to add teams for this tournament';
  end if;
  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = p_tournament_id and m.player_id = p_captain_player_id and m.invite_status <> 'declined'
  ) then
    raise exception 'That player is already on a team for this tournament';
  end if;

  insert into public.tournament_teams (tournament_id, captain_id, status)
  values (p_tournament_id, p_captain_player_id, 'pending_partner')
  returning id into v_team;

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (v_team, p_tournament_id, p_captain_player_id, 'captain', 'accepted', false, p_fargo);

  return v_team;
end; $$;


--
-- Name: td_remove_team_member(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.td_remove_team_member(p_member_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: tg_profiles_guard_phone(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_profiles_guard_phone() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if (new.phone_number                is distinct from old.phone_number
   or new.phone_verified_at           is distinct from old.phone_verified_at
   or new.phone_verification_provider is distinct from old.phone_verification_provider
   or new.phone_verification_method   is distinct from old.phone_verification_method)
   and current_user in ('authenticated', 'anon')
  then
    raise exception
      'phone_* columns may only be changed via set_sms_phone()/verify RPC (attempted by role %)',
      current_user;
  end if;
  return new;
end;
$$;


--
-- Name: unlock_team(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unlock_team(p_team_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_tid bigint; v_caller bigint; v_role text;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;

  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid
      and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to unlock teams for this tournament';
  end if;

  update public.tournament_teams set locked = false, updated_at = now() where id = p_team_id;
end; $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_venue_staging_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_venue_staging_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alert_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_matches (
    id integer NOT NULL,
    alert_id integer NOT NULL,
    tournament_id integer NOT NULL,
    notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: alert_matches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_matches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_matches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_matches_id_seq OWNED BY public.alert_matches.id;


--
-- Name: app_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_events (
    id bigint NOT NULL,
    event_type text NOT NULL,
    entity_type text,
    entity_id integer,
    user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_events_id_seq OWNED BY public.app_events.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    user_id integer,
    user_role text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id integer,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: bad_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bad_words (
    id integer NOT NULL,
    word text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bad_words_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bad_words_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bad_words_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bad_words_id_seq OWNED BY public.bad_words.id;


--
-- Name: bar_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bar_requests (
    id integer NOT NULL,
    venue_name text NOT NULL,
    address text,
    city text,
    state text,
    zip_code text,
    phone text,
    google_place_id text,
    latitude numeric,
    longitude numeric,
    submitted_by uuid,
    submitter_notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bar_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: bar_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bar_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bar_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bar_requests_id_seq OWNED BY public.bar_requests.id;


--
-- Name: billing_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    price_monthly numeric,
    price_yearly numeric,
    description text,
    features jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    stripe_price_id_monthly text,
    stripe_price_id_yearly text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chip_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chip_config (
    tournament_id bigint NOT NULL,
    format text DEFAULT 'singles'::text NOT NULL,
    performance_tracking boolean DEFAULT true NOT NULL,
    stream_enabled boolean DEFAULT false NOT NULL,
    winner_stays boolean DEFAULT true NOT NULL,
    auto_eliminate boolean DEFAULT true NOT NULL,
    tiers jsonb DEFAULT '[]'::jsonb NOT NULL,
    queue jsonb DEFAULT '[]'::jsonb NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    winner_entry_id text,
    reshuffle_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    buy_backs_allowed boolean DEFAULT false NOT NULL,
    shuffle_mode boolean DEFAULT false NOT NULL,
    shuffle_ready boolean DEFAULT false NOT NULL,
    reshuffle_pending boolean DEFAULT false NOT NULL,
    reshuffle_table_count integer,
    shuffle_round boolean DEFAULT false NOT NULL,
    played_round_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    round_remaining jsonb DEFAULT '[]'::jsonb NOT NULL,
    restore_points jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: chip_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chip_entries (
    id text NOT NULL,
    tournament_id bigint NOT NULL,
    p1_name text DEFAULT ''::text NOT NULL,
    p1_fargo integer,
    p1_phone text,
    p2_name text,
    p2_fargo integer,
    team_fargo integer,
    start_chips integer DEFAULT 0 NOT NULL,
    chips integer DEFAULT 0 NOT NULL,
    paid boolean DEFAULT false NOT NULL,
    checked_in boolean DEFAULT false NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    streak integer DEFAULT 0 NOT NULL,
    best_streak integer DEFAULT 0 NOT NULL,
    eliminations integer DEFAULT 0 NOT NULL,
    table_id text,
    eliminated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    p1_profile_id bigint,
    p2_profile_id bigint
);


--
-- Name: chip_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chip_events (
    id text NOT NULL,
    tournament_id bigint NOT NULL,
    type text NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    actor_id bigint,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded boolean DEFAULT false NOT NULL,
    tx_id text
);


--
-- Name: chip_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chip_matches (
    id text NOT NULL,
    tournament_id bigint NOT NULL,
    table_id text NOT NULL,
    a_id text NOT NULL,
    b_id text NOT NULL,
    winner_id text,
    loser_id text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    status text DEFAULT 'in_progress'::text NOT NULL
);


--
-- Name: chip_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chip_results (
    id bigint NOT NULL,
    tournament_id bigint NOT NULL,
    entry_id text NOT NULL,
    place integer NOT NULL,
    team_name text,
    p1_profile_id bigint,
    p2_profile_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chip_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chip_results ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chip_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chip_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chip_tables (
    id text NOT NULL,
    tournament_id bigint NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    is_stream boolean DEFAULT false NOT NULL,
    stream_url text,
    status text DEFAULT 'open'::text NOT NULL,
    match_id text,
    holder_id text,
    last_loser_id text,
    sort integer DEFAULT 0 NOT NULL,
    locked boolean DEFAULT false NOT NULL,
    inactive boolean DEFAULT false NOT NULL,
    closing boolean DEFAULT false NOT NULL,
    pending_challenger_id text
);


--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text,
    category text,
    tournament_id integer,
    created_by uuid NOT NULL,
    is_support boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversations_category_check CHECK ((category = ANY (ARRAY['tournament_issues'::text, 'report_problem'::text, 'feedback_suggestions'::text, 'account_issues'::text, 'fargo_rating'::text, 'become_td'::text, 'tournament_submission'::text, 'general'::text, 'other'::text])))
);


--
-- Name: faqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faqs (
    id integer NOT NULL,
    question text NOT NULL,
    question_es text,
    answer text NOT NULL,
    answer_es text,
    category text,
    display_order integer DEFAULT 0,
    is_published boolean DEFAULT true,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: faqs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.faqs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: faqs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.faqs_id_seq OWNED BY public.faqs.id;


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    id integer NOT NULL,
    user_id integer NOT NULL,
    tournament_id integer,
    template_id integer,
    favorite_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_favorite_target CHECK ((((tournament_id IS NOT NULL) AND (template_id IS NULL)) OR ((tournament_id IS NULL) AND (template_id IS NOT NULL)))),
    CONSTRAINT favorites_favorite_type_check CHECK ((favorite_type = ANY (ARRAY['single'::text, 'series'::text])))
);


--
-- Name: favorites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.favorites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: favorites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.favorites_id_seq OWNED BY public.favorites.id;


--
-- Name: featured_bars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.featured_bars (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    photo_url text,
    location text,
    hours_of_operation text,
    special_features text,
    highlights text[],
    venue_id integer,
    is_active boolean DEFAULT true,
    featured_until timestamp with time zone,
    featured_priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    address text,
    phone text,
    google_place_id text,
    latitude double precision,
    longitude double precision
);


--
-- Name: featured_bars_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.featured_bars_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: featured_bars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.featured_bars_id_seq OWNED BY public.featured_bars.id;


--
-- Name: featured_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.featured_players (
    id integer NOT NULL,
    name text NOT NULL,
    nickname text,
    photo_url text,
    location text,
    bio text,
    achievements text[],
    user_id integer,
    is_active boolean DEFAULT true,
    featured_until timestamp with time zone,
    featured_priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    fargo_rating integer,
    preferred_game text,
    years_playing integer
);


--
-- Name: featured_players_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.featured_players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: featured_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.featured_players_id_seq OWNED BY public.featured_players.id;


--
-- Name: giveaway_draws; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.giveaway_draws (
    id integer NOT NULL,
    giveaway_id integer NOT NULL,
    drawn_by integer NOT NULL,
    winner_id integer NOT NULL,
    draw_number integer NOT NULL,
    invalidated boolean DEFAULT false,
    invalidation_reason text,
    invalidated_at timestamp with time zone,
    invalidated_by integer,
    drawn_at timestamp with time zone DEFAULT now()
);


--
-- Name: giveaway_draws_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.giveaway_draws_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: giveaway_draws_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.giveaway_draws_id_seq OWNED BY public.giveaway_draws.id;


--
-- Name: giveaway_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.giveaway_entries (
    id integer NOT NULL,
    giveaway_id integer NOT NULL,
    user_id integer NOT NULL,
    name_as_on_id text NOT NULL,
    birthday date NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    agreed_to_rules boolean DEFAULT true NOT NULL,
    agreed_to_privacy boolean DEFAULT true NOT NULL,
    confirmed_age boolean DEFAULT true NOT NULL,
    opted_in_promotions boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: giveaway_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.giveaway_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: giveaway_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.giveaway_entries_id_seq OWNED BY public.giveaway_entries.id;


--
-- Name: giveaway_winner_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.giveaway_winner_history (
    id integer NOT NULL,
    giveaway_id integer NOT NULL,
    user_id integer NOT NULL,
    entry_id integer NOT NULL,
    status character varying(20) DEFAULT 'winner'::character varying NOT NULL,
    drawn_at timestamp without time zone DEFAULT now() NOT NULL,
    drawn_by integer NOT NULL,
    disqualified_at timestamp without time zone,
    disqualified_by integer,
    disqualified_reason text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT giveaway_winner_history_status_check CHECK (((status)::text = ANY ((ARRAY['winner'::character varying, 'disqualified'::character varying])::text[])))
);


--
-- Name: giveaway_winner_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.giveaway_winner_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: giveaway_winner_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.giveaway_winner_history_id_seq OWNED BY public.giveaway_winner_history.id;


--
-- Name: giveaways; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.giveaways (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    description_es text,
    prize_value numeric(10,2),
    image_url text,
    rules_text text,
    min_age integer DEFAULT 18,
    end_date timestamp with time zone,
    max_entries integer,
    status text DEFAULT 'active'::text,
    winner_id integer,
    winner_drawn_at timestamp with time zone,
    winner_drawn_by integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    archived_at timestamp with time zone,
    end_type character varying(20) DEFAULT 'date'::character varying,
    CONSTRAINT giveaways_end_type_check CHECK (((end_type)::text = ANY ((ARRAY['date'::character varying, 'entries'::character varying, 'both'::character varying])::text[]))),
    CONSTRAINT giveaways_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text, 'awarded'::text, 'archived'::text])))
);


--
-- Name: giveaways_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.giveaways_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: giveaways_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.giveaways_id_seq OWNED BY public.giveaways.id;


--
-- Name: image_scan_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.image_scan_logs (
    id integer NOT NULL,
    file_name character varying(255) NOT NULL,
    image_url text NOT NULL,
    is_appropriate boolean NOT NULL,
    violations text[],
    confidence_scores jsonb,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: image_scan_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.image_scan_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: image_scan_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.image_scan_logs_id_seq OWNED BY public.image_scan_logs.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id integer NOT NULL,
    subscription_id uuid,
    amount integer NOT NULL,
    currency text DEFAULT 'usd'::text,
    status text NOT NULL,
    invoice_date timestamp with time zone,
    hosted_invoice_url text,
    receipt_url text,
    provider_invoice_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'open'::text, 'void'::text, 'uncollectible'::text])))
);


--
-- Name: message_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    messages_today integer DEFAULT 0 NOT NULL,
    messages_this_week integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    last_reset_date date DEFAULT CURRENT_DATE NOT NULL
);


--
-- Name: message_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_recipients (
    id integer NOT NULL,
    message_id integer NOT NULL,
    user_id integer NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    push_sent boolean DEFAULT false NOT NULL
);


--
-- Name: message_recipients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_recipients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_recipients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_recipients_id_seq OWNED BY public.message_recipients.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    sender_id integer NOT NULL,
    sender_role text NOT NULL,
    tournament_id integer,
    template_id integer,
    venue_id integer,
    subject text NOT NULL,
    body text NOT NULL,
    body_es text,
    message_type text NOT NULL,
    target_type text,
    target_filter jsonb,
    recipient_count integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT messages_message_type_check CHECK ((message_type = ANY (ARRAY['general'::text, 'important'::text, 'cancellation'::text, 'system'::text]))),
    CONSTRAINT messages_target_type_check CHECK ((target_type = ANY (ARRAY['tournament_favorites'::text, 'series_favorites'::text, 'venue_favorites'::text, 'all_users'::text, 'role'::text, 'location'::text])))
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: news_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_articles (
    id integer NOT NULL,
    source text NOT NULL,
    source_url text NOT NULL,
    title text NOT NULL,
    summary text,
    url text NOT NULL,
    image_url text,
    published_at timestamp with time zone NOT NULL,
    fetched_at timestamp with time zone DEFAULT now()
);


--
-- Name: news_articles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.news_articles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: news_articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.news_articles_id_seq OWNED BY public.news_articles.id;


--
-- Name: notification_message_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_message_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone,
    push_sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    message_type text DEFAULT 'general'::text NOT NULL,
    target_type text,
    tournament_id integer,
    venue_id integer,
    recipient_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_messages_target_type_check CHECK ((target_type = ANY (ARRAY['tournament'::text, 'venue'::text, 'state'::text, 'all_users'::text])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tournament_updates boolean DEFAULT true NOT NULL,
    venue_promotions boolean DEFAULT true NOT NULL,
    app_announcements boolean DEFAULT true NOT NULL,
    search_alert_matches boolean DEFAULT true NOT NULL,
    giveaway_updates boolean DEFAULT true NOT NULL,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sms_enabled boolean DEFAULT false NOT NULL,
    sms_phone text,
    sms_match_alerts boolean DEFAULT true NOT NULL,
    sms_weekly_report boolean DEFAULT false NOT NULL,
    sms_tournament_reminders boolean DEFAULT false NOT NULL,
    sms_consent_at timestamp with time zone,
    sms_consent_source text,
    sms_consent_version text,
    sms_opted_out_at timestamp with time zone,
    CONSTRAINT np_sms_consent_source_chk CHECK (((sms_consent_source IS NULL) OR (sms_consent_source = ANY (ARRAY['app_settings'::text, 'onboarding'::text, 'web_opt_in'::text, 'sms_start_keyword'::text, 'admin_migration'::text]))))
);


--
-- Name: COLUMN notification_preferences.sms_phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preferences.sms_phone IS 'DEPRECATED — canonical phone is profiles.phone_number. Kept for compatibility; removed in a follow-up migration after the app is repointed. Do not write new values.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    data jsonb,
    status text DEFAULT 'pending'::text,
    sent_at timestamp with time zone,
    error_message text,
    scheduled_for timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    category text DEFAULT 'general'::text,
    read_at timestamp with time zone,
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id integer NOT NULL,
    brand text,
    last4 text,
    exp_month integer,
    exp_year integer,
    provider_payment_method_id text NOT NULL,
    is_default boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    id_auto bigint NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    user_name text NOT NULL,
    avatar_url text,
    home_state text NOT NULL,
    home_city text,
    zip_code text,
    preferred_game text,
    favorite_player text,
    language_preference text DEFAULT 'en'::text,
    role text DEFAULT 'basic_user'::text NOT NULL,
    status text DEFAULT 'active'::text,
    notify_saved_search_matches boolean DEFAULT true,
    notify_favorite_updates boolean DEFAULT true,
    notify_tournament_reminders boolean DEFAULT true,
    notify_cancellations boolean DEFAULT true,
    notify_new_giveaways boolean DEFAULT true,
    notify_giveaway_winners boolean DEFAULT true,
    notify_promotions boolean DEFAULT false,
    notify_app_updates boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_login_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by integer,
    total_winnings numeric(10,2) DEFAULT 0,
    first_name text,
    last_name text,
    has_completed_onboarding boolean DEFAULT false,
    onboarding_step integer DEFAULT 0,
    is_disabled boolean DEFAULT false NOT NULL,
    last_active_at timestamp with time zone,
    fargo integer,
    fargo_status text DEFAULT 'unverified'::text NOT NULL,
    fargo_last_verified_at timestamp with time zone,
    fargo_verified_by bigint,
    phone_number text,
    phone_verified_at timestamp with time zone,
    phone_verification_provider text,
    phone_verification_method text,
    CONSTRAINT profiles_language_preference_check CHECK ((language_preference = ANY (ARRAY['en'::text, 'es'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['basic_user'::text, 'tournament_director'::text, 'bar_owner'::text, 'compete_admin'::text, 'super_admin'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'banned'::text, 'deleted'::text])))
);


--
-- Name: COLUMN profiles.phone_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.phone_number IS 'User mobile in E.164. Changed ONLY via set_sms_phone(), which clears verification + disables SMS.';


--
-- Name: COLUMN profiles.phone_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.phone_verified_at IS 'When phone ownership was proven (Telnyx Verify). Server-set only; guarded by trigger.';


--
-- Name: profiles_id_auto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.profiles ALTER COLUMN id_auto ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.profiles_id_auto_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    device_type text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_tokens_device_type_check CHECK ((device_type = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);


--
-- Name: reassignment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reassignment_logs (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    entity_name text,
    previous_user_id integer NOT NULL,
    previous_user_name text,
    new_user_id integer NOT NULL,
    new_user_name text,
    reason text NOT NULL,
    reassigned_by integer NOT NULL,
    reassigned_by_name text,
    reassigned_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reassignment_logs_entity_type_check CHECK ((entity_type = ANY (ARRAY['tournament_director'::text, 'venue_owner'::text])))
);


--
-- Name: reassignment_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reassignment_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reassignment_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reassignment_logs_id_seq OWNED BY public.reassignment_logs.id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    content_type text NOT NULL,
    content_id text NOT NULL,
    reason text NOT NULL,
    details text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    CONSTRAINT reports_content_type_check CHECK ((content_type = ANY (ARRAY['tournament'::text, 'profile'::text, 'giveaway'::text]))),
    CONSTRAINT reports_reason_check CHECK ((reason = ANY (ARRAY['inappropriate'::text, 'spam'::text, 'misleading'::text, 'other'::text]))),
    CONSTRAINT reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'resolved'::text])))
);


--
-- Name: saved_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_searches (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    filters jsonb NOT NULL,
    alert_enabled boolean DEFAULT false,
    alert_frequency text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_applied_at timestamp with time zone,
    CONSTRAINT saved_searches_alert_frequency_check CHECK ((alert_frequency = ANY (ARRAY['immediately'::text, 'daily'::text, 'weekly'::text])))
);


--
-- Name: saved_searches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_searches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_searches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_searches_id_seq OWNED BY public.saved_searches.id;


--
-- Name: search_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_alerts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    description text,
    filter_criteria jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    match_count integer DEFAULT 0 NOT NULL,
    last_match_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT search_alerts_name_check CHECK (((length(name) >= 1) AND (length(name) <= 100)))
);


--
-- Name: search_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_alerts_id_seq OWNED BY public.search_alerts.id;


--
-- Name: sms_consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_consent_events (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    phone_number text,
    action text NOT NULL,
    consent_version text,
    consent_source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT sms_consent_events_action_check CHECK ((action = ANY (ARRAY['phone_changed'::text, 'verification_completed'::text, 'opted_in'::text, 'opted_out'::text]))),
    CONSTRAINT sms_consent_events_consent_source_check CHECK (((consent_source IS NULL) OR (consent_source = ANY (ARRAY['app_settings'::text, 'onboarding'::text, 'web_opt_in'::text, 'sms_start_keyword'::text, 'admin_migration'::text]))))
);


--
-- Name: sms_consent_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sms_consent_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sms_consent_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sms_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_messages (
    id bigint NOT NULL,
    user_id uuid,
    tournament_id bigint,
    match_id text,
    to_e164 text NOT NULL,
    message_type text NOT NULL,
    telnyx_message_id text,
    provider text,
    provider_message_id text,
    status text,
    error_code text,
    error_detail text,
    retry_count integer,
    last_status_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    delivered_at timestamp with time zone,
    idempotency_key text,
    CONSTRAINT sms_messages_message_type_check CHECK ((message_type = ANY (ARRAY['verification'::text, 'test_message'::text, 'match_ready'::text, 'tournament_reminder'::text, 'account_update'::text]))),
    CONSTRAINT sms_messages_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'sending_failed'::text, 'delivery_failed'::text]))))
);


--
-- Name: sms_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sms_messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sms_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sms_verification_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_verification_attempts (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    phone_masked text,
    action text NOT NULL,
    status text NOT NULL,
    request_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_verification_attempts_action_check CHECK ((action = ANY (ARRAY['start'::text, 'check'::text]))),
    CONSTRAINT sms_verification_attempts_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'sent'::text, 'verified'::text, 'failed'::text, 'error'::text])))
);


--
-- Name: sms_verification_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sms_verification_attempts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sms_verification_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    subject text NOT NULL,
    description text NOT NULL,
    category text,
    status text DEFAULT 'open'::text,
    priority text DEFAULT 'normal'::text,
    assigned_to integer,
    resolution_notes text,
    resolved_at timestamp with time zone,
    resolved_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])))
);


--
-- Name: support_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_tickets_id_seq OWNED BY public.support_tickets.id;


--
-- Name: tournament_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_analytics (
    id bigint NOT NULL,
    tournament_id bigint,
    user_id uuid,
    event_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT tournament_analytics_event_type_check CHECK ((event_type = ANY (ARRAY['view'::text, 'click'::text, 'favorite'::text, 'unfavorite'::text, 'share'::text, 'register'::text])))
);


--
-- Name: tournament_analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tournament_analytics ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tournament_analytics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tournament_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_players (
    id integer NOT NULL,
    tournament_id integer NOT NULL,
    player_id integer,
    guest_name text,
    status text DEFAULT 'preregistered'::text NOT NULL,
    queue_position integer,
    seed integer,
    fargo_rating integer,
    is_starter_rating boolean DEFAULT false NOT NULL,
    paid_entry boolean DEFAULT false NOT NULL,
    paid_side_pots jsonb DEFAULT '[]'::jsonb NOT NULL,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_in_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    race_override integer,
    fargo_at_registration integer,
    CONSTRAINT tournament_players_identity_chk CHECK (((player_id IS NOT NULL) OR (guest_name IS NOT NULL))),
    CONSTRAINT tournament_players_status_check CHECK ((status = ANY (ARRAY['preregistered'::text, 'queued'::text, 'approved'::text, 'checked_in'::text, 'no_show'::text, 'cancelled'::text])))
);


--
-- Name: tournament_players_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tournament_players ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tournament_players_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tournament_settings_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_settings_templates (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    name text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tournament_settings_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tournament_settings_templates ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tournament_settings_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tournament_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_tables (
    id bigint NOT NULL,
    tournament_id integer NOT NULL,
    table_number integer NOT NULL,
    label text,
    status text DEFAULT 'available'::text NOT NULL,
    is_streaming boolean DEFAULT false NOT NULL,
    stream_link text,
    match_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tournament_tables_status_check CHECK ((status = ANY (ARRAY['available'::text, 'in_use'::text, 'unavailable'::text])))
);


--
-- Name: tournament_tables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tournament_tables ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tournament_tables_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tournament_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_team_members (
    id bigint NOT NULL,
    team_id bigint NOT NULL,
    tournament_id bigint NOT NULL,
    player_id bigint,
    role text DEFAULT 'member'::text NOT NULL,
    invite_status text DEFAULT 'pending'::text NOT NULL,
    invite_method text,
    invite_value text,
    temp_name text,
    suggested_fargo integer,
    is_verified boolean DEFAULT false NOT NULL,
    fargo_at_registration integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tournament_team_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tournament_team_members ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tournament_team_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tournament_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_teams (
    id bigint NOT NULL,
    tournament_id bigint NOT NULL,
    captain_id bigint NOT NULL,
    name text,
    status text DEFAULT 'pending_partner'::text NOT NULL,
    team_size integer DEFAULT 2 NOT NULL,
    locked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invite_token text DEFAULT (gen_random_uuid())::text NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    chip_override integer,
    paid_side_pots text[] DEFAULT '{}'::text[] NOT NULL,
    checked_in boolean DEFAULT false NOT NULL,
    paid boolean DEFAULT false NOT NULL
);


--
-- Name: tournament_teams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tournament_teams ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tournament_teams_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tournament_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_templates (
    id integer NOT NULL,
    venue_id integer NOT NULL,
    director_id integer NOT NULL,
    name text NOT NULL,
    description text,
    description_es text,
    game_type text NOT NULL,
    tournament_format text NOT NULL,
    game_spot text,
    race text,
    table_size text,
    equipment text,
    number_of_tables integer,
    entry_fee numeric(10,2),
    added_money numeric(10,2),
    side_pots jsonb,
    max_fargo integer,
    required_fargo_games integer,
    reports_to_fargo boolean DEFAULT false,
    open_tournament boolean DEFAULT false,
    phone_number text,
    thumbnail text,
    recurrence_type text NOT NULL,
    recurrence_day text NOT NULL,
    recurrence_week integer,
    start_time time without time zone NOT NULL,
    series_start_date date NOT NULL,
    series_end_date date,
    horizon_days integer DEFAULT 30,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    archived_by integer,
    chip_ranges jsonb,
    calcutta boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_template_open_vs_fargo CHECK ((NOT ((open_tournament = true) AND (max_fargo IS NOT NULL)))),
    CONSTRAINT tournament_templates_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text]))),
    CONSTRAINT tournament_templates_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'ended'::text, 'archived'::text])))
);


--
-- Name: COLUMN tournament_templates.chip_ranges; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tournament_templates.chip_ranges IS 'Array of {minRating, maxRating, chips} objects for Chip Tournament format. NULL if not a chip tournament.';


--
-- Name: tournament_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tournament_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tournament_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tournament_templates_id_seq OWNED BY public.tournament_templates.id;


--
-- Name: tournament_templates_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_templates_user (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    game_type text,
    tournament_format text,
    game_spot text,
    race text,
    description text,
    max_fargo integer,
    required_fargo_games integer,
    entry_fee numeric(10,2),
    added_money numeric(10,2),
    side_pots jsonb,
    reports_to_fargo boolean DEFAULT false,
    open_tournament boolean DEFAULT false,
    table_size text,
    number_of_tables integer,
    equipment text,
    thumbnail text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    chip_ranges jsonb,
    calcutta boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN tournament_templates_user.chip_ranges; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tournament_templates_user.chip_ranges IS 'Array of {minRating, maxRating, chips} objects for Chip Tournament format. NULL if not a chip tournament.';


--
-- Name: tournament_templates_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tournament_templates_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tournament_templates_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tournament_templates_user_id_seq OWNED BY public.tournament_templates_user.id;


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournaments (
    id integer NOT NULL,
    venue_id integer NOT NULL,
    director_id integer NOT NULL,
    template_id integer,
    name text NOT NULL,
    description text,
    description_es text,
    game_type text NOT NULL,
    tournament_format text NOT NULL,
    game_spot text,
    race text,
    table_size text,
    equipment text,
    number_of_tables integer,
    tournament_date date NOT NULL,
    start_time time without time zone NOT NULL,
    timezone text DEFAULT 'America/Phoenix'::text,
    entry_fee numeric(10,2),
    added_money numeric(10,2),
    side_pots jsonb,
    max_fargo integer,
    required_fargo_games integer,
    reports_to_fargo boolean DEFAULT false,
    open_tournament boolean DEFAULT false,
    phone_number text,
    thumbnail text,
    is_recurring boolean DEFAULT false,
    status text DEFAULT 'active'::text,
    cancellation_reason text,
    cancelled_at timestamp with time zone,
    cancelled_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    archived_by integer,
    parent_template_id integer,
    chip_ranges jsonb,
    is_hidden boolean DEFAULT false NOT NULL,
    calcutta boolean DEFAULT false NOT NULL,
    live_state text DEFAULT 'not_started'::text NOT NULL,
    preregistration_enabled boolean DEFAULT false NOT NULL,
    player_cap integer,
    online_registration_cap_pct integer DEFAULT 75 NOT NULL,
    registration_opens_at timestamp with time zone,
    registration_closes_at timestamp with time zone,
    payout_config jsonb,
    is_paused boolean DEFAULT false NOT NULL,
    paused_at timestamp with time zone,
    current_round integer DEFAULT 0 NOT NULL,
    live_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    bracket_source text DEFAULT 'compete'::text NOT NULL,
    external_bracket_url text,
    is_draft boolean DEFAULT false NOT NULL,
    recurrence_type text,
    contact_name text,
    completed_at timestamp with time zone,
    CONSTRAINT chk_open_vs_fargo CHECK ((NOT ((open_tournament = true) AND (max_fargo IS NOT NULL)))),
    CONSTRAINT tournaments_bracket_source_check CHECK ((bracket_source = ANY (ARRAY['compete'::text, 'external'::text]))),
    CONSTRAINT tournaments_live_state_check CHECK ((live_state = ANY (ARRAY['not_started'::text, 'registration_open'::text, 'registration_closed'::text, 'in_progress'::text, 'finished'::text]))),
    CONSTRAINT tournaments_max_fargo_check CHECK (((max_fargo IS NULL) OR (max_fargo <= 2000))),
    CONSTRAINT tournaments_online_registration_cap_pct_check CHECK (((online_registration_cap_pct >= 0) AND (online_registration_cap_pct <= 100))),
    CONSTRAINT tournaments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'completed'::text, 'archived'::text])))
);


--
-- Name: COLUMN tournaments.chip_ranges; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tournaments.chip_ranges IS 'Array of {minRating, maxRating, chips} objects for Chip Tournament format. NULL if not a chip tournament.';


--
-- Name: tournaments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tournaments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tournaments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tournaments_id_seq OWNED BY public.tournaments.id;


--
-- Name: venue_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_audits (
    id bigint NOT NULL,
    venue_id integer,
    owner_id integer,
    audit_type text DEFAULT 'initial'::text NOT NULL,
    website text,
    has_leagues boolean DEFAULT false,
    has_tournaments boolean DEFAULT false,
    table_count integer DEFAULT 0,
    brands text[] DEFAULT '{}'::text[],
    notes text,
    completed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: venue_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venue_audits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venue_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venue_audits_id_seq OWNED BY public.venue_audits.id;


--
-- Name: venue_directors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_directors (
    id integer NOT NULL,
    venue_id integer NOT NULL,
    director_id integer NOT NULL,
    assigned_by integer,
    assigned_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    archived_by integer
);


--
-- Name: venue_directors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venue_directors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venue_directors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venue_directors_id_seq OWNED BY public.venue_directors.id;


--
-- Name: venue_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_owners (
    id integer NOT NULL,
    venue_id integer NOT NULL,
    owner_id integer NOT NULL,
    assigned_by integer,
    assigned_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    archived_by integer,
    is_primary boolean DEFAULT false
);


--
-- Name: venue_owners_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venue_owners_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venue_owners_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venue_owners_id_seq OWNED BY public.venue_owners.id;


--
-- Name: venue_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_staging (
    id integer NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    notes text,
    flyer_url text,
    venue text,
    address text,
    city text,
    state text,
    zip_code text,
    phone text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    google_place_id text,
    num_tables integer,
    table_sizes text,
    table_brands text,
    website text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    "Additional notes" text,
    CONSTRAINT venue_staging_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'In Progress'::text, 'Verified'::text, 'Completed'::text, 'Problem'::text])))
);


--
-- Name: venue_staging_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venue_staging_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venue_staging_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venue_staging_id_seq OWNED BY public.venue_staging.id;


--
-- Name: venue_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id integer NOT NULL,
    plan_id uuid,
    status text DEFAULT 'trialing'::text NOT NULL,
    trial_start timestamp with time zone,
    trial_end timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    provider_customer_id text,
    provider_subscription_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    free_until timestamp with time zone,
    founding_note text,
    CONSTRAINT venue_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'unpaid'::text, 'canceled'::text, 'founding'::text])))
);


--
-- Name: venue_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_tables (
    id integer NOT NULL,
    venue_id integer,
    table_size character varying(20) NOT NULL,
    brand character varying(100),
    quantity integer DEFAULT 1,
    custom_size character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: venue_tables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venue_tables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venue_tables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venue_tables_id_seq OWNED BY public.venue_tables.id;


--
-- Name: venues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venues (
    id integer NOT NULL,
    venue text NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    zip_code text NOT NULL,
    phone text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    google_place_id text,
    tables jsonb,
    photo_url text,
    status text DEFAULT 'active'::text,
    last_verified timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    archived_by integer,
    archive_reason text,
    featured_until timestamp with time zone,
    featured_priority integer DEFAULT 0,
    website text,
    has_leagues boolean DEFAULT false,
    has_tournaments boolean DEFAULT false,
    last_audited_at timestamp with time zone,
    CONSTRAINT venues_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


--
-- Name: venues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venues_id_seq OWNED BY public.venues.id;


--
-- Name: alert_matches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_matches ALTER COLUMN id SET DEFAULT nextval('public.alert_matches_id_seq'::regclass);


--
-- Name: app_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_events ALTER COLUMN id SET DEFAULT nextval('public.app_events_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: bad_words id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bad_words ALTER COLUMN id SET DEFAULT nextval('public.bad_words_id_seq'::regclass);


--
-- Name: bar_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bar_requests ALTER COLUMN id SET DEFAULT nextval('public.bar_requests_id_seq'::regclass);


--
-- Name: faqs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs ALTER COLUMN id SET DEFAULT nextval('public.faqs_id_seq'::regclass);


--
-- Name: favorites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites ALTER COLUMN id SET DEFAULT nextval('public.favorites_id_seq'::regclass);


--
-- Name: featured_bars id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_bars ALTER COLUMN id SET DEFAULT nextval('public.featured_bars_id_seq'::regclass);


--
-- Name: featured_players id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_players ALTER COLUMN id SET DEFAULT nextval('public.featured_players_id_seq'::regclass);


--
-- Name: giveaway_draws id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_draws ALTER COLUMN id SET DEFAULT nextval('public.giveaway_draws_id_seq'::regclass);


--
-- Name: giveaway_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_entries ALTER COLUMN id SET DEFAULT nextval('public.giveaway_entries_id_seq'::regclass);


--
-- Name: giveaway_winner_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_winner_history ALTER COLUMN id SET DEFAULT nextval('public.giveaway_winner_history_id_seq'::regclass);


--
-- Name: giveaways id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaways ALTER COLUMN id SET DEFAULT nextval('public.giveaways_id_seq'::regclass);


--
-- Name: image_scan_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_scan_logs ALTER COLUMN id SET DEFAULT nextval('public.image_scan_logs_id_seq'::regclass);


--
-- Name: message_recipients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipients ALTER COLUMN id SET DEFAULT nextval('public.message_recipients_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: news_articles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_articles ALTER COLUMN id SET DEFAULT nextval('public.news_articles_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: reassignment_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reassignment_logs ALTER COLUMN id SET DEFAULT nextval('public.reassignment_logs_id_seq'::regclass);


--
-- Name: saved_searches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches ALTER COLUMN id SET DEFAULT nextval('public.saved_searches_id_seq'::regclass);


--
-- Name: search_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_alerts ALTER COLUMN id SET DEFAULT nextval('public.search_alerts_id_seq'::regclass);


--
-- Name: support_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets ALTER COLUMN id SET DEFAULT nextval('public.support_tickets_id_seq'::regclass);


--
-- Name: tournament_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_templates ALTER COLUMN id SET DEFAULT nextval('public.tournament_templates_id_seq'::regclass);


--
-- Name: tournament_templates_user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_templates_user ALTER COLUMN id SET DEFAULT nextval('public.tournament_templates_user_id_seq'::regclass);


--
-- Name: tournaments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments ALTER COLUMN id SET DEFAULT nextval('public.tournaments_id_seq'::regclass);


--
-- Name: venue_audits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_audits ALTER COLUMN id SET DEFAULT nextval('public.venue_audits_id_seq'::regclass);


--
-- Name: venue_directors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_directors ALTER COLUMN id SET DEFAULT nextval('public.venue_directors_id_seq'::regclass);


--
-- Name: venue_owners id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_owners ALTER COLUMN id SET DEFAULT nextval('public.venue_owners_id_seq'::regclass);


--
-- Name: venue_staging id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_staging ALTER COLUMN id SET DEFAULT nextval('public.venue_staging_id_seq'::regclass);


--
-- Name: venue_tables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_tables ALTER COLUMN id SET DEFAULT nextval('public.venue_tables_id_seq'::regclass);


--
-- Name: venues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues ALTER COLUMN id SET DEFAULT nextval('public.venues_id_seq'::regclass);


--
-- Name: alert_matches alert_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_matches
    ADD CONSTRAINT alert_matches_pkey PRIMARY KEY (id);


--
-- Name: alert_matches alert_matches_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_matches
    ADD CONSTRAINT alert_matches_unique UNIQUE (alert_id, tournament_id);


--
-- Name: app_events app_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_events
    ADD CONSTRAINT app_events_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bad_words bad_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bad_words
    ADD CONSTRAINT bad_words_pkey PRIMARY KEY (id);


--
-- Name: bad_words bad_words_word_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bad_words
    ADD CONSTRAINT bad_words_word_key UNIQUE (word);


--
-- Name: bar_requests bar_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bar_requests
    ADD CONSTRAINT bar_requests_pkey PRIMARY KEY (id);


--
-- Name: billing_plans billing_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (id);


--
-- Name: chip_config chip_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_config
    ADD CONSTRAINT chip_config_pkey PRIMARY KEY (tournament_id);


--
-- Name: chip_entries chip_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_entries
    ADD CONSTRAINT chip_entries_pkey PRIMARY KEY (id);


--
-- Name: chip_events chip_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_events
    ADD CONSTRAINT chip_events_pkey PRIMARY KEY (id);


--
-- Name: chip_matches chip_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_matches
    ADD CONSTRAINT chip_matches_pkey PRIMARY KEY (id);


--
-- Name: chip_results chip_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_results
    ADD CONSTRAINT chip_results_pkey PRIMARY KEY (id);


--
-- Name: chip_results chip_results_tournament_id_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_results
    ADD CONSTRAINT chip_results_tournament_id_entry_id_key UNIQUE (tournament_id, entry_id);


--
-- Name: chip_tables chip_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_tables
    ADD CONSTRAINT chip_tables_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: faqs faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_user_id_template_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_template_id_key UNIQUE (user_id, template_id);


--
-- Name: favorites favorites_user_id_tournament_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_tournament_id_key UNIQUE (user_id, tournament_id);


--
-- Name: featured_bars featured_bars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_bars
    ADD CONSTRAINT featured_bars_pkey PRIMARY KEY (id);


--
-- Name: featured_players featured_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_players
    ADD CONSTRAINT featured_players_pkey PRIMARY KEY (id);


--
-- Name: giveaway_draws giveaway_draws_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_draws
    ADD CONSTRAINT giveaway_draws_pkey PRIMARY KEY (id);


--
-- Name: giveaway_entries giveaway_entries_giveaway_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_entries
    ADD CONSTRAINT giveaway_entries_giveaway_id_user_id_key UNIQUE (giveaway_id, user_id);


--
-- Name: giveaway_entries giveaway_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_entries
    ADD CONSTRAINT giveaway_entries_pkey PRIMARY KEY (id);


--
-- Name: giveaway_winner_history giveaway_winner_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_winner_history
    ADD CONSTRAINT giveaway_winner_history_pkey PRIMARY KEY (id);


--
-- Name: giveaways giveaways_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaways
    ADD CONSTRAINT giveaways_pkey PRIMARY KEY (id);


--
-- Name: image_scan_logs image_scan_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_scan_logs
    ADD CONSTRAINT image_scan_logs_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_provider_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_provider_invoice_id_key UNIQUE (provider_invoice_id);


--
-- Name: message_rate_limits message_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_rate_limits
    ADD CONSTRAINT message_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: message_rate_limits message_rate_limits_sender_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_rate_limits
    ADD CONSTRAINT message_rate_limits_sender_id_key UNIQUE (sender_id);


--
-- Name: message_recipients message_recipients_message_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipients
    ADD CONSTRAINT message_recipients_message_id_user_id_key UNIQUE (message_id, user_id);


--
-- Name: message_recipients message_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipients
    ADD CONSTRAINT message_recipients_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: news_articles news_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_articles
    ADD CONSTRAINT news_articles_pkey PRIMARY KEY (id);


--
-- Name: news_articles news_articles_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_articles
    ADD CONSTRAINT news_articles_url_key UNIQUE (url);


--
-- Name: notification_message_recipients notification_message_recipients_message_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_message_recipients
    ADD CONSTRAINT notification_message_recipients_message_id_user_id_key UNIQUE (message_id, user_id);


--
-- Name: notification_message_recipients notification_message_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_message_recipients
    ADD CONSTRAINT notification_message_recipients_pkey PRIMARY KEY (id);


--
-- Name: notification_messages notification_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_messages
    ADD CONSTRAINT notification_messages_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_id_auto_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_auto_key UNIQUE (id_auto);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_name_key UNIQUE (user_name);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_user_id_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_token_key UNIQUE (user_id, token);


--
-- Name: reassignment_logs reassignment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reassignment_logs
    ADD CONSTRAINT reassignment_logs_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: saved_searches saved_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);


--
-- Name: search_alerts search_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_alerts
    ADD CONSTRAINT search_alerts_pkey PRIMARY KEY (id);


--
-- Name: sms_consent_events sms_consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_consent_events
    ADD CONSTRAINT sms_consent_events_pkey PRIMARY KEY (id);


--
-- Name: sms_messages sms_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_pkey PRIMARY KEY (id);


--
-- Name: sms_messages sms_messages_telnyx_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_telnyx_message_id_key UNIQUE (telnyx_message_id);


--
-- Name: sms_verification_attempts sms_verification_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_verification_attempts
    ADD CONSTRAINT sms_verification_attempts_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: tournament_analytics tournament_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_analytics
    ADD CONSTRAINT tournament_analytics_pkey PRIMARY KEY (id);


--
-- Name: tournament_players tournament_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_players
    ADD CONSTRAINT tournament_players_pkey PRIMARY KEY (id);


--
-- Name: tournament_settings_templates tournament_settings_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_settings_templates
    ADD CONSTRAINT tournament_settings_templates_pkey PRIMARY KEY (id);


--
-- Name: tournament_tables tournament_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_tables
    ADD CONSTRAINT tournament_tables_pkey PRIMARY KEY (id);


--
-- Name: tournament_tables tournament_tables_tournament_id_table_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_tables
    ADD CONSTRAINT tournament_tables_tournament_id_table_number_key UNIQUE (tournament_id, table_number);


--
-- Name: tournament_team_members tournament_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_pkey PRIMARY KEY (id);


--
-- Name: tournament_teams tournament_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_pkey PRIMARY KEY (id);


--
-- Name: tournament_templates tournament_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_templates
    ADD CONSTRAINT tournament_templates_pkey PRIMARY KEY (id);


--
-- Name: tournament_templates_user tournament_templates_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_templates_user
    ADD CONSTRAINT tournament_templates_user_pkey PRIMARY KEY (id);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- Name: venue_audits venue_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_audits
    ADD CONSTRAINT venue_audits_pkey PRIMARY KEY (id);


--
-- Name: venue_directors venue_directors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_directors
    ADD CONSTRAINT venue_directors_pkey PRIMARY KEY (id);


--
-- Name: venue_directors venue_directors_venue_id_director_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_directors
    ADD CONSTRAINT venue_directors_venue_id_director_id_key UNIQUE (venue_id, director_id);


--
-- Name: venue_owners venue_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_owners
    ADD CONSTRAINT venue_owners_pkey PRIMARY KEY (id);


--
-- Name: venue_owners venue_owners_venue_id_owner_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_owners
    ADD CONSTRAINT venue_owners_venue_id_owner_id_key UNIQUE (venue_id, owner_id);


--
-- Name: venue_staging venue_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_staging
    ADD CONSTRAINT venue_staging_pkey PRIMARY KEY (id);


--
-- Name: venue_subscriptions venue_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_subscriptions
    ADD CONSTRAINT venue_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: venue_tables venue_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_tables
    ADD CONSTRAINT venue_tables_pkey PRIMARY KEY (id);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: chip_entries_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chip_entries_tid ON public.chip_entries USING btree (tournament_id);


--
-- Name: chip_events_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chip_events_tid ON public.chip_events USING btree (tournament_id);


--
-- Name: chip_matches_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chip_matches_tid ON public.chip_matches USING btree (tournament_id);


--
-- Name: chip_results_p1_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chip_results_p1_idx ON public.chip_results USING btree (p1_profile_id);


--
-- Name: chip_results_p2_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chip_results_p2_idx ON public.chip_results USING btree (p2_profile_id);


--
-- Name: chip_results_tournament_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chip_results_tournament_idx ON public.chip_results USING btree (tournament_id);


--
-- Name: chip_tables_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chip_tables_tid ON public.chip_tables USING btree (tournament_id);


--
-- Name: conv_messages_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conv_messages_conversation_idx ON public.conversation_messages USING btree (conversation_id, created_at);


--
-- Name: conv_participants_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conv_participants_user_idx ON public.conversation_participants USING btree (user_id);


--
-- Name: conversations_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_created_by_idx ON public.conversations USING btree (created_by);


--
-- Name: conversations_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_updated_at_idx ON public.conversations USING btree (updated_at DESC);


--
-- Name: idx_alert_matches_alert_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_matches_alert_id ON public.alert_matches USING btree (alert_id);


--
-- Name: idx_alert_matches_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_matches_created ON public.alert_matches USING btree (created_at);


--
-- Name: idx_alert_matches_notified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_matches_notified ON public.alert_matches USING btree (notified_at) WHERE (notified_at IS NOT NULL);


--
-- Name: idx_alert_matches_tournament_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_matches_tournament_id ON public.alert_matches USING btree (tournament_id);


--
-- Name: idx_analytics_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_created_at ON public.tournament_analytics USING btree (created_at);


--
-- Name: idx_analytics_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_event_type ON public.tournament_analytics USING btree (event_type);


--
-- Name: idx_analytics_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_tournament ON public.tournament_analytics USING btree (tournament_id);


--
-- Name: idx_app_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_events_created_at ON public.app_events USING btree (created_at);


--
-- Name: idx_app_events_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_events_entity ON public.app_events USING btree (entity_type, entity_id);


--
-- Name: idx_app_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_events_event_type ON public.app_events USING btree (event_type);


--
-- Name: idx_app_events_type_entity_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_events_type_entity_date ON public.app_events USING btree (event_type, entity_type, entity_id, created_at);


--
-- Name: idx_app_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_events_user_id ON public.app_events USING btree (user_id);


--
-- Name: idx_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action);


--
-- Name: idx_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id);


--
-- Name: idx_bad_words_word; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bad_words_word ON public.bad_words USING btree (word);


--
-- Name: idx_bar_requests_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bar_requests_state ON public.bar_requests USING btree (state);


--
-- Name: idx_bar_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bar_requests_status ON public.bar_requests USING btree (status);


--
-- Name: idx_bar_requests_submitted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bar_requests_submitted_by ON public.bar_requests USING btree (submitted_by);


--
-- Name: idx_faqs_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faqs_category ON public.faqs USING btree (category);


--
-- Name: idx_faqs_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faqs_published ON public.faqs USING btree (is_published) WHERE (is_published = true);


--
-- Name: idx_favorites_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_template ON public.favorites USING btree (template_id);


--
-- Name: idx_favorites_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_tournament ON public.favorites USING btree (tournament_id);


--
-- Name: idx_favorites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_user ON public.favorites USING btree (user_id);


--
-- Name: idx_featured_bars_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_featured_bars_active ON public.featured_bars USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_featured_bars_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_featured_bars_featured ON public.featured_bars USING btree (featured_until);


--
-- Name: idx_featured_players_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_featured_players_active ON public.featured_players USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_featured_players_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_featured_players_featured ON public.featured_players USING btree (featured_until);


--
-- Name: idx_giveaway_draws_giveaway; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giveaway_draws_giveaway ON public.giveaway_draws USING btree (giveaway_id);


--
-- Name: idx_giveaway_entries_giveaway; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giveaway_entries_giveaway ON public.giveaway_entries USING btree (giveaway_id);


--
-- Name: idx_giveaway_entries_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giveaway_entries_user ON public.giveaway_entries USING btree (user_id);


--
-- Name: idx_giveaways_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giveaways_end_date ON public.giveaways USING btree (end_date);


--
-- Name: idx_giveaways_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giveaways_status ON public.giveaways USING btree (status);


--
-- Name: idx_giveaways_winner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giveaways_winner ON public.giveaways USING btree (winner_id);


--
-- Name: idx_image_scan_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_scan_logs_created_at ON public.image_scan_logs USING btree (created_at);


--
-- Name: idx_image_scan_logs_is_appropriate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_scan_logs_is_appropriate ON public.image_scan_logs USING btree (is_appropriate);


--
-- Name: idx_image_scan_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_scan_logs_user_id ON public.image_scan_logs USING btree (user_id);


--
-- Name: idx_message_recipients_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_recipients_unread ON public.message_recipients USING btree (user_id, read_at) WHERE (read_at IS NULL);


--
-- Name: idx_message_recipients_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_recipients_user ON public.message_recipients USING btree (user_id);


--
-- Name: idx_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id);


--
-- Name: idx_messages_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_template ON public.messages USING btree (template_id);


--
-- Name: idx_messages_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_tournament ON public.messages USING btree (tournament_id);


--
-- Name: idx_news_articles_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_articles_published ON public.news_articles USING btree (published_at DESC);


--
-- Name: idx_news_articles_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_articles_source ON public.news_articles USING btree (source);


--
-- Name: idx_notifications_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_pending ON public.notifications USING btree (status, scheduled_for) WHERE (status = 'pending'::text);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_profiles_home_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_home_state ON public.profiles USING btree (home_state);


--
-- Name: idx_profiles_is_disabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_is_disabled ON public.profiles USING btree (is_disabled) WHERE (is_disabled = true);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_status ON public.profiles USING btree (status);


--
-- Name: idx_profiles_user_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_user_name ON public.profiles USING btree (user_name);


--
-- Name: idx_reassignment_logs_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reassignment_logs_by ON public.reassignment_logs USING btree (reassigned_by);


--
-- Name: idx_reassignment_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reassignment_logs_date ON public.reassignment_logs USING btree (reassigned_at DESC);


--
-- Name: idx_reassignment_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reassignment_logs_entity ON public.reassignment_logs USING btree (entity_type, entity_id);


--
-- Name: idx_reports_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_content ON public.reports USING btree (content_type, content_id);


--
-- Name: idx_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_created_at ON public.reports USING btree (created_at DESC);


--
-- Name: idx_reports_reporter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reporter ON public.reports USING btree (reporter_id);


--
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status ON public.reports USING btree (status);


--
-- Name: idx_saved_searches_alert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_searches_alert ON public.saved_searches USING btree (alert_enabled) WHERE (alert_enabled = true);


--
-- Name: idx_saved_searches_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_searches_user ON public.saved_searches USING btree (user_id);


--
-- Name: idx_search_alerts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_alerts_active ON public.search_alerts USING btree (is_active);


--
-- Name: idx_search_alerts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_alerts_created ON public.search_alerts USING btree (created_at);


--
-- Name: idx_search_alerts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_alerts_user_id ON public.search_alerts USING btree (user_id);


--
-- Name: idx_support_tickets_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_assigned ON public.support_tickets USING btree (assigned_to);


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: idx_support_tickets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_user ON public.support_tickets USING btree (user_id);


--
-- Name: idx_tournament_templates_director; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_templates_director ON public.tournament_templates USING btree (director_id);


--
-- Name: idx_tournament_templates_recurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_templates_recurrence ON public.tournament_templates USING btree (recurrence_type, recurrence_day);


--
-- Name: idx_tournament_templates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_templates_status ON public.tournament_templates USING btree (status);


--
-- Name: idx_tournament_templates_user_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_templates_user_user ON public.tournament_templates_user USING btree (user_id);


--
-- Name: idx_tournament_templates_venue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_templates_venue ON public.tournament_templates USING btree (venue_id);


--
-- Name: idx_tournaments_active_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_active_date ON public.tournaments USING btree (tournament_date, venue_id) WHERE ((status = 'active'::text) AND (is_hidden = false));


--
-- Name: idx_tournaments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_date ON public.tournaments USING btree (tournament_date);


--
-- Name: idx_tournaments_director; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_director ON public.tournaments USING btree (director_id);


--
-- Name: idx_tournaments_game_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_game_type ON public.tournaments USING btree (game_type);


--
-- Name: idx_tournaments_is_hidden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_is_hidden ON public.tournaments USING btree (is_hidden) WHERE (is_hidden = false);


--
-- Name: idx_tournaments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_status ON public.tournaments USING btree (status);


--
-- Name: idx_tournaments_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_template ON public.tournaments USING btree (template_id);


--
-- Name: idx_tournaments_venue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_venue ON public.tournaments USING btree (venue_id);


--
-- Name: idx_venue_directors_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_directors_active ON public.venue_directors USING btree (venue_id) WHERE (archived_at IS NULL);


--
-- Name: idx_venue_directors_director; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_directors_director ON public.venue_directors USING btree (director_id);


--
-- Name: idx_venue_directors_venue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_directors_venue ON public.venue_directors USING btree (venue_id);


--
-- Name: idx_venue_owners_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_owners_active ON public.venue_owners USING btree (venue_id) WHERE (archived_at IS NULL);


--
-- Name: idx_venue_owners_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_owners_owner ON public.venue_owners USING btree (owner_id);


--
-- Name: idx_venue_owners_venue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_owners_venue ON public.venue_owners USING btree (venue_id);


--
-- Name: idx_venues_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venues_city ON public.venues USING btree (city);


--
-- Name: idx_venues_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venues_featured ON public.venues USING btree (featured_until) WHERE (featured_until IS NOT NULL);


--
-- Name: idx_venues_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venues_location ON public.venues USING btree (latitude, longitude);


--
-- Name: idx_venues_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venues_state ON public.venues USING btree (state);


--
-- Name: idx_venues_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venues_status ON public.venues USING btree (status);


--
-- Name: idx_winner_history_giveaway; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_winner_history_giveaway ON public.giveaway_winner_history USING btree (giveaway_id);


--
-- Name: idx_winner_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_winner_history_user ON public.giveaway_winner_history USING btree (user_id);


--
-- Name: notif_messages_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notif_messages_sender_idx ON public.notification_messages USING btree (sender_id);


--
-- Name: notif_recipients_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notif_recipients_unread_idx ON public.notification_message_recipients USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: notif_recipients_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notif_recipients_user_idx ON public.notification_message_recipients USING btree (user_id);


--
-- Name: push_tokens_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_tokens_active_idx ON public.push_tokens USING btree (user_id) WHERE (is_active = true);


--
-- Name: sms_consent_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_consent_events_user_idx ON public.sms_consent_events USING btree (user_id, created_at DESC);


--
-- Name: sms_messages_idempotency_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sms_messages_idempotency_key_uidx ON public.sms_messages USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: sms_messages_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_messages_user_idx ON public.sms_messages USING btree (user_id, created_at DESC);


--
-- Name: sms_verification_attempts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_verification_attempts_user_idx ON public.sms_verification_attempts USING btree (user_id, action, created_at DESC);


--
-- Name: tournament_players_player_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tournament_players_player_idx ON public.tournament_players USING btree (player_id);


--
-- Name: tournament_players_tournament_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tournament_players_tournament_idx ON public.tournament_players USING btree (tournament_id);


--
-- Name: tournament_players_unique_real_player; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tournament_players_unique_real_player ON public.tournament_players USING btree (tournament_id, player_id) WHERE (player_id IS NOT NULL);


--
-- Name: tournament_settings_templates_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tournament_settings_templates_user_idx ON public.tournament_settings_templates USING btree (user_id, created_at DESC);


--
-- Name: tournament_teams_captain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tournament_teams_captain ON public.tournament_teams USING btree (captain_id);


--
-- Name: tournament_teams_invite_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tournament_teams_invite_token_key ON public.tournament_teams USING btree (invite_token);


--
-- Name: tournament_teams_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tournament_teams_tid ON public.tournament_teams USING btree (tournament_id);


--
-- Name: tt_members_one_active_per_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tt_members_one_active_per_tournament ON public.tournament_team_members USING btree (tournament_id, player_id) WHERE ((player_id IS NOT NULL) AND (invite_status <> 'declined'::text));


--
-- Name: tt_members_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_members_player ON public.tournament_team_members USING btree (player_id);


--
-- Name: tt_members_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_members_team ON public.tournament_team_members USING btree (team_id);


--
-- Name: tt_members_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_members_tid ON public.tournament_team_members USING btree (tournament_id);


--
-- Name: profiles on_profile_created_create_notif_prefs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_created_create_notif_prefs AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_notification_preferences();


--
-- Name: profiles profiles_guard_phone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_guard_phone BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_guard_phone();


--
-- Name: tournament_players tournament_players_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tournament_players_set_updated_at BEFORE UPDATE ON public.tournament_players FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversation_messages trg_bump_conversation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_conversation AFTER INSERT ON public.conversation_messages FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_updated_at();


--
-- Name: search_alerts update_search_alerts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_search_alerts_updated_at BEFORE UPDATE ON public.search_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_staging venue_staging_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER venue_staging_updated_at BEFORE UPDATE ON public.venue_staging FOR EACH ROW EXECUTE FUNCTION public.update_venue_staging_updated_at();


--
-- Name: alert_matches alert_matches_alert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_matches
    ADD CONSTRAINT alert_matches_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES public.search_alerts(id) ON DELETE CASCADE;


--
-- Name: alert_matches alert_matches_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_matches
    ADD CONSTRAINT alert_matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: app_events app_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_events
    ADD CONSTRAINT app_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: bar_requests bar_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bar_requests
    ADD CONSTRAINT bar_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: bar_requests bar_requests_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bar_requests
    ADD CONSTRAINT bar_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);


--
-- Name: chip_config chip_config_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_config
    ADD CONSTRAINT chip_config_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: chip_entries chip_entries_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_entries
    ADD CONSTRAINT chip_entries_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: chip_events chip_events_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_events
    ADD CONSTRAINT chip_events_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: chip_matches chip_matches_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_matches
    ADD CONSTRAINT chip_matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: chip_results chip_results_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_results
    ADD CONSTRAINT chip_results_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: chip_tables chip_tables_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chip_tables
    ADD CONSTRAINT chip_tables_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id);


--
-- Name: favorites favorites_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tournament_templates(id);


--
-- Name: favorites favorites_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id);


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: featured_bars featured_bars_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_bars
    ADD CONSTRAINT featured_bars_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: featured_players featured_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.featured_players
    ADD CONSTRAINT featured_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: giveaway_draws giveaway_draws_drawn_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_draws
    ADD CONSTRAINT giveaway_draws_drawn_by_fkey FOREIGN KEY (drawn_by) REFERENCES public.profiles(id_auto);


--
-- Name: giveaway_draws giveaway_draws_giveaway_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_draws
    ADD CONSTRAINT giveaway_draws_giveaway_id_fkey FOREIGN KEY (giveaway_id) REFERENCES public.giveaways(id);


--
-- Name: giveaway_draws giveaway_draws_invalidated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_draws
    ADD CONSTRAINT giveaway_draws_invalidated_by_fkey FOREIGN KEY (invalidated_by) REFERENCES public.profiles(id_auto);


--
-- Name: giveaway_draws giveaway_draws_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_draws
    ADD CONSTRAINT giveaway_draws_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id_auto);


--
-- Name: giveaway_entries giveaway_entries_giveaway_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_entries
    ADD CONSTRAINT giveaway_entries_giveaway_id_fkey FOREIGN KEY (giveaway_id) REFERENCES public.giveaways(id);


--
-- Name: giveaway_entries giveaway_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_entries
    ADD CONSTRAINT giveaway_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: giveaway_winner_history giveaway_winner_history_disqualified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_winner_history
    ADD CONSTRAINT giveaway_winner_history_disqualified_by_fkey FOREIGN KEY (disqualified_by) REFERENCES public.profiles(id_auto);


--
-- Name: giveaway_winner_history giveaway_winner_history_drawn_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_winner_history
    ADD CONSTRAINT giveaway_winner_history_drawn_by_fkey FOREIGN KEY (drawn_by) REFERENCES public.profiles(id_auto);


--
-- Name: giveaway_winner_history giveaway_winner_history_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_winner_history
    ADD CONSTRAINT giveaway_winner_history_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.giveaway_entries(id);


--
-- Name: giveaway_winner_history giveaway_winner_history_giveaway_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_winner_history
    ADD CONSTRAINT giveaway_winner_history_giveaway_id_fkey FOREIGN KEY (giveaway_id) REFERENCES public.giveaways(id);


--
-- Name: giveaway_winner_history giveaway_winner_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaway_winner_history
    ADD CONSTRAINT giveaway_winner_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: giveaways giveaways_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaways
    ADD CONSTRAINT giveaways_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id_auto);


--
-- Name: giveaways giveaways_winner_drawn_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaways
    ADD CONSTRAINT giveaways_winner_drawn_by_fkey FOREIGN KEY (winner_drawn_by) REFERENCES public.profiles(id_auto);


--
-- Name: giveaways giveaways_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giveaways
    ADD CONSTRAINT giveaways_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id_auto);


--
-- Name: image_scan_logs image_scan_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_scan_logs
    ADD CONSTRAINT image_scan_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: invoices invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.venue_subscriptions(id);


--
-- Name: invoices invoices_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: message_rate_limits message_rate_limits_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_rate_limits
    ADD CONSTRAINT message_rate_limits_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: message_recipients message_recipients_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipients
    ADD CONSTRAINT message_recipients_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: message_recipients message_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipients
    ADD CONSTRAINT message_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id_auto);


--
-- Name: messages messages_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tournament_templates(id);


--
-- Name: messages messages_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id);


--
-- Name: messages messages_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: notification_message_recipients notification_message_recipients_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_message_recipients
    ADD CONSTRAINT notification_message_recipients_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.notification_messages(id) ON DELETE CASCADE;


--
-- Name: notification_message_recipients notification_message_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_message_recipients
    ADD CONSTRAINT notification_message_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_messages notification_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_messages
    ADD CONSTRAINT notification_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_messages notification_messages_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_messages
    ADD CONSTRAINT notification_messages_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id);


--
-- Name: notification_messages notification_messages_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_messages
    ADD CONSTRAINT notification_messages_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: payment_methods payment_methods_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reassignment_logs reassignment_logs_new_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reassignment_logs
    ADD CONSTRAINT reassignment_logs_new_user_fkey FOREIGN KEY (new_user_id) REFERENCES public.profiles(id_auto);


--
-- Name: reassignment_logs reassignment_logs_previous_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reassignment_logs
    ADD CONSTRAINT reassignment_logs_previous_user_fkey FOREIGN KEY (previous_user_id) REFERENCES public.profiles(id_auto);


--
-- Name: reassignment_logs reassignment_logs_reassigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reassignment_logs
    ADD CONSTRAINT reassignment_logs_reassigned_by_fkey FOREIGN KEY (reassigned_by) REFERENCES public.profiles(id_auto);


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reports reports_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: saved_searches saved_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: search_alerts search_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_alerts
    ADD CONSTRAINT search_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto) ON DELETE CASCADE;


--
-- Name: sms_consent_events sms_consent_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_consent_events
    ADD CONSTRAINT sms_consent_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sms_messages sms_messages_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;


--
-- Name: sms_messages sms_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sms_verification_attempts sms_verification_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_verification_attempts
    ADD CONSTRAINT sms_verification_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id_auto);


--
-- Name: support_tickets support_tickets_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id_auto);


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: tournament_analytics tournament_analytics_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_analytics
    ADD CONSTRAINT tournament_analytics_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_analytics tournament_analytics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_analytics
    ADD CONSTRAINT tournament_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tournament_players tournament_players_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_players
    ADD CONSTRAINT tournament_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;


--
-- Name: tournament_players tournament_players_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_players
    ADD CONSTRAINT tournament_players_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_settings_templates tournament_settings_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_settings_templates
    ADD CONSTRAINT tournament_settings_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto) ON DELETE CASCADE;


--
-- Name: tournament_tables tournament_tables_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_tables
    ADD CONSTRAINT tournament_tables_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_team_members tournament_team_members_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.profiles(id_auto) ON DELETE SET NULL;


--
-- Name: tournament_team_members tournament_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.tournament_teams(id) ON DELETE CASCADE;


--
-- Name: tournament_team_members tournament_team_members_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_teams tournament_teams_captain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES public.profiles(id_auto) ON DELETE CASCADE;


--
-- Name: tournament_teams tournament_teams_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_templates tournament_templates_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_templates
    ADD CONSTRAINT tournament_templates_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto);


--
-- Name: tournament_templates tournament_templates_director_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_templates
    ADD CONSTRAINT tournament_templates_director_id_fkey FOREIGN KEY (director_id) REFERENCES public.profiles(id_auto);


--
-- Name: tournament_templates_user tournament_templates_user_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_templates_user
    ADD CONSTRAINT tournament_templates_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id_auto);


--
-- Name: tournament_templates tournament_templates_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_templates
    ADD CONSTRAINT tournament_templates_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: tournaments tournaments_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto);


--
-- Name: tournaments tournaments_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id_auto);


--
-- Name: tournaments tournaments_director_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_director_id_fkey FOREIGN KEY (director_id) REFERENCES public.profiles(id_auto);


--
-- Name: tournaments tournaments_parent_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_parent_template_id_fkey FOREIGN KEY (parent_template_id) REFERENCES public.tournament_templates(id);


--
-- Name: tournaments tournaments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tournament_templates(id);


--
-- Name: tournaments tournaments_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: venue_audits venue_audits_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_audits
    ADD CONSTRAINT venue_audits_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id_auto);


--
-- Name: venue_audits venue_audits_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_audits
    ADD CONSTRAINT venue_audits_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: venue_directors venue_directors_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_directors
    ADD CONSTRAINT venue_directors_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto);


--
-- Name: venue_directors venue_directors_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_directors
    ADD CONSTRAINT venue_directors_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id_auto);


--
-- Name: venue_directors venue_directors_director_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_directors
    ADD CONSTRAINT venue_directors_director_id_fkey FOREIGN KEY (director_id) REFERENCES public.profiles(id_auto);


--
-- Name: venue_directors venue_directors_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_directors
    ADD CONSTRAINT venue_directors_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: venue_owners venue_owners_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_owners
    ADD CONSTRAINT venue_owners_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto);


--
-- Name: venue_owners venue_owners_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_owners
    ADD CONSTRAINT venue_owners_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id_auto);


--
-- Name: venue_owners venue_owners_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_owners
    ADD CONSTRAINT venue_owners_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id_auto);


--
-- Name: venue_owners venue_owners_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_owners
    ADD CONSTRAINT venue_owners_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: venue_subscriptions venue_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_subscriptions
    ADD CONSTRAINT venue_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.billing_plans(id);


--
-- Name: venue_subscriptions venue_subscriptions_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_subscriptions
    ADD CONSTRAINT venue_subscriptions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_tables venue_tables_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_tables
    ADD CONSTRAINT venue_tables_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venues venues_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id_auto);


--
-- Name: image_scan_logs Admin can view all scan logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view all scan logs" ON public.image_scan_logs FOR SELECT USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- Name: venue_owners Admins can delete venue_owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete venue_owners" ON public.venue_owners FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: app_events Admins can read all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all events" ON public.app_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: reports Admins can update all reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all reports" ON public.reports FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: profiles Admins can update any profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: tournaments Admins can update any tournament; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any tournament" ON public.tournaments FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: venue_owners Admins can update venue_owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update venue_owners" ON public.venue_owners FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: reports Admins can view all reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: notification_messages Admins read all notification messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all notification messages" ON public.notification_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: push_tokens Admins read all push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all push tokens" ON public.push_tokens FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: notifications Allow insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: app_events Anon can insert events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon can insert events" ON public.app_events FOR INSERT TO anon WITH CHECK ((user_id IS NULL));


--
-- Name: tournament_analytics Anyone can insert analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert analytics" ON public.tournament_analytics FOR INSERT WITH CHECK (true);


--
-- Name: app_events Anyone can insert events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert events" ON public.app_events FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: giveaways Anyone can read active giveaways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active giveaways" ON public.giveaways FOR SELECT USING ((status = ANY (ARRAY['active'::text, 'ended'::text, 'awarded'::text])));


--
-- Name: tournament_templates Anyone can read active templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active templates" ON public.tournament_templates FOR SELECT USING ((status = 'active'::text));


--
-- Name: venues Anyone can read active venues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active venues" ON public.venues FOR SELECT USING ((status = 'active'::text));


--
-- Name: bad_words Anyone can read bad_words; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read bad_words" ON public.bad_words FOR SELECT USING (true);


--
-- Name: featured_players Anyone can read featured players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read featured players" ON public.featured_players FOR SELECT USING ((is_active = true));


--
-- Name: news_articles Anyone can read news; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read news" ON public.news_articles FOR SELECT USING (true);


--
-- Name: notification_preferences Anyone can read preferences for recipient filtering; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read preferences for recipient filtering" ON public.notification_preferences FOR SELECT TO authenticated USING (true);


--
-- Name: faqs Anyone can read published faqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read published faqs" ON public.faqs FOR SELECT USING ((is_published = true));


--
-- Name: tournament_players Anyone can read tournament players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read tournament players" ON public.tournament_players FOR SELECT USING (true);


--
-- Name: tournament_tables Anyone can read tournament tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read tournament tables" ON public.tournament_tables FOR SELECT USING (true);


--
-- Name: tournaments Anyone can read tournaments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read tournaments" ON public.tournaments FOR SELECT USING (((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: profiles Anyone can view active profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active profiles" ON public.profiles FOR SELECT USING ((status = 'active'::text));


--
-- Name: venue_directors Anyone can view active venue directors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active venue directors" ON public.venue_directors FOR SELECT USING ((archived_at IS NULL));


--
-- Name: venue_owners Anyone can view active venue owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active venue owners" ON public.venue_owners FOR SELECT USING ((archived_at IS NULL));


--
-- Name: giveaway_entries Anyone can view entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view entries" ON public.giveaway_entries FOR SELECT USING (true);


--
-- Name: giveaway_draws Anyone can view giveaway draws; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view giveaway draws" ON public.giveaway_draws FOR SELECT USING (true);


--
-- Name: messages Anyone can view messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view messages" ON public.messages FOR SELECT USING (true);


--
-- Name: venues Anyone can view venues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view venues" ON public.venues FOR SELECT TO authenticated USING (true);


--
-- Name: bar_requests Authenticated users can insert bar requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert bar requests" ON public.bar_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = submitted_by));


--
-- Name: billing_plans Authenticated users can read active billing plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read active billing plans" ON public.billing_plans FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: notification_message_recipients Authorized senders can insert deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized senders can insert deliveries" ON public.notification_message_recipients FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['tournament_director'::text, 'bar_owner'::text, 'super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: reassignment_logs Authorized users can create reassignment logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized users can create reassignment logs" ON public.reassignment_logs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'bar_owner'::text]))))));


--
-- Name: invoices Bar owner can read own venue invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owner can read own venue invoices" ON public.invoices FOR SELECT TO authenticated USING ((venue_id IN ( SELECT vo.venue_id
   FROM (public.venue_owners vo
     JOIN public.profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));


--
-- Name: payment_methods Bar owner can read own venue payment methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owner can read own venue payment methods" ON public.payment_methods FOR SELECT TO authenticated USING ((venue_id IN ( SELECT vo.venue_id
   FROM (public.venue_owners vo
     JOIN public.profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));


--
-- Name: venue_subscriptions Bar owner can read own venue subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owner can read own venue subscriptions" ON public.venue_subscriptions FOR SELECT TO authenticated USING ((venue_id IN ( SELECT vo.venue_id
   FROM (public.venue_owners vo
     JOIN public.profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));


--
-- Name: venue_directors Bar owners can delete venue_directors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can delete venue_directors" ON public.venue_directors FOR DELETE USING ((public.is_venue_owner(venue_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: venue_owners Bar owners can delete venue_owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can delete venue_owners" ON public.venue_owners FOR DELETE USING ((public.is_venue_owner(venue_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: venue_tables Bar owners can delete venue_tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can delete venue_tables" ON public.venue_tables FOR DELETE TO authenticated USING (true);


--
-- Name: venue_directors Bar owners can insert venue_directors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can insert venue_directors" ON public.venue_directors FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: venue_owners Bar owners can insert venue_owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can insert venue_owners" ON public.venue_owners FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: venue_tables Bar owners can insert venue_tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can insert venue_tables" ON public.venue_tables FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: venues Bar owners can insert venues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can insert venues" ON public.venues FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: profiles Bar owners can manage team roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can manage team roles" ON public.profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles editor
  WHERE ((editor.id = auth.uid()) AND (editor.role = ANY (ARRAY['bar_owner'::text, 'super_admin'::text, 'compete_admin'::text]))))));


--
-- Name: venues Bar owners can update their venues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can update their venues" ON public.venues FOR UPDATE TO authenticated USING ((id IN ( SELECT venue_owners.venue_id
   FROM public.venue_owners
  WHERE (venue_owners.owner_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: venue_directors Bar owners can update venue_directors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can update venue_directors" ON public.venue_directors FOR UPDATE TO authenticated USING (true);


--
-- Name: venue_tables Bar owners can update venue_tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can update venue_tables" ON public.venue_tables FOR UPDATE TO authenticated USING (true);


--
-- Name: favorites Bar owners can view favorites on their venue tournaments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can view favorites on their venue tournaments" ON public.favorites FOR SELECT TO authenticated USING ((tournament_id IN ( SELECT t.id
   FROM (public.tournaments t
     JOIN public.venue_owners vo ON ((vo.venue_id = t.venue_id)))
  WHERE (vo.owner_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: reassignment_logs Bar owners can view their venue reassignment logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can view their venue reassignment logs" ON public.reassignment_logs FOR SELECT USING (((entity_type = 'venue_owner'::text) AND (EXISTS ( SELECT 1
   FROM public.venue_owners
  WHERE ((venue_owners.owner_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) AND (venue_owners.venue_id = reassignment_logs.entity_id) AND (venue_owners.archived_at IS NULL))))));


--
-- Name: venue_owners Bar owners can view their venue_owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can view their venue_owners" ON public.venue_owners FOR SELECT TO authenticated USING ((owner_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: venue_directors Bar owners can view venue_directors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can view venue_directors" ON public.venue_directors FOR SELECT TO authenticated USING (true);


--
-- Name: venue_tables Bar owners can view venue_tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bar owners can view venue_tables" ON public.venue_tables FOR SELECT TO authenticated USING (true);


--
-- Name: app_events Directors and owners can read own tournament events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Directors and owners can read own tournament events" ON public.app_events FOR SELECT TO authenticated USING (((entity_id IS NULL) OR (entity_id IN ( SELECT t.id
   FROM public.tournaments t
  WHERE (t.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))
UNION
 SELECT t.id
   FROM (public.tournaments t
     JOIN public.venue_owners vo ON ((vo.venue_id = t.venue_id)))
  WHERE ((vo.owner_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) AND (vo.archived_at IS NULL))))));


--
-- Name: tournaments Directors and venue owners can insert tournaments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Directors and venue owners can insert tournaments" ON public.tournaments FOR INSERT WITH CHECK (((director_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (venue_id IN ( SELECT venue_owners.venue_id
   FROM public.venue_owners
  WHERE ((venue_owners.owner_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) AND (venue_owners.archived_at IS NULL)))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: tournaments Directors and venue owners can update tournaments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Directors and venue owners can update tournaments" ON public.tournaments FOR UPDATE USING (((director_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (venue_id IN ( SELECT venue_owners.venue_id
   FROM public.venue_owners
  WHERE ((venue_owners.owner_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) AND (venue_owners.archived_at IS NULL))))));


--
-- Name: favorites Directors can count favorites on their tournaments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Directors can count favorites on their tournaments" ON public.favorites FOR SELECT TO authenticated USING ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE (tournaments.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: messages Directors can insert messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Directors can insert messages" ON public.messages FOR INSERT WITH CHECK ((sender_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tournament_templates Directors can insert templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Directors can insert templates" ON public.tournament_templates FOR INSERT WITH CHECK (((director_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (venue_id IN ( SELECT venue_directors.venue_id
   FROM public.venue_directors
  WHERE ((venue_directors.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) AND (venue_directors.archived_at IS NULL))))));


--
-- Name: tournament_analytics Directors can read own analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Directors can read own analytics" ON public.tournament_analytics FOR SELECT USING (((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE (tournaments.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))) OR (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['compete_admin'::text, 'super_admin'::text]))));


--
-- Name: tournament_templates Directors can update own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Directors can update own templates" ON public.tournament_templates FOR UPDATE USING ((director_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: audit_log No direct access to audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct access to audit log" ON public.audit_log FOR SELECT USING (false);


--
-- Name: tournament_players Player deletes own or TD deletes any; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Player deletes own or TD deletes any" ON public.tournament_players FOR DELETE USING (((player_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_players.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: tournament_players Player self-register or TD adds players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Player self-register or TD adds players" ON public.tournament_players FOR INSERT WITH CHECK (((player_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_players.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: tournament_players Player updates own or TD updates any; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Player updates own or TD updates any" ON public.tournament_players FOR UPDATE USING (((player_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_players.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: featured_bars Public can view active featured bars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active featured bars" ON public.featured_bars FOR SELECT USING ((is_active = true));


--
-- Name: featured_players Public can view active featured players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active featured players" ON public.featured_players FOR SELECT USING ((is_active = true));


--
-- Name: notification_messages Recipients can read notification messages they received; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Recipients can read notification messages they received" ON public.notification_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.notification_message_recipients
  WHERE ((notification_message_recipients.message_id = notification_messages.id) AND (notification_message_recipients.user_id = auth.uid())))));


--
-- Name: notification_messages Senders manage own notification messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Senders manage own notification messages" ON public.notification_messages TO authenticated USING ((sender_id = auth.uid())) WITH CHECK ((sender_id = auth.uid()));


--
-- Name: venue_staging Super admins can do everything on venue_staging; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can do everything on venue_staging" ON public.venue_staging TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: giveaways Super admins can insert giveaways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can insert giveaways" ON public.giveaways FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: featured_bars Super admins can manage featured bars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage featured bars" ON public.featured_bars TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: featured_players Super admins can manage featured players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage featured players" ON public.featured_players TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: giveaway_winner_history Super admins can manage winner history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage winner history" ON public.giveaway_winner_history TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: giveaways Super admins can read all giveaways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can read all giveaways" ON public.giveaways FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: bar_requests Super admins can update bar requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can update bar requests" ON public.bar_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: giveaways Super admins can update giveaways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can update giveaways" ON public.giveaways FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: bar_requests Super admins can view all bar requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can view all bar requests" ON public.bar_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: reassignment_logs Super admins can view all reassignment logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can view all reassignment logs" ON public.reassignment_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));


--
-- Name: alert_matches System can create alert matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can create alert matches" ON public.alert_matches FOR INSERT WITH CHECK (true);


--
-- Name: message_recipients System can insert message recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert message recipients" ON public.message_recipients FOR INSERT WITH CHECK (true);


--
-- Name: tournament_tables TD deletes tournament tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TD deletes tournament tables" ON public.tournament_tables FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_tables.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: tournament_tables TD inserts tournament tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TD inserts tournament tables" ON public.tournament_tables FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_tables.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: tournament_tables TD updates tournament tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TD updates tournament tables" ON public.tournament_tables FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_tables.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: push_tokens TDs and bar owners read recipient tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TDs and bar owners read recipient tokens" ON public.push_tokens FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: tournament_templates Tournament directors can insert their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tournament directors can insert their own templates" ON public.tournament_templates FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: tournament_templates Tournament directors can view their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tournament directors can view their own templates" ON public.tournament_templates FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: profiles Users can create own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: reports Users can create their own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own reports" ON public.reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_id));


--
-- Name: favorites Users can delete own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own favorites" ON public.favorites FOR DELETE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: saved_searches Users can delete own saved searches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own saved searches" ON public.saved_searches FOR DELETE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tournament_templates_user Users can delete own user templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own user templates" ON public.tournament_templates_user FOR DELETE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: alert_matches Users can delete their own alert matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own alert matches" ON public.alert_matches FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.search_alerts
  WHERE ((search_alerts.id = alert_matches.alert_id) AND (auth.uid() = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.id_auto = search_alerts.user_id)))))));


--
-- Name: app_events Users can insert own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own events" ON public.app_events FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL)));


--
-- Name: favorites Users can insert own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own favorites" ON public.favorites FOR INSERT WITH CHECK ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: giveaway_entries Users can insert own giveaway entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own giveaway entries" ON public.giveaway_entries FOR INSERT WITH CHECK ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: saved_searches Users can insert own saved searches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own saved searches" ON public.saved_searches FOR INSERT WITH CHECK ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: support_tickets Users can insert own support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own support tickets" ON public.support_tickets FOR INSERT WITH CHECK ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tournament_templates_user Users can insert own user templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own user templates" ON public.tournament_templates_user FOR INSERT WITH CHECK ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: search_alerts Users can manage their own search alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own search alerts" ON public.search_alerts USING ((auth.uid() = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.id_auto = search_alerts.user_id))));


--
-- Name: app_events Users can read own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own events" ON public.app_events FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notifications Users can read own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id IN ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: message_recipients Users can update own message recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own message recipients" ON public.message_recipients FOR UPDATE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id IN ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: saved_searches Users can update own saved searches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own saved searches" ON public.saved_searches FOR UPDATE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: support_tickets Users can update own support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own support tickets" ON public.support_tickets FOR UPDATE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tournament_templates_user Users can update own user templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own user templates" ON public.tournament_templates_user FOR UPDATE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: bar_requests Users can view own bar requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own bar requests" ON public.bar_requests FOR SELECT TO authenticated USING ((auth.uid() = submitted_by));


--
-- Name: giveaway_entries Users can view own entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own entries" ON public.giveaway_entries FOR SELECT TO authenticated USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: favorites Users can view own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own favorites" ON public.favorites FOR SELECT USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: giveaway_entries Users can view own giveaway entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own giveaway entries" ON public.giveaway_entries FOR SELECT USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: message_recipients Users can view own message recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own message recipients" ON public.message_recipients FOR SELECT USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: saved_searches Users can view own saved searches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own saved searches" ON public.saved_searches FOR SELECT USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: image_scan_logs Users can view own scan logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own scan logs" ON public.image_scan_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: support_tickets Users can view own support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own support tickets" ON public.support_tickets FOR SELECT USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tournament_templates_user Users can view own user templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own user templates" ON public.tournament_templates_user FOR SELECT USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: alert_matches Users can view their own alert matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own alert matches" ON public.alert_matches FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.search_alerts
  WHERE ((search_alerts.id = alert_matches.alert_id) AND (auth.uid() = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.id_auto = search_alerts.user_id)))))));


--
-- Name: reports Users can view their own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own reports" ON public.reports FOR SELECT TO authenticated USING ((auth.uid() = reporter_id));


--
-- Name: notification_preferences Users manage own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_tokens Users manage own push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own push tokens" ON public.push_tokens TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: message_rate_limits Users manage own rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own rate limits" ON public.message_rate_limits TO authenticated USING ((sender_id = auth.uid())) WITH CHECK ((sender_id = auth.uid()));


--
-- Name: notification_message_recipients Users read own notification deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own notification deliveries" ON public.notification_message_recipients FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notification_message_recipients Users update own notification deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notification deliveries" ON public.notification_message_recipients FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: venue_audits admins read all venue_audits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read all venue_audits" ON public.venue_audits FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['compete_admin'::text, 'super_admin'::text]))))));


--
-- Name: alert_matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alert_matches ENABLE ROW LEVEL SECURITY;

--
-- Name: app_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: bad_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bad_words ENABLE ROW LEVEL SECURITY;

--
-- Name: bar_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bar_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: chip_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chip_config ENABLE ROW LEVEL SECURITY;

--
-- Name: chip_config chip_config_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_config_read ON public.chip_config FOR SELECT USING (true);


--
-- Name: chip_config chip_config_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_config_write ON public.chip_config USING (public.is_chip_manager(tournament_id)) WITH CHECK (public.is_chip_manager(tournament_id));


--
-- Name: chip_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chip_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: chip_entries chip_entries_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_entries_read ON public.chip_entries FOR SELECT USING (true);


--
-- Name: chip_entries chip_entries_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_entries_write ON public.chip_entries USING (public.is_chip_manager(tournament_id)) WITH CHECK (public.is_chip_manager(tournament_id));


--
-- Name: chip_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chip_events ENABLE ROW LEVEL SECURITY;

--
-- Name: chip_events chip_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_events_read ON public.chip_events FOR SELECT USING (true);


--
-- Name: chip_events chip_events_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_events_write ON public.chip_events USING (public.is_chip_manager(tournament_id)) WITH CHECK (public.is_chip_manager(tournament_id));


--
-- Name: chip_matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chip_matches ENABLE ROW LEVEL SECURITY;

--
-- Name: chip_matches chip_matches_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_matches_read ON public.chip_matches FOR SELECT USING (true);


--
-- Name: chip_matches chip_matches_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_matches_write ON public.chip_matches USING (public.is_chip_manager(tournament_id)) WITH CHECK (public.is_chip_manager(tournament_id));


--
-- Name: chip_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chip_results ENABLE ROW LEVEL SECURITY;

--
-- Name: chip_results chip_results_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_results_read ON public.chip_results FOR SELECT USING (true);


--
-- Name: chip_results chip_results_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_results_write ON public.chip_results USING (public.is_chip_manager(tournament_id)) WITH CHECK (public.is_chip_manager(tournament_id));


--
-- Name: chip_tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chip_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: chip_tables chip_tables_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_tables_read ON public.chip_tables FOR SELECT USING (true);


--
-- Name: chip_tables chip_tables_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chip_tables_write ON public.chip_tables USING (public.is_chip_manager(tournament_id)) WITH CHECK (public.is_chip_manager(tournament_id));


--
-- Name: conversation_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations conversations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_insert ON public.conversations FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));


--
-- Name: conversations conversations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: conversations conversations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_update ON public.conversations FOR UPDATE TO authenticated USING ((created_by = auth.uid()));


--
-- Name: faqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: featured_bars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.featured_bars ENABLE ROW LEVEL SECURITY;

--
-- Name: featured_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.featured_players ENABLE ROW LEVEL SECURITY;

--
-- Name: giveaway_draws; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.giveaway_draws ENABLE ROW LEVEL SECURITY;

--
-- Name: giveaway_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.giveaway_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: giveaway_winner_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.giveaway_winner_history ENABLE ROW LEVEL SECURITY;

--
-- Name: giveaways; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;

--
-- Name: image_scan_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.image_scan_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: message_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: message_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_messages messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_insert ON public.conversation_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.conversation_participants
  WHERE ((conversation_participants.conversation_id = conversation_messages.conversation_id) AND (conversation_participants.user_id = auth.uid()))))));


--
-- Name: conversation_messages messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_select ON public.conversation_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.conversation_participants
  WHERE ((conversation_participants.conversation_id = conversation_messages.conversation_id) AND (conversation_participants.user_id = auth.uid())))));


--
-- Name: news_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_message_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_message_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_audits owners manage own venue_audits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owners manage own venue_audits" ON public.venue_audits TO authenticated USING ((owner_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((owner_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: conversation_participants participants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY participants_insert ON public.conversation_participants FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: conversation_participants participants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY participants_select ON public.conversation_participants FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));


--
-- Name: conversation_participants participants_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY participants_update ON public.conversation_participants FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: reassignment_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reassignment_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_searches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

--
-- Name: search_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_settings_templates settings templates delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "settings templates delete own" ON public.tournament_settings_templates FOR DELETE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tournament_settings_templates settings templates insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "settings templates insert own" ON public.tournament_settings_templates FOR INSERT WITH CHECK ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tournament_settings_templates settings templates select own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "settings templates select own" ON public.tournament_settings_templates FOR SELECT USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tournament_settings_templates settings templates update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "settings templates update own" ON public.tournament_settings_templates FOR UPDATE USING ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((user_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: sms_consent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_consent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_consent_events sms_consent_events_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_consent_events_select_own ON public.sms_consent_events FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: sms_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_messages sms_messages_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_messages_select_own ON public.sms_messages FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: sms_verification_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_verification_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_settings_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_settings_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_templates_user; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_templates_user ENABLE ROW LEVEL SECURITY;

--
-- Name: tournaments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_teams tt_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tt_read ON public.tournament_teams FOR SELECT USING (true);


--
-- Name: tournament_team_members ttm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ttm_read ON public.tournament_team_members FOR SELECT USING (((player_id = ( SELECT profiles.id_auto
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.tournament_teams t
  WHERE ((t.id = tournament_team_members.team_id) AND (t.captain_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM public.tournaments tt
  WHERE ((tt.id = tournament_team_members.tournament_id) AND ((tt.director_id = ( SELECT profiles.id_auto
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) OR (( SELECT profiles.role
           FROM public.profiles
          WHERE (profiles.id = auth.uid())) = ANY (ARRAY['compete_admin'::text, 'super_admin'::text]))))))));


--
-- Name: venue_audits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_audits ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_directors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_directors ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_owners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_owners ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_staging; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_staging ENABLE ROW LEVEL SECURITY;

--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION _recompute_team_status(p_team_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._recompute_team_status(p_team_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public._recompute_team_status(p_team_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public._recompute_team_status(p_team_id bigint) TO service_role;


--
-- Name: FUNCTION _team_caller(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._team_caller() FROM PUBLIC;
GRANT ALL ON FUNCTION public._team_caller() TO authenticated;
GRANT ALL ON FUNCTION public._team_caller() TO service_role;


--
-- Name: FUNCTION approve_registration_with_fargo(p_registration_id bigint, p_fargo integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_registration_with_fargo(p_registration_id bigint, p_fargo integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_registration_with_fargo(p_registration_id bigint, p_fargo integer) TO authenticated;
GRANT ALL ON FUNCTION public.approve_registration_with_fargo(p_registration_id bigint, p_fargo integer) TO service_role;


--
-- Name: FUNCTION bar_tournament_engagement(p_tournament_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bar_tournament_engagement(p_tournament_ids bigint[]) TO anon;
GRANT ALL ON FUNCTION public.bar_tournament_engagement(p_tournament_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.bar_tournament_engagement(p_tournament_ids bigint[]) TO service_role;


--
-- Name: FUNCTION bump_conversation_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_conversation_updated_at() TO anon;
GRANT ALL ON FUNCTION public.bump_conversation_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.bump_conversation_updated_at() TO service_role;


--
-- Name: FUNCTION cancel_team(p_team_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_team(p_team_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_team(p_team_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_team(p_team_id bigint) TO service_role;


--
-- Name: FUNCTION cancel_team_partner(p_team_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_team_partner(p_team_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_team_partner(p_team_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_team_partner(p_team_id bigint) TO service_role;


--
-- Name: FUNCTION claim_sms_send(p_idempotency_key text, p_user_id uuid, p_message_type text, p_to_e164 text, p_tournament_id bigint, p_match_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_sms_send(p_idempotency_key text, p_user_id uuid, p_message_type text, p_to_e164 text, p_tournament_id bigint, p_match_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_sms_send(p_idempotency_key text, p_user_id uuid, p_message_type text, p_to_e164 text, p_tournament_id bigint, p_match_id text) TO service_role;


--
-- Name: FUNCTION cleanup_old_alert_matches(days_to_keep integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_old_alert_matches(days_to_keep integer) TO anon;
GRANT ALL ON FUNCTION public.cleanup_old_alert_matches(days_to_keep integer) TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_old_alert_matches(days_to_keep integer) TO service_role;


--
-- Name: FUNCTION confirm_team_member_fargo(p_member_id bigint, p_fargo integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_team_member_fargo(p_member_id bigint, p_fargo integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_team_member_fargo(p_member_id bigint, p_fargo integer) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_team_member_fargo(p_member_id bigint, p_fargo integer) TO service_role;


--
-- Name: FUNCTION create_conversation_with_participants(p_created_by uuid, p_subject text, p_category text, p_tournament_id integer, p_is_support boolean, p_recipient_id uuid, p_first_message text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_conversation_with_participants(p_created_by uuid, p_subject text, p_category text, p_tournament_id integer, p_is_support boolean, p_recipient_id uuid, p_first_message text) TO anon;
GRANT ALL ON FUNCTION public.create_conversation_with_participants(p_created_by uuid, p_subject text, p_category text, p_tournament_id integer, p_is_support boolean, p_recipient_id uuid, p_first_message text) TO authenticated;
GRANT ALL ON FUNCTION public.create_conversation_with_participants(p_created_by uuid, p_subject text, p_category text, p_tournament_id integer, p_is_support boolean, p_recipient_id uuid, p_first_message text) TO service_role;


--
-- Name: FUNCTION create_notification_preferences(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_notification_preferences() TO anon;
GRANT ALL ON FUNCTION public.create_notification_preferences() TO authenticated;
GRANT ALL ON FUNCTION public.create_notification_preferences() TO service_role;


--
-- Name: FUNCTION create_team(p_tournament_id bigint, p_captain_fargo integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_team(p_tournament_id bigint, p_captain_fargo integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_team(p_tournament_id bigint, p_captain_fargo integer) TO authenticated;
GRANT ALL ON FUNCTION public.create_team(p_tournament_id bigint, p_captain_fargo integer) TO service_role;


--
-- Name: FUNCTION delete_user_account(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_user_account() TO anon;
GRANT ALL ON FUNCTION public.delete_user_account() TO authenticated;
GRANT ALL ON FUNCTION public.delete_user_account() TO service_role;


--
-- Name: FUNCTION disable_sms_alerts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.disable_sms_alerts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.disable_sms_alerts() TO authenticated;
GRANT ALL ON FUNCTION public.disable_sms_alerts() TO service_role;


--
-- Name: FUNCTION enable_sms_alerts(p_source text, p_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enable_sms_alerts(p_source text, p_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enable_sms_alerts(p_source text, p_version text) TO authenticated;
GRANT ALL ON FUNCTION public.enable_sms_alerts(p_source text, p_version text) TO service_role;


--
-- Name: FUNCTION generate_recurring_tournaments(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_recurring_tournaments() TO anon;
GRANT ALL ON FUNCTION public.generate_recurring_tournaments() TO authenticated;
GRANT ALL ON FUNCTION public.generate_recurring_tournaments() TO service_role;


--
-- Name: FUNCTION get_admin_id_autos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_admin_id_autos() TO anon;
GRANT ALL ON FUNCTION public.get_admin_id_autos() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_id_autos() TO service_role;


--
-- Name: FUNCTION get_admin_push_tokens(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_admin_push_tokens() TO anon;
GRANT ALL ON FUNCTION public.get_admin_push_tokens() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_push_tokens() TO service_role;


--
-- Name: FUNCTION get_auth_session(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_auth_session() TO anon;
GRANT ALL ON FUNCTION public.get_auth_session() TO authenticated;
GRANT ALL ON FUNCTION public.get_auth_session() TO service_role;


--
-- Name: FUNCTION get_avatar_url(user_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_avatar_url(user_id text) TO anon;
GRANT ALL ON FUNCTION public.get_avatar_url(user_id text) TO authenticated;
GRANT ALL ON FUNCTION public.get_avatar_url(user_id text) TO service_role;


--
-- Name: FUNCTION get_team_invite_by_token(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_team_invite_by_token(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_team_invite_by_token(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_team_invite_by_token(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.get_team_invite_by_token(p_token text) TO service_role;


--
-- Name: FUNCTION get_tournament_team_roster(p_tid bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_tournament_team_roster(p_tid bigint) TO anon;
GRANT ALL ON FUNCTION public.get_tournament_team_roster(p_tid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_tournament_team_roster(p_tid bigint) TO service_role;


--
-- Name: FUNCTION get_user_last_sign_in(user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_last_sign_in(user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_last_sign_in(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_last_sign_in(user_id uuid) TO service_role;


--
-- Name: FUNCTION hide_tournament_and_resolve_report(p_tournament_id bigint, p_report_id uuid, p_admin_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hide_tournament_and_resolve_report(p_tournament_id bigint, p_report_id uuid, p_admin_id uuid) TO anon;
GRANT ALL ON FUNCTION public.hide_tournament_and_resolve_report(p_tournament_id bigint, p_report_id uuid, p_admin_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.hide_tournament_and_resolve_report(p_tournament_id bigint, p_report_id uuid, p_admin_id uuid) TO service_role;


--
-- Name: FUNCTION invite_team_partner(p_team_id bigint, p_method text, p_value text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.invite_team_partner(p_team_id bigint, p_method text, p_value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invite_team_partner(p_team_id bigint, p_method text, p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.invite_team_partner(p_team_id bigint, p_method text, p_value text) TO service_role;


--
-- Name: FUNCTION is_chip_manager(p_tid bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_chip_manager(p_tid bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_chip_manager(p_tid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.is_chip_manager(p_tid bigint) TO service_role;


--
-- Name: FUNCTION is_venue_owner(p_venue_id integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_venue_owner(p_venue_id integer) TO anon;
GRANT ALL ON FUNCTION public.is_venue_owner(p_venue_id integer) TO authenticated;
GRANT ALL ON FUNCTION public.is_venue_owner(p_venue_id integer) TO service_role;


--
-- Name: FUNCTION join_team_by_token(p_token text, p_fargo integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_team_by_token(p_token text, p_fargo integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_team_by_token(p_token text, p_fargo integer) TO authenticated;
GRANT ALL ON FUNCTION public.join_team_by_token(p_token text, p_fargo integer) TO service_role;


--
-- Name: FUNCTION mark_phone_verified(p_user_id uuid, p_phone_e164 text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_phone_verified(p_user_id uuid, p_phone_e164 text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_phone_verified(p_user_id uuid, p_phone_e164 text) TO service_role;


--
-- Name: FUNCTION recover_stale_sms_send(p_older_than interval); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recover_stale_sms_send(p_older_than interval) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recover_stale_sms_send(p_older_than interval) TO service_role;


--
-- Name: FUNCTION reserve_sms_verification_attempt(p_user_id uuid, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_sms_verification_attempt(p_user_id uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_sms_verification_attempt(p_user_id uuid, p_action text) TO service_role;


--
-- Name: FUNCTION respond_to_team_invite(p_team_id bigint, p_accept boolean, p_fargo integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_to_team_invite(p_team_id bigint, p_accept boolean, p_fargo integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.respond_to_team_invite(p_team_id bigint, p_accept boolean, p_fargo integer) TO authenticated;
GRANT ALL ON FUNCTION public.respond_to_team_invite(p_team_id bigint, p_accept boolean, p_fargo integer) TO service_role;


--
-- Name: FUNCTION set_sms_phone(p_phone text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_sms_phone(p_phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_sms_phone(p_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.set_sms_phone(p_phone text) TO service_role;


--
-- Name: FUNCTION set_team_approved(p_team_id bigint, p_approved boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_team_approved(p_team_id bigint, p_approved boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_team_approved(p_team_id bigint, p_approved boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_team_approved(p_team_id bigint, p_approved boolean) TO service_role;


--
-- Name: FUNCTION set_team_checked_in(p_team_id bigint, p_checked_in boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_team_checked_in(p_team_id bigint, p_checked_in boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_team_checked_in(p_team_id bigint, p_checked_in boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_team_checked_in(p_team_id bigint, p_checked_in boolean) TO service_role;


--
-- Name: FUNCTION set_team_chips(p_team_id bigint, p_chips integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_team_chips(p_team_id bigint, p_chips integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_team_chips(p_team_id bigint, p_chips integer) TO authenticated;
GRANT ALL ON FUNCTION public.set_team_chips(p_team_id bigint, p_chips integer) TO service_role;


--
-- Name: FUNCTION set_team_paid(p_team_id bigint, p_paid boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_team_paid(p_team_id bigint, p_paid boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_team_paid(p_team_id bigint, p_paid boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_team_paid(p_team_id bigint, p_paid boolean) TO service_role;


--
-- Name: FUNCTION set_team_side_pots(p_team_id bigint, p_pots text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_team_side_pots(p_team_id bigint, p_pots text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_team_side_pots(p_team_id bigint, p_pots text[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_team_side_pots(p_team_id bigint, p_pots text[]) TO service_role;


--
-- Name: FUNCTION submit_match_state(p_tournament_id bigint, p_match_id text, p_patch jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_match_state(p_tournament_id bigint, p_match_id text, p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_match_state(p_tournament_id bigint, p_match_id text, p_patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submit_match_state(p_tournament_id bigint, p_match_id text, p_patch jsonb) TO service_role;


--
-- Name: FUNCTION sync_last_login_to_profile(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_last_login_to_profile() TO anon;
GRANT ALL ON FUNCTION public.sync_last_login_to_profile() TO authenticated;
GRANT ALL ON FUNCTION public.sync_last_login_to_profile() TO service_role;


--
-- Name: FUNCTION td_add_team_member(p_team_id bigint, p_player_id bigint, p_fargo integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.td_add_team_member(p_team_id bigint, p_player_id bigint, p_fargo integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.td_add_team_member(p_team_id bigint, p_player_id bigint, p_fargo integer) TO authenticated;
GRANT ALL ON FUNCTION public.td_add_team_member(p_team_id bigint, p_player_id bigint, p_fargo integer) TO service_role;


--
-- Name: FUNCTION td_create_team(p_tournament_id bigint, p_captain_player_id bigint, p_fargo integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.td_create_team(p_tournament_id bigint, p_captain_player_id bigint, p_fargo integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.td_create_team(p_tournament_id bigint, p_captain_player_id bigint, p_fargo integer) TO authenticated;
GRANT ALL ON FUNCTION public.td_create_team(p_tournament_id bigint, p_captain_player_id bigint, p_fargo integer) TO service_role;


--
-- Name: FUNCTION td_remove_team_member(p_member_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.td_remove_team_member(p_member_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.td_remove_team_member(p_member_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.td_remove_team_member(p_member_id bigint) TO service_role;


--
-- Name: FUNCTION tg_profiles_guard_phone(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_profiles_guard_phone() TO anon;
GRANT ALL ON FUNCTION public.tg_profiles_guard_phone() TO authenticated;
GRANT ALL ON FUNCTION public.tg_profiles_guard_phone() TO service_role;


--
-- Name: FUNCTION unlock_team(p_team_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unlock_team(p_team_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlock_team(p_team_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.unlock_team(p_team_id bigint) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION update_venue_staging_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_venue_staging_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_venue_staging_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_venue_staging_updated_at() TO service_role;


--
-- Name: TABLE alert_matches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.alert_matches TO anon;
GRANT ALL ON TABLE public.alert_matches TO authenticated;
GRANT ALL ON TABLE public.alert_matches TO service_role;


--
-- Name: SEQUENCE alert_matches_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.alert_matches_id_seq TO anon;
GRANT ALL ON SEQUENCE public.alert_matches_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.alert_matches_id_seq TO service_role;


--
-- Name: TABLE app_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_events TO anon;
GRANT ALL ON TABLE public.app_events TO authenticated;
GRANT ALL ON TABLE public.app_events TO service_role;


--
-- Name: SEQUENCE app_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.app_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.app_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.app_events_id_seq TO service_role;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_log TO anon;
GRANT ALL ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


--
-- Name: SEQUENCE audit_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;


--
-- Name: TABLE bad_words; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bad_words TO anon;
GRANT ALL ON TABLE public.bad_words TO authenticated;
GRANT ALL ON TABLE public.bad_words TO service_role;


--
-- Name: SEQUENCE bad_words_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.bad_words_id_seq TO anon;
GRANT ALL ON SEQUENCE public.bad_words_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.bad_words_id_seq TO service_role;


--
-- Name: TABLE bar_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bar_requests TO anon;
GRANT ALL ON TABLE public.bar_requests TO authenticated;
GRANT ALL ON TABLE public.bar_requests TO service_role;


--
-- Name: SEQUENCE bar_requests_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.bar_requests_id_seq TO anon;
GRANT ALL ON SEQUENCE public.bar_requests_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.bar_requests_id_seq TO service_role;


--
-- Name: TABLE billing_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_plans TO anon;
GRANT ALL ON TABLE public.billing_plans TO authenticated;
GRANT ALL ON TABLE public.billing_plans TO service_role;


--
-- Name: TABLE chip_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chip_config TO anon;
GRANT ALL ON TABLE public.chip_config TO authenticated;
GRANT ALL ON TABLE public.chip_config TO service_role;


--
-- Name: TABLE chip_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chip_entries TO anon;
GRANT ALL ON TABLE public.chip_entries TO authenticated;
GRANT ALL ON TABLE public.chip_entries TO service_role;


--
-- Name: TABLE chip_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chip_events TO anon;
GRANT ALL ON TABLE public.chip_events TO authenticated;
GRANT ALL ON TABLE public.chip_events TO service_role;


--
-- Name: TABLE chip_matches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chip_matches TO anon;
GRANT ALL ON TABLE public.chip_matches TO authenticated;
GRANT ALL ON TABLE public.chip_matches TO service_role;


--
-- Name: TABLE chip_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chip_results TO anon;
GRANT ALL ON TABLE public.chip_results TO authenticated;
GRANT ALL ON TABLE public.chip_results TO service_role;


--
-- Name: SEQUENCE chip_results_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.chip_results_id_seq TO anon;
GRANT ALL ON SEQUENCE public.chip_results_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.chip_results_id_seq TO service_role;


--
-- Name: TABLE chip_tables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chip_tables TO anon;
GRANT ALL ON TABLE public.chip_tables TO authenticated;
GRANT ALL ON TABLE public.chip_tables TO service_role;


--
-- Name: TABLE conversation_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_messages TO anon;
GRANT ALL ON TABLE public.conversation_messages TO authenticated;
GRANT ALL ON TABLE public.conversation_messages TO service_role;


--
-- Name: TABLE conversation_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_participants TO anon;
GRANT ALL ON TABLE public.conversation_participants TO authenticated;
GRANT ALL ON TABLE public.conversation_participants TO service_role;


--
-- Name: TABLE conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversations TO anon;
GRANT ALL ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;


--
-- Name: TABLE faqs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faqs TO anon;
GRANT ALL ON TABLE public.faqs TO authenticated;
GRANT ALL ON TABLE public.faqs TO service_role;


--
-- Name: SEQUENCE faqs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.faqs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.faqs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.faqs_id_seq TO service_role;


--
-- Name: TABLE favorites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.favorites TO anon;
GRANT ALL ON TABLE public.favorites TO authenticated;
GRANT ALL ON TABLE public.favorites TO service_role;


--
-- Name: SEQUENCE favorites_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.favorites_id_seq TO anon;
GRANT ALL ON SEQUENCE public.favorites_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.favorites_id_seq TO service_role;


--
-- Name: TABLE featured_bars; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.featured_bars TO anon;
GRANT ALL ON TABLE public.featured_bars TO authenticated;
GRANT ALL ON TABLE public.featured_bars TO service_role;


--
-- Name: SEQUENCE featured_bars_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.featured_bars_id_seq TO anon;
GRANT ALL ON SEQUENCE public.featured_bars_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.featured_bars_id_seq TO service_role;


--
-- Name: TABLE featured_players; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.featured_players TO anon;
GRANT ALL ON TABLE public.featured_players TO authenticated;
GRANT ALL ON TABLE public.featured_players TO service_role;


--
-- Name: SEQUENCE featured_players_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.featured_players_id_seq TO anon;
GRANT ALL ON SEQUENCE public.featured_players_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.featured_players_id_seq TO service_role;


--
-- Name: TABLE giveaway_draws; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.giveaway_draws TO anon;
GRANT ALL ON TABLE public.giveaway_draws TO authenticated;
GRANT ALL ON TABLE public.giveaway_draws TO service_role;


--
-- Name: SEQUENCE giveaway_draws_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.giveaway_draws_id_seq TO anon;
GRANT ALL ON SEQUENCE public.giveaway_draws_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.giveaway_draws_id_seq TO service_role;


--
-- Name: TABLE giveaway_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.giveaway_entries TO anon;
GRANT ALL ON TABLE public.giveaway_entries TO authenticated;
GRANT ALL ON TABLE public.giveaway_entries TO service_role;


--
-- Name: SEQUENCE giveaway_entries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.giveaway_entries_id_seq TO anon;
GRANT ALL ON SEQUENCE public.giveaway_entries_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.giveaway_entries_id_seq TO service_role;


--
-- Name: TABLE giveaway_winner_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.giveaway_winner_history TO anon;
GRANT ALL ON TABLE public.giveaway_winner_history TO authenticated;
GRANT ALL ON TABLE public.giveaway_winner_history TO service_role;


--
-- Name: SEQUENCE giveaway_winner_history_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.giveaway_winner_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.giveaway_winner_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.giveaway_winner_history_id_seq TO service_role;


--
-- Name: TABLE giveaways; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.giveaways TO anon;
GRANT ALL ON TABLE public.giveaways TO authenticated;
GRANT ALL ON TABLE public.giveaways TO service_role;


--
-- Name: SEQUENCE giveaways_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.giveaways_id_seq TO anon;
GRANT ALL ON SEQUENCE public.giveaways_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.giveaways_id_seq TO service_role;


--
-- Name: TABLE image_scan_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.image_scan_logs TO anon;
GRANT ALL ON TABLE public.image_scan_logs TO authenticated;
GRANT ALL ON TABLE public.image_scan_logs TO service_role;


--
-- Name: SEQUENCE image_scan_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.image_scan_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.image_scan_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.image_scan_logs_id_seq TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE message_rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_rate_limits TO anon;
GRANT ALL ON TABLE public.message_rate_limits TO authenticated;
GRANT ALL ON TABLE public.message_rate_limits TO service_role;


--
-- Name: TABLE message_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_recipients TO anon;
GRANT ALL ON TABLE public.message_recipients TO authenticated;
GRANT ALL ON TABLE public.message_recipients TO service_role;


--
-- Name: SEQUENCE message_recipients_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.message_recipients_id_seq TO anon;
GRANT ALL ON SEQUENCE public.message_recipients_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.message_recipients_id_seq TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: SEQUENCE messages_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.messages_id_seq TO anon;
GRANT ALL ON SEQUENCE public.messages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.messages_id_seq TO service_role;


--
-- Name: TABLE news_articles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.news_articles TO anon;
GRANT ALL ON TABLE public.news_articles TO authenticated;
GRANT ALL ON TABLE public.news_articles TO service_role;


--
-- Name: SEQUENCE news_articles_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.news_articles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.news_articles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.news_articles_id_seq TO service_role;


--
-- Name: TABLE notification_message_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_message_recipients TO anon;
GRANT ALL ON TABLE public.notification_message_recipients TO authenticated;
GRANT ALL ON TABLE public.notification_message_recipients TO service_role;


--
-- Name: TABLE notification_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_messages TO anon;
GRANT ALL ON TABLE public.notification_messages TO authenticated;
GRANT ALL ON TABLE public.notification_messages TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_preferences TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: COLUMN notification_preferences.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(user_id) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.tournament_updates; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(tournament_updates) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.venue_promotions; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(venue_promotions) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.app_announcements; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(app_announcements) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.search_alert_matches; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(search_alert_matches) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.giveaway_updates; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(giveaway_updates) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.quiet_hours_start; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(quiet_hours_start) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.quiet_hours_end; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(quiet_hours_end) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.sms_match_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(sms_match_alerts) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.sms_weekly_report; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(sms_weekly_report) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: COLUMN notification_preferences.sms_tournament_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(sms_tournament_reminders) ON TABLE public.notification_preferences TO authenticated;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: SEQUENCE notifications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.notifications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO service_role;


--
-- Name: TABLE payment_methods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payment_methods TO anon;
GRANT ALL ON TABLE public.payment_methods TO authenticated;
GRANT ALL ON TABLE public.payment_methods TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: SEQUENCE profiles_id_auto_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.profiles_id_auto_seq TO anon;
GRANT ALL ON SEQUENCE public.profiles_id_auto_seq TO authenticated;
GRANT ALL ON SEQUENCE public.profiles_id_auto_seq TO service_role;


--
-- Name: TABLE push_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_tokens TO anon;
GRANT ALL ON TABLE public.push_tokens TO authenticated;
GRANT ALL ON TABLE public.push_tokens TO service_role;


--
-- Name: TABLE reassignment_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reassignment_logs TO anon;
GRANT ALL ON TABLE public.reassignment_logs TO authenticated;
GRANT ALL ON TABLE public.reassignment_logs TO service_role;


--
-- Name: SEQUENCE reassignment_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.reassignment_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.reassignment_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.reassignment_logs_id_seq TO service_role;


--
-- Name: TABLE reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reports TO anon;
GRANT ALL ON TABLE public.reports TO authenticated;
GRANT ALL ON TABLE public.reports TO service_role;


--
-- Name: TABLE saved_searches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.saved_searches TO anon;
GRANT ALL ON TABLE public.saved_searches TO authenticated;
GRANT ALL ON TABLE public.saved_searches TO service_role;


--
-- Name: SEQUENCE saved_searches_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.saved_searches_id_seq TO anon;
GRANT ALL ON SEQUENCE public.saved_searches_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.saved_searches_id_seq TO service_role;


--
-- Name: TABLE search_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.search_alerts TO anon;
GRANT ALL ON TABLE public.search_alerts TO authenticated;
GRANT ALL ON TABLE public.search_alerts TO service_role;


--
-- Name: SEQUENCE search_alerts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.search_alerts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.search_alerts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.search_alerts_id_seq TO service_role;


--
-- Name: TABLE sms_consent_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sms_consent_events TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sms_consent_events TO authenticated;
GRANT ALL ON TABLE public.sms_consent_events TO service_role;


--
-- Name: SEQUENCE sms_consent_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.sms_consent_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sms_consent_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sms_consent_events_id_seq TO service_role;


--
-- Name: TABLE sms_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sms_messages TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sms_messages TO authenticated;
GRANT ALL ON TABLE public.sms_messages TO service_role;


--
-- Name: SEQUENCE sms_messages_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.sms_messages_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sms_messages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sms_messages_id_seq TO service_role;


--
-- Name: TABLE sms_verification_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sms_verification_attempts TO service_role;


--
-- Name: SEQUENCE sms_verification_attempts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.sms_verification_attempts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sms_verification_attempts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sms_verification_attempts_id_seq TO service_role;


--
-- Name: TABLE support_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_tickets TO anon;
GRANT ALL ON TABLE public.support_tickets TO authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;


--
-- Name: SEQUENCE support_tickets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.support_tickets_id_seq TO anon;
GRANT ALL ON SEQUENCE public.support_tickets_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.support_tickets_id_seq TO service_role;


--
-- Name: TABLE tournament_analytics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_analytics TO anon;
GRANT ALL ON TABLE public.tournament_analytics TO authenticated;
GRANT ALL ON TABLE public.tournament_analytics TO service_role;


--
-- Name: SEQUENCE tournament_analytics_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournament_analytics_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournament_analytics_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournament_analytics_id_seq TO service_role;


--
-- Name: TABLE tournament_players; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_players TO anon;
GRANT ALL ON TABLE public.tournament_players TO authenticated;
GRANT ALL ON TABLE public.tournament_players TO service_role;


--
-- Name: SEQUENCE tournament_players_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournament_players_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournament_players_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournament_players_id_seq TO service_role;


--
-- Name: TABLE tournament_settings_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_settings_templates TO anon;
GRANT ALL ON TABLE public.tournament_settings_templates TO authenticated;
GRANT ALL ON TABLE public.tournament_settings_templates TO service_role;


--
-- Name: SEQUENCE tournament_settings_templates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournament_settings_templates_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournament_settings_templates_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournament_settings_templates_id_seq TO service_role;


--
-- Name: TABLE tournament_tables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_tables TO anon;
GRANT ALL ON TABLE public.tournament_tables TO authenticated;
GRANT ALL ON TABLE public.tournament_tables TO service_role;


--
-- Name: SEQUENCE tournament_tables_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournament_tables_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournament_tables_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournament_tables_id_seq TO service_role;


--
-- Name: TABLE tournament_team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_team_members TO anon;
GRANT ALL ON TABLE public.tournament_team_members TO authenticated;
GRANT ALL ON TABLE public.tournament_team_members TO service_role;


--
-- Name: SEQUENCE tournament_team_members_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournament_team_members_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournament_team_members_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournament_team_members_id_seq TO service_role;


--
-- Name: TABLE tournament_teams; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_teams TO anon;
GRANT ALL ON TABLE public.tournament_teams TO authenticated;
GRANT ALL ON TABLE public.tournament_teams TO service_role;


--
-- Name: SEQUENCE tournament_teams_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournament_teams_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournament_teams_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournament_teams_id_seq TO service_role;


--
-- Name: TABLE tournament_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_templates TO anon;
GRANT ALL ON TABLE public.tournament_templates TO authenticated;
GRANT ALL ON TABLE public.tournament_templates TO service_role;


--
-- Name: SEQUENCE tournament_templates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournament_templates_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournament_templates_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournament_templates_id_seq TO service_role;


--
-- Name: TABLE tournament_templates_user; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_templates_user TO anon;
GRANT ALL ON TABLE public.tournament_templates_user TO authenticated;
GRANT ALL ON TABLE public.tournament_templates_user TO service_role;


--
-- Name: SEQUENCE tournament_templates_user_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournament_templates_user_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournament_templates_user_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournament_templates_user_id_seq TO service_role;


--
-- Name: TABLE tournaments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournaments TO anon;
GRANT ALL ON TABLE public.tournaments TO authenticated;
GRANT ALL ON TABLE public.tournaments TO service_role;


--
-- Name: SEQUENCE tournaments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournaments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournaments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournaments_id_seq TO service_role;


--
-- Name: TABLE venue_audits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_audits TO anon;
GRANT ALL ON TABLE public.venue_audits TO authenticated;
GRANT ALL ON TABLE public.venue_audits TO service_role;


--
-- Name: SEQUENCE venue_audits_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.venue_audits_id_seq TO anon;
GRANT ALL ON SEQUENCE public.venue_audits_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.venue_audits_id_seq TO service_role;


--
-- Name: TABLE venue_directors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_directors TO anon;
GRANT ALL ON TABLE public.venue_directors TO authenticated;
GRANT ALL ON TABLE public.venue_directors TO service_role;


--
-- Name: SEQUENCE venue_directors_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.venue_directors_id_seq TO anon;
GRANT ALL ON SEQUENCE public.venue_directors_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.venue_directors_id_seq TO service_role;


--
-- Name: TABLE venue_owners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_owners TO anon;
GRANT ALL ON TABLE public.venue_owners TO authenticated;
GRANT ALL ON TABLE public.venue_owners TO service_role;


--
-- Name: SEQUENCE venue_owners_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.venue_owners_id_seq TO anon;
GRANT ALL ON SEQUENCE public.venue_owners_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.venue_owners_id_seq TO service_role;


--
-- Name: TABLE venue_staging; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_staging TO anon;
GRANT ALL ON TABLE public.venue_staging TO authenticated;
GRANT ALL ON TABLE public.venue_staging TO service_role;


--
-- Name: SEQUENCE venue_staging_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.venue_staging_id_seq TO anon;
GRANT ALL ON SEQUENCE public.venue_staging_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.venue_staging_id_seq TO service_role;


--
-- Name: TABLE venue_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_subscriptions TO anon;
GRANT ALL ON TABLE public.venue_subscriptions TO authenticated;
GRANT ALL ON TABLE public.venue_subscriptions TO service_role;


--
-- Name: TABLE venue_tables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_tables TO anon;
GRANT ALL ON TABLE public.venue_tables TO authenticated;
GRANT ALL ON TABLE public.venue_tables TO service_role;


--
-- Name: SEQUENCE venue_tables_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.venue_tables_id_seq TO anon;
GRANT ALL ON SEQUENCE public.venue_tables_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.venue_tables_id_seq TO service_role;


--
-- Name: TABLE venues; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venues TO anon;
GRANT ALL ON TABLE public.venues TO authenticated;
GRANT ALL ON TABLE public.venues TO service_role;


--
-- Name: SEQUENCE venues_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.venues_id_seq TO anon;
GRANT ALL ON SEQUENCE public.venues_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.venues_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

