-- supabase/migrations/20260729120000_sms_phone_consent.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — SMS phone identity, consent, and audit foundations.
--
-- Canonical phone identity lives on PROFILES; consent + per-category settings live
-- on NOTIFICATION_PREFERENCES; an immutable SMS_CONSENT_EVENTS table preserves the
-- full opt-in/out lifecycle; SMS_MESSAGES is created now (populated in Phase 5) so
-- delivery tracking needs no further schema change.
--
-- ADDITIVE + NON-BREAKING ON PURPOSE:
--   • profiles.phone_number / phone_verified_at (+ provider/method) are new; the
--     only way to change them is set_sms_phone() / the Phase-3 verify path. A
--     BEFORE-UPDATE trigger blocks any DIRECT client write to those columns
--     (a client runs as 'authenticated'/'anon'; SECURITY DEFINER RPCs run as the
--     function owner), so no client can self-verify. No session variable is used.
--   • notification_preferences.sms_phone is DEPRECATED (profiles.phone_number is
--     canonical) but KEPT for now; it is dropped in a follow-up migration after the
--     app is repointed. The notification_preferences UPDATE-grant lockdown that
--     makes sms_enabled/consent columns server-only is intentionally NOT here — it
--     lands with the service repoint so the live preferences screen never breaks.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. profiles: canonical phone identity + verification metadata ────────────
alter table public.profiles
  add column if not exists phone_number                text,        -- E.164
  add column if not exists phone_verified_at           timestamptz, -- server-set only
  add column if not exists phone_verification_provider text,        -- e.g. 'telnyx'
  add column if not exists phone_verification_method   text;        -- e.g. 'verify_api'

comment on column public.profiles.phone_number is
  'User mobile in E.164. Changed ONLY via set_sms_phone(), which clears verification + disables SMS.';
comment on column public.profiles.phone_verified_at is
  'When phone ownership was proven (Telnyx Verify). Server-set only; guarded by trigger.';

-- Best-effort backfill of the NUMBER only (never verification) from the old field.
-- ONLY copy values that are ALREADY valid E.164 — the old sms_phone was "E.164-ish"
-- and may hold un-normalized junk like "(555) 123-4567". Malformed values are left
-- NULL so the user re-enters through set_sms_phone() (which normalizes + validates).
update public.profiles p
set phone_number = np.sms_phone
from public.notification_preferences np
where np.user_id = p.id
  and p.phone_number is null
  and np.sms_phone ~ '^\+[1-9]\d{6,14}$';

-- ── 2. notification_preferences: consent + categories ────────────────────────
alter table public.notification_preferences
  add column if not exists sms_tournament_reminders boolean not null default false,
  add column if not exists sms_consent_at      timestamptz,
  add column if not exists sms_consent_source   text,
  add column if not exists sms_consent_version  text,
  add column if not exists sms_opted_out_at     timestamptz;

alter table public.notification_preferences
  drop constraint if exists np_sms_consent_source_chk;
alter table public.notification_preferences
  add constraint np_sms_consent_source_chk check (
    sms_consent_source is null
    or sms_consent_source in
      ('app_settings','onboarding','web_opt_in','sms_start_keyword','admin_migration')
  );

comment on column public.notification_preferences.sms_phone is
  'DEPRECATED — canonical phone is profiles.phone_number. Kept for compatibility; '
  'removed in a follow-up migration after the app is repointed. Do not write new values.';

-- ── 3. sms_consent_events: immutable consent lifecycle audit ─────────────────
create table if not exists public.sms_consent_events (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  phone_number    text,                               -- nullable: NULL when none on file
  action          text not null check (action in
                    ('phone_changed','verification_completed','opted_in','opted_out')),
  consent_version text,
  consent_source  text check (consent_source is null or consent_source in
                    ('app_settings','onboarding','web_opt_in','sms_start_keyword','admin_migration')),
  created_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);
create index if not exists sms_consent_events_user_idx
  on public.sms_consent_events(user_id, created_at desc);

alter table public.sms_consent_events enable row level security;
drop policy if exists sms_consent_events_select_own on public.sms_consent_events;
create policy sms_consent_events_select_own on public.sms_consent_events
  for select to authenticated using (user_id = auth.uid());
