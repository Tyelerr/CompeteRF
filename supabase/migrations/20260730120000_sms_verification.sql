-- supabase/migrations/20260730120000_sms_verification.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 — phone verification (Telnyx Verify) + consent-write lockdown.
--
-- Trust boundary:
--   • reserve_sms_verification_attempt / mark_phone_verified are SECURITY DEFINER
--     and executable by service_role ONLY (revoked from public/anon/authenticated).
--     Only the sms-verify-* Edge Functions (which validate the JWT and derive the
--     user id server-side) may call them.
--   • A client can NEVER self-verify, inject provider/method, or bypass rate limits.
--   • set_sms_phone (existing, authenticated-safe: own row only, normalizes E.164,
--     invalidates verification, disables SMS, logs phone_changed) stays as the
--     client phone-entry path.
--   • sms_enabled + all consent columns become writable ONLY via enable_sms_alerts /
--     disable_sms_alerts (the deferred Phase-2 lockdown, applied here).
--
-- Additive only; modifies no existing applied migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Verification-attempt table (server-controlled; NO OTP, NO full number) ──
create table if not exists public.sms_verification_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  phone_masked text,                        -- last-4 only; never full number, never OTP
  action       text not null check (action in ('start', 'check', 'test')),
  status       text not null check (status in ('reserved', 'sent', 'verified', 'failed', 'error')),
  request_ref  text,                         -- non-sensitive correlation id (optional)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sms_verification_attempts_user_idx
  on public.sms_verification_attempts(user_id, action, created_at desc);

alter table public.sms_verification_attempts enable row level security;
-- Server-only: no client SELECT/INSERT/UPDATE/DELETE. Only service_role (bypasses RLS).
revoke all on public.sms_verification_attempts from authenticated, anon;

