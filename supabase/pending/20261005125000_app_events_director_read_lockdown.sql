-- supabase/pending/20261005125000_app_events_director_read_lockdown.sql   (PENDING — apply only in STEP 1B)
--
-- app_events security hardening — STEP 1B. Removes the temporary director / bar-owner raw-read
-- bridge added in STEP 1A. Afterwards only admins read app_events rows; directors and owners get
-- per-tournament counts from get_tournament_event_counts() (no user_id / metadata / timestamps).
--
-- PREREQUISITE: the native build whose dashboards use get_tournament_event_counts() is released
-- and has propagated. Older native builds still count rows directly — after this migration their
-- director / owner analytics show 0 until they update (nothing else breaks). Independent of
-- STEP 2 (direct INSERT lockdown), which stays separate.

drop policy if exists "TEMP compat: directors and owners read own tournament events" on public.app_events;