-- Append-only from the app's perspective: explicit SELECT grant (so RLS-allowed
-- reads actually work regardless of default privileges); NO client writes.
grant select on public.sms_consent_events to authenticated;
revoke insert, update, delete on public.sms_consent_events from authenticated, anon;

-- ── 4. sms_messages: delivery log (created now, populated in Phase 5) ─────────
create table if not exists public.sms_messages (
  id                  bigint generated always as identity primary key,
  user_id             uuid references auth.users(id) on delete set null,
  tournament_id       bigint references public.tournaments(id) on delete set null,
  match_id            text,                            -- chip/live match id (text ids)
  to_e164             text not null,                   -- FULL number; mask in UI/logs
  message_type        text not null check (message_type in
                        ('verification','test_message','match_ready','tournament_reminder','account_update')),
  telnyx_message_id   text unique,                     -- webhook idempotency key
  provider            text,                            -- reserved (nullable) e.g. 'telnyx'
  provider_message_id text,                            -- reserved (nullable) provider-agnostic id
  status              text check (status is null or status in
                        ('queued','sent','delivered','sending_failed','delivery_failed')),
  error_code          text,
  error_detail        text,
  retry_count         int,                             -- reserved (nullable)
  last_status_at      timestamptz,                     -- reserved (nullable)
  created_at          timestamptz not null default now(),
  accepted_at         timestamptz,
  delivered_at        timestamptz
);
create index if not exists sms_messages_user_idx on public.sms_messages(user_id, created_at desc);

alter table public.sms_messages enable row level security;
drop policy if exists sms_messages_select_own on public.sms_messages;
create policy sms_messages_select_own on public.sms_messages
  for select to authenticated using (user_id = auth.uid());
grant select on public.sms_messages to authenticated;
revoke insert, update, delete on public.sms_messages from authenticated, anon;

-- ── 5. Trigger guard: phone_* change only via approved server paths ──────────
-- A direct client UPDATE runs as role 'authenticated'/'anon'; a SECURITY DEFINER
-- RPC runs as the function owner; service_role runs as 'service_role'. So we reject
-- phone_* changes ONLY when the executing role is a client role. Fires exclusively
-- when a phone_* column actually changes — ordinary name/role/status edits are
-- untouched. No session variable required.
create or replace function public.tg_profiles_guard_phone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.phone_number                is distinct from old.phone_number
   or new.phone_verified_at           is distinct from old.phone_verified_at
   or new.phone_verification_provider is distinct from old.phone_verification_provider
   or new.phone_verification_method   is distinct from old.phone_verification_method)
   and current_user in ('authenticated', 'anon')
  then
    raise exception
      'phone_* columns may only be changed via set_sms_phone()/verify RPC (attempted by role %)',
      current_user;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_phone on public.profiles;
create trigger profiles_guard_phone
  before update on public.profiles
  for each row execute function public.tg_profiles_guard_phone();

-- ── 6. set_sms_phone(): the ONLY client path to change a phone number ────────
create or replace function public.set_sms_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_digits  text;
  v_e164    text;
  v_current text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- E.164 is the contract. A full +CC number passes through for ANY country; the
  -- bare-10/11-digit -> +1 rule is the ONLY US-specific convenience.
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_e164 := case
    when p_phone ~ '^\+[1-9]\d{6,14}$'                    then p_phone
    when length(v_digits) = 10                            then '+1' || v_digits
    when length(v_digits) = 11 and left(v_digits, 1) = '1' then '+' || v_digits
    else null
  end;
  if v_e164 is null or v_e164 !~ '^\+[1-9]\d{6,14}$' then
    raise exception 'Invalid phone number';
  end if;

  select phone_number into v_current from public.profiles where id = v_uid;

  -- Unchanged number: do NOT clear verification unnecessarily.
  if v_current is not distinct from v_e164 then
    return;
  end if;

  -- Changing the number invalidates verification + consent for the NEW number.
  update public.profiles
  set phone_number                = v_e164,
      phone_verified_at           = null,
      phone_verification_provider = null,
      phone_verification_method   = null,
      updated_at                  = now()
  where id = v_uid;

  -- Existence-check insert (not ON CONFLICT) so we don't depend on a named unique
  -- constraint on notification_preferences.user_id, which isn't in our migrations.
  if not exists (select 1 from public.notification_preferences where user_id = v_uid) then
    insert into public.notification_preferences (user_id) values (v_uid);
  end if;

  update public.notification_preferences
  set sms_enabled = false, updated_at = now()
  where user_id = v_uid;

  -- History preserved; prior consent is NOT treated as consent for the new number.
  insert into public.sms_consent_events(user_id, phone_number, action, metadata)
  values (v_uid, v_e164, 'phone_changed', jsonb_build_object('previous', v_current));