-- ── 2. Atomic rate-limit reservation (service_role only) ──────────────────────
-- Serializes verification activity per user with a transaction-scoped advisory
-- lock, evaluates cooldown + rolling caps, and inserts a 'reserved' row when
-- allowed — all in ONE transaction, so concurrent requests cannot race past the
-- caps. Denials insert NO row (so caps count only real reserved+ requests, and a
-- provider failure — a reserved row that never completes — still counts, blocking
-- unlimited retries). Returns 'ok:<id>' or a safe reason code.
create or replace function public.reserve_sms_verification_attempt(
  p_user_id uuid,
  p_action  text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now        timestamptz := now();
  v_last_start timestamptz;
  v_starts_hr  integer;
  v_starts_day integer;
  v_checks     integer;
  v_id         bigint;
begin
  if p_user_id is null then return 'error'; end if;
  if p_action not in ('start', 'check', 'test') then return 'error'; end if;

  -- Serialize this user's verification/test activity until the transaction ends.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  if p_action = 'test' then
    -- Protected test-send limits: 60s cooldown + <=5/hour (Telnyx-cost guard).
    select pg_catalog.max(created_at) into v_last_start
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'test';
    if v_last_start is not null and (v_now - v_last_start) < interval '60 seconds' then
      return 'cooldown';
    end if;
    select pg_catalog.count(*) into v_starts_hr
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'test' and created_at > v_now - interval '1 hour';
    if v_starts_hr >= 5 then return 'rate_limited'; end if;
  elsif p_action = 'start' then
    select pg_catalog.max(created_at) into v_last_start
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'start';
    if v_last_start is not null and (v_now - v_last_start) < interval '60 seconds' then
      return 'cooldown';
    end if;

    select pg_catalog.count(*) into v_starts_hr
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'start' and created_at > v_now - interval '1 hour';
    if v_starts_hr >= 5 then return 'rate_limited'; end if;

    select pg_catalog.count(*) into v_starts_day
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'start' and created_at > v_now - interval '1 day';
    if v_starts_day >= 10 then return 'rate_limited'; end if;
  else
    -- check: cap failed+ attempts in a short rolling window
    select pg_catalog.count(*) into v_checks
    from public.sms_verification_attempts
    where user_id = p_user_id and action = 'check' and created_at > v_now - interval '15 minutes';
    if v_checks >= 5 then return 'rate_limited'; end if;
  end if;

  insert into public.sms_verification_attempts(user_id, action, status)
  values (p_user_id, p_action, 'reserved')
  returning id into v_id;

  return 'ok:' || v_id::text;
end;
$$;
revoke all on function public.reserve_sms_verification_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_sms_verification_attempt(uuid, text) to service_role;

-- ── 3. Server-only verification write (service_role only) ─────────────────────
-- Trusted values (provider/method) are hardcoded here — NOT accepted as params —
-- so even the Edge Function cannot inject them. Verifies the phone still equals
-- the user's current canonical number (stale-number guard), sets verification
-- fields + records the immutable verification_completed event. Never enables SMS.
create or replace function public.mark_phone_verified(
  p_user_id   uuid,
  p_phone_e164 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if p_user_id is null or p_phone_e164 is null then
    raise exception 'invalid arguments';
  end if;

  select phone_number into v_current from public.profiles where id = p_user_id;

  -- Stale-number guard: the number must still be the user's current canonical one.
  if v_current is null or v_current is distinct from p_phone_e164 then
    raise exception 'phone no longer current';
  end if;

  update public.profiles
  set phone_verified_at           = now(),
      phone_verification_provider = 'telnyx',
      phone_verification_method   = 'sms_otp',
      updated_at                  = now()
  where id = p_user_id;

  insert into public.sms_consent_events(user_id, phone_number, action, metadata)
  values (p_user_id, p_phone_e164, 'verification_completed', '{}'::jsonb);
end;
$$;
revoke all on function public.mark_phone_verified(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_phone_verified(uuid, text) to service_role;

-- ── 4. Consent-write lockdown on notification_preferences (deferred from Ph.2) ─
-- Column-scoped: authenticated may UPDATE only legitimate non-consent preference
-- columns. sms_enabled + all consent columns + deprecated sms_phone are NOT
-- granted, so they change ONLY via enable_sms_alerts / disable_sms_alerts /
-- set_sms_phone. Column set verified against the app's actual writers + the
-- generated schema (no email/other columns exist on this table).
revoke update on public.notification_preferences from authenticated;
grant update (
  tournament_updates, venue_promotions, app_announcements, search_alert_matches, giveaway_updates,
  quiet_hours_start, quiet_hours_end,
  sms_match_alerts, sms_tournament_reminders, sms_weekly_report,
  updated_at
) on public.notification_preferences to authenticated;
-- Intentionally NOT granted (server-only): sms_enabled, sms_consent_at,
-- sms_consent_source, sms_consent_version, sms_opted_out_at, sms_phone.

-- Column-scoped INSERT: the only legitimate client insert is getPreferences'
-- `{ user_id }`. Restricting the insertable columns to user_id means a handcrafted
-- INSERT cannot set sms_enabled / any consent column / sms_phone at row creation —
-- those keep their safe defaults. (An INSERT RLS policy with
-- `with check (user_id = auth.uid())` already exists — current row creation works;
-- verify it separately, this migration does not touch policies.) The consent RPCs
-- insert as the definer, so they are unaffected by this authenticated grant.
revoke insert on public.notification_preferences from authenticated;
grant  insert (user_id) on public.notification_preferences to authenticated;

-- ── 5. Outbound send idempotency + atomic reservation/claim ──────────────────
-- Server-generated idempotency_key (never client text) dedupes a readiness event.
alter table public.sms_messages add column if not exists idempotency_key text;
create unique index if not exists sms_messages_idempotency_key_uidx
  on public.sms_messages(idempotency_key) where idempotency_key is not null;

-- Atomically RESERVE (or CLAIM-for-retry) ownership of a send BEFORE contacting
-- Telnyx, so two concurrent requests can never send the same readiness event.
-- 'queued' is the reserved state. Returns:
--   'ok:<id>'       — newly reserved (this caller owns the send)
--   'retry:<id>'    — a prior sending_failed row was atomically claimed for retry
--   'already_sent'  — a sent/delivered row exists (do not resend)
--   'in_flight'     — reserved/queued by another request, or lost the retry race
-- service_role only.
create or replace function public.claim_sms_send(
  p_idempotency_key text,
  p_user_id         uuid,
  p_message_type    text,
  p_to_e164         text,
  p_tournament_id   bigint default null,
  p_match_id        text   default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     bigint;
  v_status text;
  v_claim  bigint;
begin
  if p_idempotency_key is null or p_user_id is null or p_to_e164 is null then
    raise exception 'invalid arguments';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key, 0)
  );

  insert into public.sms_messages
    (idempotency_key, user_id, message_type, to_e164, tournament_id, match_id, status)
  values
    (p_idempotency_key, p_user_id, p_message_type, p_to_e164, p_tournament_id, p_match_id, 'queued')
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is not null then
    return 'ok:' || v_id::text;
  end if;

  select id, status into v_id, v_status
  from public.sms_messages where idempotency_key = p_idempotency_key;

  if v_status in ('sent', 'delivered') then
    return 'already_sent';                 -- succeeded: never resend
  elsif v_status = 'delivery_failed' then
    return 'terminal';                     -- terminal (incl. stale_unconfirmed): NEVER auto-resend this key
  elsif v_status = 'sending_failed' then
    update public.sms_messages set status = 'queued', last_status_at = now()
    where id = v_id and status = 'sending_failed'
    returning id into v_claim;
    if v_claim is not null then return 'retry:' || v_id::text; end if;
    return 'in_flight';                    -- another request already claimed the retry
  else
    return 'in_flight';                    -- 'queued': reserved by another in-flight request
  end if;
end;
$$;
revoke all on function public.claim_sms_send(text, uuid, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.claim_sms_send(text, uuid, text, text, bigint, text) to service_role;

-- Stale 'queued' recovery: a queued row can otherwise stay reserved forever after
-- a crash or an ambiguous provider timeout. This does NOT auto-resend (the send
-- MAY have been accepted) — it marks aged queued rows terminal 'delivery_failed'
-- with a safe code so they're surfaced for review and stop blocking their key.
-- Returns the number of rows closed. service_role only; run manually or from a
-- future reviewed scheduled job. Default age 1 hour.
create or replace function public.recover_stale_sms_send(p_older_than interval default interval '1 hour')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sms_messages
  set status = 'delivery_failed', error_code = 'stale_unconfirmed', last_status_at = now()
  where status = 'queued' and created_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.recover_stale_sms_send(interval) from public, anon, authenticated;
grant execute on function public.recover_stale_sms_send(interval) to service_role;

-- NOTE: retention/cleanup for sms_verification_attempts is intentionally NOT set
-- up here (no pg_cron in this migration). Rows are safe to retain temporarily;
-- a reviewed cleanup mechanism will be added separately so verification deploy is
-- never coupled to an optional retention job.
