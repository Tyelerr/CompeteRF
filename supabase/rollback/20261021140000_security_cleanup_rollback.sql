-- supabase/rollback/20261021140000_security_cleanup_rollback.sql
-- COMPLETE rollback of 20261021140000_security_cleanup — restores, verbatim from prod as captured
-- 2026-10-03 before the apply:
--   • get_admin_push_tokens / get_admin_id_autos ACL {PUBLIC, anon, authenticated, service_role = X}
--   • get_user_last_sign_in: original SQL body + the same ACL
--   • notifications: "Allow insert notifications" (authenticated, WITH CHECK true), anon's ALL
--     grant; drops the staff insert policy + guard trigger
--   • reports: drops the server-side admin alert trigger
--   • profiles_guard_phone: original body, BEFORE UPDATE only
-- Function ACLs are restored to the identical privilege SETS (entry order inside proacl may differ).
-- ⚠ Running this RE-OPENS every hole the migration closed. Rows written meanwhile are kept.

begin;

-- A
grant execute on function public.get_admin_push_tokens() to public, anon, authenticated;
grant execute on function public.get_admin_id_autos() to public, anon, authenticated;

-- Body as an exact string literal (prod stored it with CRLF line endings) — immune to the file's own line endings.
create or replace function public.get_user_last_sign_in(user_id uuid)
 returns timestamp with time zone
 language sql
 security definer
 set search_path to 'auth', 'public'
as E'\r\n  SELECT last_sign_in_at\r\n  FROM auth.users\r\n  WHERE id = user_id;\r\n';
grant execute on function public.get_user_last_sign_in(uuid) to public, anon, authenticated;

-- B
drop trigger if exists notifications_guard on public.notifications;
drop function if exists public.tg_notifications_guard();
drop policy if exists "Staff insert notifications" on public.notifications;
drop policy if exists "Allow insert notifications" on public.notifications;
create policy "Allow insert notifications" on public.notifications
  for insert to authenticated
  with check (true);
grant insert, update, delete, truncate, references, trigger on public.notifications to anon;

-- C
drop trigger if exists reports_notify_admins on public.reports;
drop function if exists public.tg_reports_notify_admins();

-- D (original body, exact string literal)
create or replace function public.tg_profiles_guard_phone()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as E'\nbegin\n  if (new.phone_number                is distinct from old.phone_number\n   or new.phone_verified_at           is distinct from old.phone_verified_at\n   or new.phone_verification_provider is distinct from old.phone_verification_provider\n   or new.phone_verification_method   is distinct from old.phone_verification_method)\n   and current_user in (\'authenticated\', \'anon\')\n  then\n    raise exception\n      \'phone_* columns may only be changed via set_sms_phone()/verify RPC (attempted by role %)\',\n      current_user;\n  end if;\n  return new;\nend;\n';
drop trigger if exists profiles_guard_phone on public.profiles;
create trigger profiles_guard_phone
  before update on public.profiles
  for each row execute function public.tg_profiles_guard_phone();

commit;
