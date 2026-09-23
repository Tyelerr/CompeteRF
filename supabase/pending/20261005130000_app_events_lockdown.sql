-- supabase/pending/20261005130000_app_events_lockdown.sql   (PENDING — apply only in STEP 2)
--
-- app_events security hardening — STEP 2. Removes direct client INSERT entirely; all event
-- logging goes through log_app_event() (identity derived from auth, shape-validated).
--
-- PREREQUISITE: web AND the native builds that call log_app_event() are live and most users
-- have updated. Older native builds still insert directly — after this migration their events
-- are silently dropped (analyticsService swallows the error; nothing user-facing breaks), so
-- apply once the old-version share is small enough to accept that analytics gap.

drop policy if exists "Anon can insert anonymous events" on public.app_events;
drop policy if exists "Users can insert own events" on public.app_events;
revoke insert on table public.app_events from anon, authenticated;
