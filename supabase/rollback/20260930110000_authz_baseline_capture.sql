-- supabase/rollback/20260930110000_authz_baseline_capture.sql
--
-- M0 — EXACT production baseline, captured 2026-09-23T06:22:38.744Z from the linked prod DB
-- (pg_policies / information_schema / pg_get_functiondef / pg_get_triggerdef), read-only.
-- These objects predate file-based migrations, so this file is the only versioned record of them.
-- It is NOT a migration. It is the source of truth for:
--   * supabase/rollback/20260930130000_authz_write_lockdown_rollback.sql (restores these verbatim)
--   * supabase/tests/authz_lockdown.test.ts (replays the prod policies, not local assumptions)
-- Re-running it restores the captured policies/grants/functions for the listed tables only.

-- ── RLS flags (informational) ──
-- profiles: rowsecurity=true force=false
-- tournament_templates: rowsecurity=true force=false
-- tournaments: rowsecurity=true force=false
-- venue_directors: rowsecurity=true force=false
-- venue_owners: rowsecurity=true force=false

-- ── Table grants to anon/authenticated (informational; restored by the rollback where changed) ──
-- profiles → anon: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- profiles → authenticated: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- tournament_templates → anon: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- tournament_templates → authenticated: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- tournaments → anon: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- tournaments → authenticated: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- venue_directors → anon: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- venue_directors → authenticated: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- venue_owners → anon: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- venue_owners → authenticated: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ── Non-internal triggers (informational) ──
-- profiles.on_profile_created_create_notif_prefs: CREATE TRIGGER on_profile_created_create_notif_prefs AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION create_notification_preferences()
-- profiles.on_profile_created_provision_player: CREATE TRIGGER on_profile_created_provision_player AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION tg_provision_player_for_profile()
-- profiles.profiles_guard_phone: CREATE TRIGGER profiles_guard_phone BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION tg_profiles_guard_phone()
-- tournaments.elim_auto_assign_on_tournament: CREATE TRIGGER elim_auto_assign_on_tournament AFTER UPDATE OF live_settings, live_state, is_paused ON public.tournaments FOR EACH ROW WHEN ((((new.live_settings ->> 'autoAssignEnabled'::text) = 'true'::text) AND (new.live_state = 'in_progress'::text) AND (NOT COALESCE(new.is_paused, false)) AND (new.tournament_format <> 'chip-tournament'::text))) EXECUTE FUNCTION _elim_auto_assign_on_tournament()
-- tournaments.trg_set_gameplay_started_at: CREATE TRIGGER trg_set_gameplay_started_at BEFORE INSERT OR UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION set_gameplay_started_at()

-- ── Policies (verbatim) ──
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile" on public.profiles as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));

drop policy if exists "Anyone can view active profiles" on public.profiles;
create policy "Anyone can view active profiles" on public.profiles as permissive for select to public
  using ((status = 'active'::text));

drop policy if exists "Bar owners can manage team roles" on public.profiles;
create policy "Bar owners can manage team roles" on public.profiles as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM profiles editor
  WHERE ((editor.id = auth.uid()) AND (editor.role = ANY (ARRAY['bar_owner'::text, 'super_admin'::text, 'compete_admin'::text]))))));

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile" on public.profiles as permissive for insert to public
  with check ((auth.uid() = id));

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles as permissive for insert to public
  with check ((auth.uid() = id));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles as permissive for update to public
  using ((auth.uid() = id));

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles as permissive for select to public
  using ((auth.uid() = id));

drop policy if exists "Anyone can read active templates" on public.tournament_templates;
create policy "Anyone can read active templates" on public.tournament_templates as permissive for select to public
  using ((status = 'active'::text));

