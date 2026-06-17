-- supabase/migrations/20260617120000_sms_notifications.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- SMS (text message) notification preferences.
--
-- Extends the existing per-user notification_preferences row with an SMS channel:
-- a master opt-in, the phone number texts go to, and per-alert toggles. Alerts are
-- role-based in the UI — every user can get "Match Alerts" (you're up next), while
-- the "Weekly TD Report" toggle is only shown to users who run tournaments.
--
-- Defaults are conservative: SMS is OFF until the user opts in and provides a
-- phone number, so we never text someone who didn't ask for it (SMS consent).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notification_preferences
  add column if not exists sms_enabled boolean not null default false,
  add column if not exists sms_phone text,
  add column if not exists sms_match_alerts boolean not null default true,
  add column if not exists sms_weekly_report boolean not null default false;

comment on column public.notification_preferences.sms_enabled is
  'Master SMS opt-in. No texts are sent unless this is true and sms_phone is set.';
comment on column public.notification_preferences.sms_phone is
  'E.164-ish phone number texts are sent to (the user''s own entry).';
comment on column public.notification_preferences.sms_match_alerts is
  'Text the player when their table is assigned / it is their turn to play.';
comment on column public.notification_preferences.sms_weekly_report is
  'Weekly tournament summary for tournament directors / bar owners.';
