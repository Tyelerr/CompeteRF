-- supabase/rollback/20261005130000_app_events_lockdown_rollback.sql
--
-- Reverts STEP 2 to the STEP 1A state: direct client INSERT allowed again, but only as yourself
-- (or anonymous), only known event shapes, and rate-limited.

grant insert on table public.app_events to anon, authenticated;

drop policy if exists "Anon can insert anonymous events" on public.app_events;
create policy "Anon can insert anonymous events" on public.app_events
  as permissive for insert to anon
  with check (user_id is null
              and public._app_event_shape_ok(event_type, entity_type, metadata)
              and public._app_event_rate_ok());

drop policy if exists "Users can insert own events" on public.app_events;
create policy "Users can insert own events" on public.app_events
  as permissive for insert to authenticated
  with check ((user_id is null or user_id = auth.uid())
              and public._app_event_shape_ok(event_type, entity_type, metadata)
              and public._app_event_rate_ok());
