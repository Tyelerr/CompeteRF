-- supabase/pending/20261004120000_referral_visits.sql   (PENDING — not applied)
--
-- Referral funnel analytics — SUPPLEMENTAL ONLY. claim_referral / referrals stay the authoritative
-- signup attribution and are not touched. A lost or missing visit never affects a referral.
--
-- One row per referral-link visit, with funnel milestones as timestamps:
--   created_at      Raw Click   (landing page ran; or the app was opened via a link / install)
--   app_opened_at   App Open    (the app was opened through the referral path)
--   installed_at    Install     (Android Play Install Referrer only — iOS has no per-user signal)
--   referral_id     Referral Claim (set after a successful claim_referral, if the visit is known)
-- Signups and verified users are measured from profiles / referrals, not here.
--
-- Stores coarse analytics ONLY: no IP address, no user-agent string, no device / advertising id,
-- no fingerprint. Raw clicks are gameable by design (anyone can load a link) — they are
-- analytics, never a reward trigger.
--
-- Access: no direct table writes for anyone; logged-out visitors can create a visit only through
-- log_referral_visit (rate-limited); reads are admin-only.

create table public.referral_visits (
  id               uuid primary key default gen_random_uuid(),   -- unguessable visit id
  referral_code_id bigint not null references public.referral_codes (id) on delete cascade,
  created_at       timestamptz not null default now(),
  channel          text not null,
  platform         text not null,
  campaign         text,
  app_opened_at    timestamptz,
  installed_at     timestamptz,
  referral_id      bigint references public.referrals (id) on delete set null,
  constraint referral_visits_channel_check  check (channel in ('web', 'app_link', 'install_referrer')),
  constraint referral_visits_platform_check check (platform in ('ios', 'android', 'desktop', 'unknown')),
  constraint referral_visits_campaign_check check (campaign is null or campaign ~ '^[A-Za-z0-9_.-]{1,64}$')
);
create index referral_visits_code_time_idx on public.referral_visits (referral_code_id, created_at desc);
create index referral_visits_time_idx      on public.referral_visits (created_at desc);
create index referral_visits_referral_idx  on public.referral_visits (referral_id) where referral_id is not null;

alter table public.referral_visits enable row level security;
revoke all on table public.referral_visits from public, anon, authenticated;
grant select on table public.referral_visits to authenticated;
create policy "Admins can view referral visits" on public.referral_visits
  as permissive for select to authenticated
  using (public._authz_is_admin());

-- ── log_referral_visit ─────────────────────────────────────────────────────────────────────
-- Records one Raw Click for an ACTIVE code and returns the new visit id (null if the code isn't
-- valid or a rate limit is hit — callers treat null as "not tracked", never as an error).
-- Rate limits (server side, rolling 60 s): 30 per code, 600 overall. Per-browser 24 h dedupe is
-- done by the client (it keeps its visit id) — the server holds no identity to dedupe on.
-- Unknown channel/platform values are coerced; a campaign that isn't a short slug is dropped.
create or replace function public.log_referral_visit(
  p_code text, p_channel text default 'web', p_platform text default 'unknown', p_campaign text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code_id  bigint;
  v_campaign text := nullif(btrim(coalesce(p_campaign, '')), '');
  v_id       uuid;
begin
  select rc.id into v_code_id
    from public.referral_codes rc
    join public.profiles p on p.id_auto = rc.profile_id
   where rc.code = upper(btrim(coalesce(p_code, '')))
     and rc.disabled_at is null
     and coalesce(p.status, 'active') = 'active'
     and not p.is_disabled
     and p.deleted_at is null;
  if v_code_id is null then
    return null;
  end if;

  if (select count(*) from public.referral_visits
       where referral_code_id = v_code_id and created_at > now() - interval '60 seconds') >= 30
     or (select count(*) from public.referral_visits
          where created_at > now() - interval '60 seconds') >= 600 then
    return null;
  end if;

  if v_campaign is not null and v_campaign !~ '^[A-Za-z0-9_.-]{1,64}$' then
    v_campaign := null;
  end if;

  insert into public.referral_visits (referral_code_id, channel, platform, campaign)
  values (v_code_id,
          case when p_channel in ('web', 'app_link', 'install_referrer') then p_channel else 'web' end,
          case when p_platform in ('ios', 'android', 'desktop', 'unknown') then p_platform else 'unknown' end,
          v_campaign)
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.log_referral_visit(text, text, text, text) from public;
grant execute on function public.log_referral_visit(text, text, text, text) to anon, authenticated;

-- ── mark_referral_visit ────────────────────────────────────────────────────────────────────
-- Sets App Open / Install on a known visit exactly once (first write wins), within 30 days of
-- the click. Knowing the (random) visit id is the only capability needed — it carries no data.
create or replace function public.mark_referral_visit(p_visit_id uuid, p_event text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if p_event = 'app_open' then
    update public.referral_visits set app_opened_at = now()
     where id = p_visit_id and app_opened_at is null and created_at > now() - interval '30 days';
  elsif p_event = 'install' then
    update public.referral_visits set installed_at = now()
     where id = p_visit_id and installed_at is null and created_at > now() - interval '30 days';
  else
    return false;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end
$$;
revoke all on function public.mark_referral_visit(uuid, text) from public;
grant execute on function public.mark_referral_visit(uuid, text) to anon, authenticated;

-- ── link_referral_visit ────────────────────────────────────────────────────────────────────
-- After a successful claim_referral, connect the caller's referral to the visit that brought
-- them. Only if: the caller HAS a referral, the visit's code belongs to that referral's referrer,
-- the visit isn't linked yet, and the click was within 30 days.
create or replace function public.link_referral_visit(p_visit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me       bigint := public._authz_my_id_auto();
  v_referral bigint;
  v_referrer bigint;
  n          int;
begin
  if v_me is null then
    return false;
  end if;
  select id, referrer_profile_id into v_referral, v_referrer
    from public.referrals where referred_profile_id = v_me;
  if v_referral is null or v_referrer is null then
    return false;
  end if;

  update public.referral_visits v
     set referral_id = v_referral
   where v.id = p_visit_id
     and v.referral_id is null
     and v.created_at > now() - interval '30 days'
     and exists (select 1 from public.referral_codes rc
                  where rc.id = v.referral_code_id and rc.profile_id = v_referrer);
  get diagnostics n = row_count;
  return n > 0;
end
$$;
revoke all on function public.link_referral_visit(uuid) from public, anon;
grant execute on function public.link_referral_visit(uuid) to authenticated;
