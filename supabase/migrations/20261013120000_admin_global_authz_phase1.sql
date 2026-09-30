-- 20261013120000_admin_global_authz_phase1.sql  — MIGRATION A (admin + general data security)
-- Super-admin architecture Phase 1 + 2 (server side). Independent of the parked Stripe feature
-- work ("Migration B" = the Stripe Edge Functions only; it has no SQL and needs nothing here).
--
-- Rule: role in (compete_admin, super_admin) → global platform authorization via the ONE
-- authoritative helper public._authz_is_admin(). Venue / tournament relationship tables stay
-- real business relationships only — an admin never has to be inserted as owner/director.
--
--   1. venues UPDATE                       owner-only            → admin OR active venue owner
--   2. tournament_templates UPDATE         template director     → admin OR template director
--   3. venue_subscriptions / invoices /    RLS was DISABLED with full anon+authenticated
--      payment_methods / billing_plans     grants (world read/write) → RLS on; read = admin OR
--                                          active venue owner (plans: active plans / admins);
--                                          no client writes (Edge Functions + webhook use the
--                                          service role, which bypasses RLS)
--   4. delete_user_account                 admins and accounts that own/direct operational
--                                          records are refused; the venue / tournament /
--                                          template / giveaway cascades are removed
--   5. venues INSERT                       WITH CHECK (true) for any signed-in user → admins
--                                          only (owners create venues via the create_venue RPC)
--   6. venue_tables                        RLS was DISABLED with full anon grants → RLS on;
--                                          public read kept; writes = admin OR active venue owner
--   7. create_venue                        bar-owner caller still becomes primary owner; an ADMIN
--                                          caller no longer becomes owner — optional explicit
--                                          p_owner_id, else the venue is ownerless
--   8. search_users_for_staff              admin accounts excluded from staff/director candidate
--                                          search by default (explicit p_include_admins, admins only)
--
-- Additive for legitimate users: owners keep their venues/billing, directors their templates.
-- Rollback: supabase/rollback/20261013120000_admin_global_authz_phase1_rollback.sql
-- Parked in supabase/pending/ until reviewed (so `db push` cannot apply it early).

-- ── 1. venues UPDATE: admin OR legitimate (active) venue owner ─────────────────────────────
drop policy if exists "Bar owners can update their venues" on public.venues;
create policy "Venue owners and admins can update venues" on public.venues
  as permissive for update to authenticated
  using (public._authz_is_admin() or public.is_venue_owner(id))
  with check (public._authz_is_admin() or public.is_venue_owner(id));

-- ── 2. tournament_templates UPDATE: admin OR the template's director ──────────────────────
-- (tournament_templates_guard_venue_director still governs venue/director changes by non-admins)
drop policy if exists "Directors can update own templates" on public.tournament_templates;
create policy "Directors and admins can update templates" on public.tournament_templates
  as permissive for update to authenticated
  using (public._authz_is_admin() or director_id = public._authz_my_id_auto())
  with check (public._authz_is_admin() or director_id = public._authz_my_id_auto());

-- ── 3. Billing tables: RLS on; admin OR active venue owner may read; nobody writes from clients ─
alter table public.venue_subscriptions enable row level security;
alter table public.invoices            enable row level security;
alter table public.payment_methods     enable row level security;
alter table public.billing_plans       enable row level security;

drop policy if exists "Bar owner can read own venue subscriptions" on public.venue_subscriptions;
create policy "Venue owners and admins can read subscriptions" on public.venue_subscriptions
  as permissive for select to authenticated
  using (public._authz_is_admin() or public.is_venue_owner(venue_id));

drop policy if exists "Bar owner can read own venue invoices" on public.invoices;
create policy "Venue owners and admins can read invoices" on public.invoices
  as permissive for select to authenticated
  using (public._authz_is_admin() or public.is_venue_owner(venue_id));

drop policy if exists "Bar owner can read own venue payment methods" on public.payment_methods;
create policy "Venue owners and admins can read payment methods" on public.payment_methods
  as permissive for select to authenticated
  using (public._authz_is_admin() or public.is_venue_owner(venue_id));

-- plans: the existing "Authenticated users can read active billing plans" stays; admins see all.
create policy "Admins can read all billing plans" on public.billing_plans
  as permissive for select to authenticated
  using (public._authz_is_admin());

-- Defense in depth: no client role may write billing data (TRUNCATE is not covered by RLS).
revoke all on public.venue_subscriptions, public.invoices, public.payment_methods, public.billing_plans from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.venue_subscriptions, public.invoices, public.payment_methods, public.billing_plans
  from authenticated;

