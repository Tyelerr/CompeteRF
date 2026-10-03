-- supabase/migrations/20261021140000_security_cleanup.sql
--
-- Remaining security cleanup (2026-10-03). All three holes reproduced against prod in rolled-back
-- transactions (supabase/tests/security_cleanup_prod_verification.sql). Privilege-narrowing +
-- guard triggers + one server-side replacement for a client workflow; no data is rewritten.
-- Rollback: supabase/rollback/20261021140000_security_cleanup_rollback.sql (verbatim prod state).
--
-- A. Admin helpers. get_admin_push_tokens() / get_admin_id_autos() / get_user_last_sign_in(uuid)
--    were SECURITY DEFINER with EXECUTE for PUBLIC/anon/authenticated and no caller check: a
--    signed-out caller got every admin's Expo push token (→ direct pushes to admin devices, or
--    claiming the token under their own account), and anyone's last sign-in time.
--      • get_user_last_sign_in: used only by the admin Edit User screen (every build) → keeps
--        authenticated EXECUTE, but the body now requires an admin caller (auth.uid()); anon /
--        PUBLIC revoked.
--      • get_admin_push_tokens / get_admin_id_autos: their only caller is the CLIENT-side admin
--        alert after a report (notificationDispatcher.sendToAdmins — every build fetched admin
--        tokens and pushed from the reporter's phone). That alert moves to the server (C below);
--        client EXECUTE is revoked entirely (service_role keeps it). Old apps' attempt now fails
--        quietly (fire-and-forget, report filing unaffected) — no duplicate alerts.
--
-- B. Notifications. INSERT was WITH CHECK (true) for any signed-in user (any recipient, title,
--    category, deep link — e.g. a fake "Compete security" alert linking to a phishing site), and
--    the own-row UPDATE had no column limits. Every legitimate CLIENT insert, in the current app
--    and the public native builds, comes from STAFF (TD / bar owner / admin): tournament updates to
--    favoriters, search-alert matches, giveaway announcements. Server creators (definer RPCs,
--    service-role Edge Functions) are unaffected. Now:
--      • INSERT: staff only (role from the caller's profile), and a guard requires an allowed
--        category per role (admin_alert is server-only) and an INTERNAL deep link
--        ('/path…' or the app's own 'competerf:///…'; no other scheme, no '//' host).
--      • UPDATE (own rows, unchanged policy): only read_at may change — the only column any build
--        updates. Recipient / title / body / data / category are immutable from clients.
--      • anon: write privileges revoked (it had ALL; RLS was the only barrier).
--
-- C. Report → admin alert, server-side. AFTER INSERT on reports (both the direct insert path and
--    the submit_content_report RPC): in-app 'admin_alert' rows for every active admin + ONE Expo
--    push request (pg_net, async after commit) to their active tokens — same title / body / data
--    the client used. Failures never block filing the report.
--
-- D. Phone verification on INSERT. profiles_guard_phone fired BEFORE UPDATE only, so a client
--    could INSERT its own profile with someone else's phone_number + phone_verified_at (then
--    sms-send-test / match-ready SMS would text that number). No client — current or public
--    native — sends phone_* at sign-up (email register, complete-profile for Apple / Google);
--    the phone is set later via set_sms_phone + mark_phone_verified (SECURITY DEFINER). The guard
--    now also fires on INSERT and refuses any non-null phone_* from client roles.

begin;

-- A ───────────────────────────────────────────────────────────────────────────────────────────
revoke execute on function public.get_admin_push_tokens() from public, anon, authenticated;
revoke execute on function public.get_admin_id_autos() from public, anon, authenticated;

create or replace function public.get_user_last_sign_in(user_id uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'auth', 'public'
as $function$
begin
  -- Admin Edit User only. Authorization from the signed-in caller, never from the argument.
  if auth.uid() is null or not public._authz_is_admin() then
    raise exception 'Unauthorized: admin role required' using errcode = '42501';
  end if;
  return (select u.last_sign_in_at from auth.users u where u.id = get_user_last_sign_in.user_id);
end;
$function$;
revoke execute on function public.get_user_last_sign_in(uuid) from public, anon;
grant execute on function public.get_user_last_sign_in(uuid) to authenticated;

-- B ───────────────────────────────────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate, references, trigger on public.notifications from anon;

drop policy if exists "Allow insert notifications" on public.notifications;
drop policy if exists "Staff insert notifications" on public.notifications;
create policy "Staff insert notifications" on public.notifications
  for insert to authenticated
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('tournament_director', 'bar_owner', 'compete_admin', 'super_admin')
      and coalesce(p.is_disabled, false) = false
      and p.deleted_at is null));

create or replace function public.tg_notifications_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text;
  v_link jsonb;
begin
  -- Server creators (SECURITY DEFINER RPCs run as postgres, Edge Functions as service_role).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select p.role into v_role from public.profiles p where p.id = auth.uid();
    if new.category is null or not (new.category = any (
         case when v_role in ('compete_admin', 'super_admin')
              then array['tournament_update', 'search_alert_match', 'giveaway_update', 'venue_promotion', 'app_announcement']
              else array['tournament_update', 'search_alert_match', 'venue_promotion'] end)) then
      raise exception 'Notification category % is not allowed from the app', coalesce(new.category, '(none)')
        using errcode = '42501';
    end if;
    v_link := new.data -> 'deep_link';
    if v_link is not null and jsonb_typeof(v_link) <> 'null' and (
         jsonb_typeof(v_link) <> 'string'
         or not ((v_link #>> '{}') ~ '^/[^/\\]' or (v_link #>> '{}') ~ '^competerf:///')
         or (v_link #>> '{}') ~ '\s') then
      raise exception 'Notification links must point inside the app' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: a recipient may only mark their notification read.
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.data is distinct from old.data
     or new.category is distinct from old.category
     or new.status is distinct from old.status
     or new.sent_at is distinct from old.sent_at
     or new.error_message is distinct from old.error_message
     or new.scheduled_for is distinct from old.scheduled_for
     or new.created_at is distinct from old.created_at then
    raise exception 'Only read_at can be changed on a notification' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists notifications_guard on public.notifications;
create trigger notifications_guard
  before insert or update on public.notifications
  for each row execute function public.tg_notifications_guard();

-- C ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_reports_notify_admins()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_title constant text := '🚩 New Report Submitted';
  v_body  text := 'A ' || replace(coalesce(new.content_type, 'item'), '_', ' ')
                  || ' has been reported for: ' || coalesce(new.reason, 'unspecified');
  v_data  jsonb := jsonb_build_object('report_id', new.id, 'content_type', new.content_type,
                     'content_id', new.content_id, 'deep_link', '/admin/report-management', 'type', 'admin_report');
  v_msgs  jsonb;
begin
  begin
    insert into public.notifications (user_id, title, body, category, data, status, sent_at)
    select p.id_auto, v_title, v_body, 'admin_alert', v_data, 'sent', now()
    from public.profiles p
    where p.role in ('compete_admin', 'super_admin')
      and coalesce(p.is_disabled, false) = false
      and p.deleted_at is null;

    select jsonb_agg(jsonb_build_object('to', pt.token, 'sound', 'default', 'title', v_title, 'body', v_body, 'data', v_data))
      into v_msgs
    from public.push_tokens pt
    join public.profiles p on p.id = pt.user_id
    where p.role in ('compete_admin', 'super_admin')
      and coalesce(p.is_disabled, false) = false
      and p.deleted_at is null
      and pt.is_active;
    if v_msgs is not null then
      -- pg_net: queued in this transaction, sent by the background worker after COMMIT.
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_msgs,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 5000);
    end if;
  exception when others then
    -- An alert failure must never block filing the report.
    raise warning 'report admin alert failed for report %: %', new.id, sqlerrm;
  end;
  return null;
end;
$function$;
revoke all on function public.tg_reports_notify_admins() from public, anon, authenticated;

drop trigger if exists reports_notify_admins on public.reports;
create trigger reports_notify_admins
  after insert on public.reports
  for each row execute function public.tg_reports_notify_admins();

-- D ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_profiles_guard_phone()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.phone_number                is not null
    or new.phone_verified_at           is not null
    or new.phone_verification_provider is not null
    or new.phone_verification_method   is not null then
      raise exception
        'phone_* columns may only be set via set_sms_phone()/verify RPC (attempted by role %)', current_user
        using errcode = '42501';
    end if;
  elsif new.phone_number                is distinct from old.phone_number
     or new.phone_verified_at           is distinct from old.phone_verified_at
     or new.phone_verification_provider is distinct from old.phone_verification_provider
     or new.phone_verification_method   is distinct from old.phone_verification_method then
    raise exception
      'phone_* columns may only be changed via set_sms_phone()/verify RPC (attempted by role %)', current_user;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_guard_phone on public.profiles;
create trigger profiles_guard_phone
  before insert or update on public.profiles
  for each row execute function public.tg_profiles_guard_phone();

commit;