drop policy if exists "Directors can insert templates" on public.tournament_templates;
create policy "Directors can insert templates" on public.tournament_templates as permissive for insert to public
  with check (((director_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (venue_id IN ( SELECT venue_directors.venue_id
   FROM venue_directors
  WHERE ((venue_directors.director_id = ( SELECT profiles.id_auto
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (venue_directors.archived_at IS NULL))))));

drop policy if exists "Directors can update own templates" on public.tournament_templates;
create policy "Directors can update own templates" on public.tournament_templates as permissive for update to public
  using ((director_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

drop policy if exists "Tournament directors can insert their own templates" on public.tournament_templates;
create policy "Tournament directors can insert their own templates" on public.tournament_templates as permissive for insert to public
  with check ((auth.uid() IS NOT NULL));

drop policy if exists "Tournament directors can view their own templates" on public.tournament_templates;
create policy "Tournament directors can view their own templates" on public.tournament_templates as permissive for select to public
  using ((auth.uid() IS NOT NULL));

drop policy if exists "Admins can update any tournament" on public.tournaments;
create policy "Admins can update any tournament" on public.tournaments as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));

drop policy if exists "Anyone can read tournaments" on public.tournaments;
create policy "Anyone can read tournaments" on public.tournaments as permissive for select to public
  using (((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));

drop policy if exists "Directors and venue owners can insert tournaments" on public.tournaments;
create policy "Directors and venue owners can insert tournaments" on public.tournaments as permissive for insert to public
  with check (((director_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR (venue_id IN ( SELECT venue_owners.venue_id
   FROM venue_owners
  WHERE ((venue_owners.owner_id = ( SELECT profiles.id_auto
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (venue_owners.archived_at IS NULL)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));

drop policy if exists "Directors and venue owners can update tournaments" on public.tournaments;
create policy "Directors and venue owners can update tournaments" on public.tournaments as permissive for update to public
  using (((director_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR (venue_id IN ( SELECT venue_owners.venue_id
   FROM venue_owners
  WHERE ((venue_owners.owner_id = ( SELECT profiles.id_auto
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (venue_owners.archived_at IS NULL))))));

drop policy if exists "Anyone can view active venue directors" on public.venue_directors;
create policy "Anyone can view active venue directors" on public.venue_directors as permissive for select to public
  using ((archived_at IS NULL));

drop policy if exists "Bar owners can delete venue_directors" on public.venue_directors;
create policy "Bar owners can delete venue_directors" on public.venue_directors as permissive for delete to public
  using ((is_venue_owner(venue_id) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));

drop policy if exists "Bar owners can insert venue_directors" on public.venue_directors;
create policy "Bar owners can insert venue_directors" on public.venue_directors as permissive for insert to authenticated
  with check (true);

drop policy if exists "Bar owners can update venue_directors" on public.venue_directors;
create policy "Bar owners can update venue_directors" on public.venue_directors as permissive for update to authenticated
  using (true);

drop policy if exists "Bar owners can view venue_directors" on public.venue_directors;
create policy "Bar owners can view venue_directors" on public.venue_directors as permissive for select to authenticated
  using (true);

drop policy if exists "Admins can delete venue_owners" on public.venue_owners;
create policy "Admins can delete venue_owners" on public.venue_owners as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));

drop policy if exists "Admins can update venue_owners" on public.venue_owners;
create policy "Admins can update venue_owners" on public.venue_owners as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text]))))));

drop policy if exists "Anyone can view active venue owners" on public.venue_owners;
create policy "Anyone can view active venue owners" on public.venue_owners as permissive for select to public
  using ((archived_at IS NULL));

drop policy if exists "Bar owners can delete venue_owners" on public.venue_owners;
create policy "Bar owners can delete venue_owners" on public.venue_owners as permissive for delete to public
  using ((is_venue_owner(venue_id) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));

drop policy if exists "Bar owners can insert venue_owners" on public.venue_owners;
create policy "Bar owners can insert venue_owners" on public.venue_owners as permissive for insert to authenticated
  with check (true);

drop policy if exists "Bar owners can view their venue_owners" on public.venue_owners;
create policy "Bar owners can view their venue_owners" on public.venue_owners as permissive for select to authenticated
  using ((owner_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

-- ── Functions (verbatim) + ACLs ──
-- create_conversation_with_participants(p_created_by uuid, p_subject text, p_category text, p_tournament_id integer, p_is_support boolean, p_recipient_id uuid, p_first_message text) owner=postgres acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_conversation_with_participants(p_created_by uuid, p_subject text DEFAULT NULL::text, p_category text DEFAULT 'general'::text, p_tournament_id integer DEFAULT NULL::integer, p_is_support boolean DEFAULT false, p_recipient_id uuid DEFAULT NULL::uuid, p_first_message text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- generate_recurring_tournaments() owner=postgres acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.generate_recurring_tournaments()
 RETURNS TABLE(template_id integer, dates_inserted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

-- is_venue_owner(p_venue_id integer) owner=postgres acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.is_venue_owner(p_venue_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_owners
    WHERE venue_id = p_venue_id
    AND owner_id = (
      SELECT id_auto FROM public.profiles WHERE id = auth.uid()
    )
    AND archived_at IS NULL
  );
$function$;