-- ── 4. delete_user_account: refuse protected accounts; never cascade shared data ───────────
-- Admins (compete_admin / super_admin) and any account that directs tournaments or templates,
-- actively owns a venue, or created / drew giveaways are refused with one message. The old
-- bar-owner venue cascade and director tournament/template/giveaway deletes are removed (they
-- can no longer be reached, and must never run again). Nothing is silently reassigned.
-- Personal-data cleanup and history de-identification are unchanged.
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

  -- ── Protected accounts: refuse, never cascade, never reassign ─────────────────────────
  -- Admin / house accounts and any account that owns or directs operational records must be
  -- transferred or removed by another administrator. Self-service deletion never deletes
  -- tournaments, templates, venues or giveaways, and never silently reassigns them.
  IF v_role IN ('compete_admin', 'super_admin') THEN
    RAISE EXCEPTION 'This account must be transferred or removed by another administrator.'
      USING ERRCODE = 'P0001', DETAIL = 'admin_account';
  END IF;

  IF EXISTS (SELECT 1 FROM tournaments WHERE director_id = v_id_auto)
     OR EXISTS (SELECT 1 FROM tournament_templates WHERE director_id = v_id_auto)
     OR EXISTS (SELECT 1 FROM venue_owners WHERE owner_id = v_id_auto AND archived_at IS NULL)
     OR EXISTS (SELECT 1 FROM giveaways WHERE created_by = v_id_auto OR winner_drawn_by = v_id_auto)
     OR EXISTS (SELECT 1 FROM giveaway_draws WHERE drawn_by = v_id_auto)
     OR EXISTS (SELECT 1 FROM giveaway_winner_history WHERE drawn_by = v_id_auto)
  THEN
    RAISE EXCEPTION 'This account must be transferred or removed by another administrator.'
      USING ERRCODE = 'P0001', DETAIL = 'owns_operational_records';
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

  -- Giveaway draws this user won (NOT NULL col). Draws they performed are guarded above.
  DELETE FROM giveaway_draws WHERE winner_id = v_id_auto;
  UPDATE giveaway_draws SET invalidated_by = NULL WHERE invalidated_by = v_id_auto;

  UPDATE giveaway_winner_history SET disqualified_by = NULL WHERE disqualified_by = v_id_auto;

  -- Giveaways where this user won (nullable)
  UPDATE giveaways SET winner_id = NULL WHERE winner_id = v_id_auto;

  -- Support tickets (nullable)
  UPDATE support_tickets SET resolved_by = NULL WHERE resolved_by = v_id_auto;
  UPDATE support_tickets SET assigned_to = NULL WHERE assigned_to = v_id_auto;

  UPDATE tournaments SET archived_by = NULL WHERE archived_by = v_id_auto;
  UPDATE tournaments SET cancelled_by = NULL WHERE cancelled_by = v_id_auto;

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

-- ── 5. venues INSERT: admins only ──────────────────────────────────────────────────────────
-- The authoritative creation path is the create_venue RPC (SECURITY DEFINER; bar_owner / admin
-- only; atomically creates the venue + primary owner), which does not need this policy. The old
-- WITH CHECK (true) let ANY signed-in user insert arbitrary venues directly.
drop policy if exists "Bar owners can insert venues" on public.venues;
create policy "Admins can insert venues" on public.venues
  as permissive for insert to authenticated
  with check (public._authz_is_admin());

-- ── 6. venue_tables: RLS on; public read; writes = admin OR active venue owner ───────────────
-- Writers in the app: owner venue screens (create-venue, edit-venue, VenueWorkspace, venue audit)
-- and admin venue management. Readers: public venue detail / search (anon on web included).
alter table public.venue_tables enable row level security;
drop policy if exists "Bar owners can view venue_tables" on public.venue_tables;
drop policy if exists "Bar owners can insert venue_tables" on public.venue_tables;
drop policy if exists "Bar owners can update venue_tables" on public.venue_tables;
drop policy if exists "Bar owners can delete venue_tables" on public.venue_tables;
create policy "Anyone can view venue_tables" on public.venue_tables
  as permissive for select to anon, authenticated
  using (true);
create policy "Venue owners and admins can insert venue_tables" on public.venue_tables
  as permissive for insert to authenticated
  with check (public._authz_is_admin() or public.is_venue_owner(venue_id));
create policy "Venue owners and admins can update venue_tables" on public.venue_tables
  as permissive for update to authenticated
  using (public._authz_is_admin() or public.is_venue_owner(venue_id))
  with check (public._authz_is_admin() or public.is_venue_owner(venue_id));
