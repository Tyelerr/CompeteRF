-- supabase/rollback/20261005125000_app_events_director_read_lockdown_rollback.sql
--
-- Reverts STEP 1B: restores the STEP 1A temporary director / bar-owner raw-read bridge
-- (own tournaments' tournament-entity rows only).

drop policy if exists "TEMP compat: directors and owners read own tournament events" on public.app_events;
create policy "TEMP compat: directors and owners read own tournament events" on public.app_events
  as permissive for select to authenticated
  using (
    entity_type = 'tournament'
    and entity_id in (
      select t.id from public.tournaments t
       where t.director_id = public._authz_my_id_auto()
      union
      select t.id from public.tournaments t
        join public.venue_owners vo on vo.venue_id = t.venue_id
       where vo.owner_id = public._authz_my_id_auto() and vo.archived_at is null)
  );
