-- supabase/pending/20261010120100_notification_sms_phone_archive_rollback.sql
-- Restores the archived legacy sms_phone values; keeps the private archive table.
update public.notification_preferences np
   set sms_phone = a.sms_phone
  from private.notification_sms_phone_archive a
 where a.user_id = np.user_id and np.sms_phone is null;