create policy "Venue owners and admins can delete venue_tables" on public.venue_tables
  as permissive for delete to authenticated
  using (public._authz_is_admin() or public.is_venue_owner(venue_id));
revoke insert, update, delete, truncate, references, trigger on public.venue_tables from anon;
revoke truncate, references, trigger on public.venue_tables from authenticated;

-- ── 7. create_venue: an admin caller no longer becomes the venue's owner ───────────────────
-- Bar-owner caller: unchanged — they become the primary owner (p_owner_id must be empty or
-- themselves). Admin caller: owner ONLY if p_owner_id is given (a real, explicitly chosen
-- person); otherwise the venue is created ownerless (as most prod venues are). Directors: as
-- before. Backward compatible: the 2-argument call (existing app builds) keeps working.
drop function if exists public.create_venue(jsonb, bigint[]);
create or replace function public.create_venue(
  p_venue jsonb, p_director_ids bigint[] default '{}', p_owner_id bigint default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me       bigint;
  v_role     text;
  v_is_admin boolean;
  v_owner    bigint;
  v_venue    integer;
  v_dir      bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select id_auto, role into v_me, v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('bar_owner', 'compete_admin', 'super_admin') then
    raise exception 'Only bar owners and admins can create venues' using errcode = '42501';
  end if;
  v_is_admin := v_role in ('compete_admin', 'super_admin');

  if coalesce(btrim(p_venue->>'venue'), '') = '' or coalesce(btrim(p_venue->>'address'), '') = ''
     or coalesce(btrim(p_venue->>'city'), '') = '' or coalesce(btrim(p_venue->>'state'), '') = ''
     or coalesce(btrim(p_venue->>'zip_code'), '') = '' then
    raise exception 'Venue name, address, city, state and ZIP code are required' using errcode = '22023';
  end if;

  if v_is_admin then
    v_owner := p_owner_id;  -- explicit choice only; never the admin by default
    if v_owner is not null and not exists (
      select 1 from public.profiles where id_auto = v_owner and coalesce(status, 'active') = 'active'
    ) then
      raise exception 'Owner % not found', v_owner using errcode = 'P0002';
    end if;
  else
    if p_owner_id is not null and p_owner_id <> v_me then
      raise exception 'Bar owners can only create venues they own' using errcode = '42501';
    end if;
    v_owner := v_me;
  end if;

  insert into public.venues (venue, address, city, state, zip_code, phone, google_place_id, latitude, longitude, status)
  values (
    p_venue->>'venue', p_venue->>'address', p_venue->>'city', p_venue->>'state', p_venue->>'zip_code',
    nullif(p_venue->>'phone', ''), nullif(p_venue->>'google_place_id', ''),
    nullif(p_venue->>'latitude', '')::numeric, nullif(p_venue->>'longitude', '')::numeric,
    'active')
  returning id into v_venue;

  if v_owner is not null then
    insert into public.venue_owners (venue_id, owner_id, assigned_by, is_primary)
    values (v_venue, v_owner, v_me, true);
    perform public._recompute_user_role(v_owner);
  end if;

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
revoke all on function public.create_venue(jsonb, bigint[], bigint) from public, anon;
grant execute on function public.create_venue(jsonb, bigint[], bigint) to authenticated, service_role;

-- ── 8. search_users_for_staff: admin accounts are not default staff / director candidates ──
-- Every staff search (add director, venue team, create/edit venue, reassign TD) goes through
-- this RPC; excluding admin roles here fixes them all. p_include_admins is honoured only for an
-- admin caller (explicit special action). Existing 2-argument callers get the new default.
drop function if exists public.search_users_for_staff(text, integer);
CREATE OR REPLACE FUNCTION public.search_users_for_staff(p_query text, p_limit integer DEFAULT 20, p_include_admins boolean DEFAULT false)
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
       -- admin accounts are not staff/director candidates unless an ADMIN explicitly asks
       and (p.role not in ('compete_admin', 'super_admin') or (p_include_admins and v_admin))
       and (p.user_name ilike v_pat or p.name ilike v_pat
            -- admins: partial email search; TDs / bar owners: exact email only (no enumeration)
            or (v_admin and p.email ilike v_pat)
            or (not v_admin and lower(p.email) = lower(v_q)))
     order by p.name nulls last, p.user_name
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$function$;
revoke all on function public.search_users_for_staff(text, integer, boolean) from public, anon;
grant execute on function public.search_users_for_staff(text, integer, boolean) to authenticated, service_role;