end;
$$;
revoke all on function public.set_sms_phone(text) from public, anon;
grant execute on function public.set_sms_phone(text) to authenticated;

-- ── 7. enable_sms_alerts(): server-authoritative opt-in (requires verified) ──
create or replace function public.enable_sms_alerts(p_source text, p_version text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid         uuid := auth.uid();
  v_phone       text;
  v_verified    timestamptz;
  v_was_enabled boolean;
  v_old_version text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  -- Clients may only claim these sources; privileged sources are server-only.
  if p_source not in ('app_settings', 'onboarding', 'web_opt_in') then
    raise exception 'Invalid consent source';
  end if;

  select phone_number, phone_verified_at into v_phone, v_verified
  from public.profiles where id = v_uid;

  if v_verified is null then
    raise exception 'Phone must be verified before enabling SMS';
  end if;

  if not exists (select 1 from public.notification_preferences where user_id = v_uid) then
    insert into public.notification_preferences (user_id) values (v_uid);
  end if;

  select sms_enabled, sms_consent_version into v_was_enabled, v_old_version
  from public.notification_preferences where user_id = v_uid;

  update public.notification_preferences
  set sms_enabled         = true,
      sms_consent_at      = now(),
      sms_consent_source  = p_source,
      sms_consent_version = p_version,
      sms_opted_out_at    = null,          -- approved re-consent clears prior opt-out
      updated_at          = now()
  where user_id = v_uid;

  -- Log an 'opted_in' event ONLY on a real transition (was not enabled) or a
  -- re-consent to a NEW wording version — never a duplicate for an unchanged toggle.
  if v_was_enabled is distinct from true or v_old_version is distinct from p_version then
    insert into public.sms_consent_events(user_id, phone_number, action, consent_version, consent_source)
    values (v_uid, v_phone, 'opted_in', p_version, p_source);
  end if;
end;
$$;
revoke all on function public.enable_sms_alerts(text, text) from public, anon;
grant execute on function public.enable_sms_alerts(text, text) to authenticated;

-- ── 8. disable_sms_alerts(): user-initiated opt-out ─────────────────────────
create or replace function public.disable_sms_alerts()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid         uuid := auth.uid();
  v_phone       text;
  v_was_enabled boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select phone_number into v_phone from public.profiles where id = v_uid;
  select sms_enabled into v_was_enabled
  from public.notification_preferences where user_id = v_uid;

  update public.notification_preferences
  set sms_enabled = false, sms_opted_out_at = now(), updated_at = now()
  where user_id = v_uid;

  -- Log 'opted_out' ONLY if SMS was actually enabled — no duplicate events when
  -- disabling something already off. phone_number may be NULL (nullable by design).
  if v_was_enabled is true then
    insert into public.sms_consent_events(user_id, phone_number, action, consent_source)
    values (v_uid, v_phone, 'opted_out', 'app_settings');
  end if;
end;
$$;
revoke all on function public.disable_sms_alerts() from public, anon;
grant execute on function public.disable_sms_alerts() to authenticated;

-- NOTE (Phase 3): mark_phone_verified(p_phone, p_provider, p_method) — a SECURITY
-- DEFINER function the Telnyx Verify edge function calls on a successful check —
-- will set phone_verified_at/provider/method and insert a 'verification_completed'
-- consent event. It is intentionally NOT defined here (verification is Phase 3).
