-- supabase/rollback/20261021120000_security_lockdown_rollback.sql
-- COMPLETE rollback of 20261021120000_security_lockdown. Restores, verbatim from prod as captured
-- 2026-10-03 before the apply:
--   • view ACLs   {postgres,anon,authenticated,service_role = arwdDxtm} on profiles_public,
--                 chip_config_public, chip_events_public
--   • hide_tournament_and_resolve_report: original body (no search_path; trusts p_admin_id) and
--                 ACL {PUBLIC,postgres,anon,authenticated,service_role = X}
--   • conversation_participants policies participants_insert / participants_update (authenticated)
--   • drops the three guard triggers + functions this migration added
-- ⚠ Running this RE-OPENS every hole the migration closed. Only for an emergency regression.
-- Data written while the migration was live is untouched.

begin;

-- A
grant insert, update, delete, truncate, references, trigger
  on public.profiles_public, public.chip_config_public, public.chip_events_public
  to anon, authenticated;

-- B (original body, verbatim; CREATE OR REPLACE without SET also clears the added search_path)
create or replace function public.hide_tournament_and_resolve_report(p_tournament_id bigint, p_report_id uuid, p_admin_id uuid)
 returns void
 language plpgsql
 security definer
as $function$
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
$function$;
grant execute on function public.hide_tournament_and_resolve_report(bigint, uuid, uuid) to public, anon, authenticated;

-- D
drop trigger if exists profiles_guard_fargo on public.profiles;
drop function if exists public.tg_profiles_guard_fargo();

-- E
drop trigger if exists tournament_players_guard_self on public.tournament_players;
drop function if exists public.tg_tournament_players_guard_self();

-- F
drop trigger if exists conversation_participants_guard on public.conversation_participants;
drop function if exists public.tg_conversation_participants_guard();

drop policy if exists participants_insert on public.conversation_participants;
create policy participants_insert on public.conversation_participants
  for insert to authenticated
  with check (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));

drop policy if exists participants_update on public.conversation_participants;
create policy participants_update on public.conversation_participants
  for update to authenticated
  using ((user_id = auth.uid()));

commit;
