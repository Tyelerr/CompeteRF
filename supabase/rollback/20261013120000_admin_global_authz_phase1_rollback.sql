-- Rollback for supabase/pending/20261013120000_admin_global_authz_phase1.sql
-- Restores the EXACT prod state captured 2026-09-29 (policies, RLS flags, grants, and the live
-- delete_user_account definition). NOTE: this re-opens the billing tables (RLS off, full
-- anon/authenticated grants) exactly as they were — only use it to undo a broken deploy.

drop policy if exists "Venue owners and admins can update venues" on public.venues;
drop policy if exists "Directors and admins can update templates" on public.tournament_templates;
drop policy if exists "Venue owners and admins can read subscriptions" on public.venue_subscriptions;
drop policy if exists "Venue owners and admins can read invoices" on public.invoices;
drop policy if exists "Venue owners and admins can read payment methods" on public.payment_methods;
drop policy if exists "Admins can read all billing plans" on public.billing_plans;

-- policies that the migration dropped (verbatim from prod)
create policy "Bar owners can update their venues" on public.venues as permissive for UPDATE to authenticated using ((id IN ( SELECT venue_owners.venue_id
   FROM venue_owners
  WHERE (venue_owners.owner_id = ( SELECT profiles.id_auto
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
create policy "Directors can update own templates" on public.tournament_templates as permissive for UPDATE to public using ((director_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
create policy "Bar owner can read own venue subscriptions" on public.venue_subscriptions as permissive for SELECT to authenticated using ((venue_id IN ( SELECT vo.venue_id
   FROM (venue_owners vo
     JOIN profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));
create policy "Bar owner can read own venue invoices" on public.invoices as permissive for SELECT to authenticated using ((venue_id IN ( SELECT vo.venue_id
   FROM (venue_owners vo
     JOIN profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));
create policy "Bar owner can read own venue payment methods" on public.payment_methods as permissive for SELECT to authenticated using ((venue_id IN ( SELECT vo.venue_id
   FROM (venue_owners vo
     JOIN profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));

alter table public.venue_subscriptions disable row level security;
alter table public.invoices            disable row level security;
alter table public.payment_methods     disable row level security;
alter table public.billing_plans       disable row level security;
grant all on public.venue_subscriptions, public.invoices, public.payment_methods, public.billing_plans to anon, authenticated;

-- venues INSERT (verbatim prod)
drop policy if exists "Admins can insert venues" on public.venues;
create policy "Bar owners can insert venues" on public.venues as permissive for INSERT to authenticated with check (true);

-- venue_tables (verbatim prod: RLS off, four open policies, full grants)
drop policy if exists "Anyone can view venue_tables" on public.venue_tables;
drop policy if exists "Venue owners and admins can insert venue_tables" on public.venue_tables;
drop policy if exists "Venue owners and admins can update venue_tables" on public.venue_tables;
drop policy if exists "Venue owners and admins can delete venue_tables" on public.venue_tables;
create policy "Bar owners can delete venue_tables" on public.venue_tables as permissive for DELETE to authenticated using (true);
create policy "Bar owners can insert venue_tables" on public.venue_tables as permissive for INSERT to authenticated with check (true);
create policy "Bar owners can update venue_tables" on public.venue_tables as permissive for UPDATE to authenticated using (true);
create policy "Bar owners can view venue_tables" on public.venue_tables as permissive for SELECT to authenticated using (true);
alter table public.venue_tables disable row level security;
grant all on public.venue_tables to anon, authenticated;

-- create_venue / search_users_for_staff: previous signatures + bodies (verbatim), previous grants
drop function if exists public.create_venue(jsonb, bigint[], bigint);
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
grant execute on function public.create_venue(jsonb, bigint[]) to authenticated, service_role;
drop function if exists public.search_users_for_staff(text, integer, boolean);
CREATE OR REPLACE FUNCTION public.search_users_for_staff(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, id_auto bigint, user_name text, name text, role text, email_display text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_admin boolean;
  v_q text := trim(coalesce(p_query, ''));
  v_pat text;
begin
  select pr.role into v_role from public.profiles pr where pr.id = auth.uid();
  if v_role is null or v_role not in ('tournament_director', 'bar_owner', 'compete_admin', 'super_admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_admin := v_role in ('compete_admin', 'super_admin');
  if length(v_q) < 2 then
    return;
  end if;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.id_auto, p.user_name, p.name, p.role,
           case when v_admin then p.email else public._mask_email(p.email) end
      from public.profiles p
     where p.status = 'active'
       and (p.user_name ilike v_pat or p.name ilike v_pat
            -- admins: partial email search; TDs / bar owners: exact email only (no enumeration)
            or (v_admin and p.email ilike v_pat)
            or (not v_admin and lower(p.email) = lower(v_q)))
     order by p.name nulls last, p.user_name
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$function$;
revoke all on function public.search_users_for_staff(text, integer) from public, anon;
grant execute on function public.search_users_for_staff(text, integer) to authenticated, service_role;

-- delete_user_account: live prod definition before this migration
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
$function$
;
