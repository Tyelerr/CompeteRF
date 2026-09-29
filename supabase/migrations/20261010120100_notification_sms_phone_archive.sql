-- supabase/migrations/20261010120100_notification_sms_phone_archive.sql   (APPLIED 2026-09-28)
--
-- Legacy notification_preferences.sms_phone cleanup (separate from Stage 0 so it can be
-- approved on its own). Any signed-in user can currently read every notification_preferences
-- row (policy "Anyone can read preferences for recipient filtering" = true), including
-- sms_phone. Nothing reads or writes this column any more — the canonical SMS number is
-- profiles.phone_number (set_sms_phone / verify flow); no client (HEAD or iOS 1.25), RPC or
-- Edge Function references notification_preferences.sms_phone. One row holds a value, and it
-- does NOT match that user's current verified profile phone, so it is ARCHIVED privately (not
-- discarded) before being cleared. The column itself stays (released clients select * on
-- their own row), so installed apps are unaffected. The table-level read lockdown is Stage 3.
-- Rollback: supabase/rollback/20261010120100_notification_sms_phone_archive_rollback.sql

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.notification_sms_phone_archive (
  user_id uuid primary key,
  sms_phone text not null,
  archived_at timestamptz not null default now()
);
revoke all on private.notification_sms_phone_archive from public, anon, authenticated;

insert into private.notification_sms_phone_archive (user_id, sms_phone)
select user_id, sms_phone from public.notification_preferences
 where coalesce(sms_phone, '') <> ''
on conflict (user_id) do nothing;

update public.notification_preferences np
   set sms_phone = null
  from private.notification_sms_phone_archive a
 where a.user_id = np.user_id and np.sms_phone = a.sms_phone;
