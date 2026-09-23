-- supabase/rollback/20260930130000_authz_write_lockdown_rollback.sql
--
-- Reverts 20260930130000_authz_write_lockdown.sql (M2) to the EXACT pre-M2 production state.
-- Every restored policy/function body below is copied verbatim (by script) from
-- supabase/rollback/20260930110000_authz_baseline_capture.sql (captured from prod).
--
-- ⚠ EMERGENCY USE ONLY: this REOPENS the privilege-escalation / venue-hijack holes M2 closed.
-- Prefer a forward fix. The M1 RPCs are intentionally NOT removed here — the Phase 1 client calls
-- them, and they are safe on their own (see 20260930120000_authz_rpcs_rollback.sql to drop them,
-- only if no client using them has shipped).

-- ── profiles ─────────────────────────────────────────────────────────────────────────────────
drop trigger if exists profiles_guard_privileged on public.profiles;
drop function if exists public.tg_profiles_guard_privileged();
grant insert, update, delete on public.profiles to anon;

-- ── venue_owners / venue_directors ───────────────────────────────────────────────────────────
drop policy if exists "Venue owners and admins can insert venue_owners" on public.venue_owners;
drop policy if exists "Venue owners and admins can insert venue_directors" on public.venue_directors;
drop policy if exists "Venue owners and admins can update venue_directors" on public.venue_directors;

-- ── tournaments / tournament_templates ───────────────────────────────────────────────────────
drop policy if exists "Venue managers and admins can insert tournaments" on public.tournaments;
drop trigger if exists tournaments_guard_venue_director on public.tournaments;
drop policy if exists "Venue managers and admins can insert templates" on public.tournament_templates;
drop trigger if exists tournament_templates_guard_venue_director on public.tournament_templates;
drop function if exists public.tg_guard_venue_director_change();

-- ── restored policies (verbatim from baseline) ───────────────────────────────────────────────
drop policy if exists "Bar owners can manage team roles" on public.profiles;
create policy "Bar owners can manage team roles" on public.profiles as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM profiles editor
  WHERE ((editor.id = auth.uid()) AND (editor.role = ANY (ARRAY['bar_owner'::text, 'super_admin'::text, 'compete_admin'::text]))))));

drop policy if exists "Bar owners can insert venue_owners" on public.venue_owners;
create policy "Bar owners can insert venue_owners" on public.venue_owners as permissive for insert to authenticated
  with check (true);

drop policy if exists "Bar owners can insert venue_directors" on public.venue_directors;
create policy "Bar owners can insert venue_directors" on public.venue_directors as permissive for insert to authenticated
  with check (true);

drop policy if exists "Bar owners can update venue_directors" on public.venue_directors;
create policy "Bar owners can update venue_directors" on public.venue_directors as permissive for update to authenticated
  using (true);

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

drop policy if exists "Directors can insert templates" on public.tournament_templates;
create policy "Directors can insert templates" on public.tournament_templates as permissive for insert to public
  with check (((director_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (venue_id IN ( SELECT venue_directors.venue_id
   FROM venue_directors
  WHERE ((venue_directors.director_id = ( SELECT profiles.id_auto
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (venue_directors.archived_at IS NULL))))));

drop policy if exists "Tournament directors can insert their own templates" on public.tournament_templates;
create policy "Tournament directors can insert their own templates" on public.tournament_templates as permissive for insert to public
  with check ((auth.uid() IS NOT NULL));

-- ── generate_recurring_tournaments: restore EXECUTE grants + unset the pinned search_path ────
alter function public.generate_recurring_tournaments() reset search_path;
grant execute on function public.generate_recurring_tournaments() to public, anon, authenticated;

-- ── create_conversation_with_participants (verbatim from baseline) + original grants ─────────
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

grant execute on function public.create_conversation_with_participants(uuid, text, text, integer, boolean, uuid, text) to public, anon, authenticated;
