-- supabase/migrations/20261015120000_giveaway_earning_rules.sql
--
-- Configurable Giveaway-Entry earning (referrals) + wallet giveaway "end by date".
--
-- 1. Earning rules — one server-side row (giveaway_earning_rules) that Super Admin edits from web
--    Giveaway Management → Earning Rules via set_giveaway_earning_rules (validated, audit_log'd).
--    Seeded with today's live values (+1 referrer, 7-day window, 25/month cap) plus the new V1
--    rules: +1 for the newly referred user and milestone bonuses 5/10/25/50 → +5 each.
-- 2. Referral reward step (_referral_issue_signup_reward) now reads those rules and, per successful
--    referral claim, independently and idempotently:
--      a. referrer  +N  (reason referral_signup_reward,   key referral_signup:<referral_id>)
--         — the ONLY credit counted against the monthly cap (cap applies to this credit only);
--      b. referred  +N  (reason referral_referred_reward, key referral_referred:<referral_id>)
--         — never capped (one referral per profile, forever);
--      c. milestone bonuses (reason referral_milestone_bonus,
--         key referral_milestone:<referrer>:<threshold>, + UNIQUE(referrer, threshold) row) once per
--         threshold; "successful referrals" = the referrer's referrals whose referrer credit was
--         rewarded or capped (i.e. attributions made while rewards were enabled);
--      d. velocity flag: more than <velocity_flag_threshold> referrals for one referrer within 24 h
--         marks the referral flagged for Super Admin review. The reward is NOT withheld.
--    Disabled rewards → credits are recorded 'not_eligible' (attribution itself is unchanged).
--    Non-retroactive: existing referrals (none in production at authoring time) keep their referrer
--    status and get referred_reward_status 'not_eligible'.
-- 3. claim_referral: unchanged rules/outcomes; the attribution window now comes from the rules row
--    (default 7 days), and a re-claim retries a pending/failed credit for either party.
-- 4. Wallet giveaways may end by DATE only (no capacity): the capacity CHECK now accepts an end date
--    instead, and the guard trigger's capacity floor applies only when a capacity is set
--    (enter_wallet_giveaway already treats a null capacity as unlimited).
-- 5. _giveaway_end_due_sweep (pg_cron, every 5 min): active giveaways past their end date OR at
--    capacity become 'ended' — "whichever happens first" is enforced server-side for both entry
--    methods (today date-ended giveaways stayed 'active' until an admin pressed End).
--
-- Unchanged: wallet apply/spend/refund/draw/cancel, the wallet PUBLISH HOLD (publish_giveaway is not
-- touched), referral attribution rules (self/mutual/one-referrer/window from auth.users), codes,
-- visits, RLS on existing tables. Entries never expire (no expiry anywhere).

-- ── 1. Ledger reasons ───────────────────────────────────────────────────────────────────────
alter table public.giveaway_credit_ledger drop constraint giveaway_credit_ledger_reason_check;
alter table public.giveaway_credit_ledger add constraint giveaway_credit_ledger_reason_check
  check (reason in ('admin_grant', 'admin_revoke', 'giveaway_spend', 'giveaway_refund',
                    'referral_signup_reward', 'referral_referred_reward', 'referral_milestone_bonus'));

-- ── 2. Earning rules (single row) ─────────────────────────────────────────────────────────
-- Milestones: [{ "threshold": int 1..100000, "bonus": int 0..1000 }], ≤ 20 items, unique thresholds.
create or replace function public._earning_milestones_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 20
     and not exists (
       select 1 from jsonb_array_elements(p) m
        where jsonb_typeof(m) <> 'object'
           or jsonb_typeof(m->'threshold') <> 'number' or jsonb_typeof(m->'bonus') <> 'number'
           or (m->>'threshold')::numeric <> trunc((m->>'threshold')::numeric)
           or (m->>'bonus')::numeric <> trunc((m->>'bonus')::numeric)
           or (m->>'threshold')::numeric not between 1 and 100000
           or (m->>'bonus')::numeric not between 0 and 1000)
     and (select count(*) = count(distinct (m->>'threshold')::numeric) from jsonb_array_elements(p) m)
$$;

create table public.giveaway_earning_rules (
  id                        boolean primary key default true,
  referral_rewards_enabled  boolean not null default true,
  referrer_reward           integer not null default 1,
  referred_reward           integer not null default 1,
  attribution_window_days   integer not null default 7,
  monthly_referrer_cap      integer not null default 25,
  velocity_flag_threshold   integer not null default 5,
  milestones_enabled        boolean not null default true,
  milestones                jsonb   not null default
    '[{"threshold":5,"bonus":5},{"threshold":10,"bonus":5},{"threshold":25,"bonus":5},{"threshold":50,"bonus":5}]'::jsonb,
  updated_at                timestamptz not null default now(),
  updated_by                bigint references public.profiles (id_auto) on delete set null,
  constraint giveaway_earning_rules_singleton check (id),
  constraint giveaway_earning_rules_referrer_reward check (referrer_reward between 0 and 100),
  constraint giveaway_earning_rules_referred_reward check (referred_reward between 0 and 100),
  constraint giveaway_earning_rules_window check (attribution_window_days between 1 and 90),
  constraint giveaway_earning_rules_cap check (monthly_referrer_cap between 0 and 1000),
  constraint giveaway_earning_rules_velocity check (velocity_flag_threshold between 1 and 1000),
  constraint giveaway_earning_rules_milestones check (public._earning_milestones_valid(milestones))
);
insert into public.giveaway_earning_rules default values;

alter table public.giveaway_earning_rules enable row level security;
revoke all on table public.giveaway_earning_rules from public, anon, authenticated;
grant select on table public.giveaway_earning_rules to authenticated;
create policy "Giveaway admins can view earning rules" on public.giveaway_earning_rules
  as permissive for select to authenticated using (public._giveaway_is_admin());

-- ── 3. Milestone awards (one row per referrer per threshold, forever) ─────────────────────
create table public.referral_milestone_awards (
  id                  bigint generated always as identity primary key,
  -- CASCADE: an award row is a per-profile marker; the ledger row (profile FK RESTRICT) is the
  -- durable credit record.
  referrer_profile_id bigint not null references public.profiles (id_auto) on delete cascade,
  threshold           integer not null check (threshold > 0),
  bonus               integer not null check (bonus >= 0),
  referral_count      integer not null,
  referral_id         bigint references public.referrals (id) on delete set null,
  ledger_id           bigint references public.giveaway_credit_ledger (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint referral_milestone_awards_once unique (referrer_profile_id, threshold)
);
alter table public.referral_milestone_awards enable row level security;
revoke all on table public.referral_milestone_awards from public, anon, authenticated;
grant select on table public.referral_milestone_awards to authenticated;
create policy "Users can view own milestone awards" on public.referral_milestone_awards
  as permissive for select to authenticated using (referrer_profile_id = public._authz_my_id_auto());
create policy "Giveaway admins can view milestone awards" on public.referral_milestone_awards
  as permissive for select to authenticated using (public._giveaway_is_admin());

-- ── 4. Referral row: referred-user credit state + review flag ─────────────────────────────
alter table public.referrals
  add column referred_reward_status     text not null default 'not_eligible',
  add column referred_reward_decided_at timestamptz,
  add column flagged_at                 timestamptz,
  add column flag_reason                text,
  add column flag_reviewed_at           timestamptz,
  add column flag_reviewed_by           bigint references public.profiles (id_auto) on delete set null;
alter table public.referrals alter column referred_reward_status set default 'pending';
alter table public.referrals add constraint referrals_referred_reward_status_check
  check (referred_reward_status in ('pending', 'rewarded', 'capped', 'failed', 'not_eligible'));
create index if not exists referrals_flagged_idx on public.referrals (flagged_at) where flagged_at is not null;
create index if not exists referrals_referrer_created_idx on public.referrals (referrer_profile_id, created_at);

-- ── 5. The reward step (server-internal) ──────────────────────────────────────────────────
create or replace function public._referral_issue_signup_reward(p_referral_id bigint)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_tz          constant text := 'America/Phoenix';
  rr            public.giveaway_earning_rules%rowtype;
  ref           public.referrals%rowtype;
  v_enabled     boolean;
  v_month_start timestamptz;
  v_used        integer;
  v_count       integer;
  v_threshold   integer;
  v_bonus       integer;
  v_award       bigint;
  v_res         jsonb;
  m             jsonb;
begin
  -- Lock the referral: concurrent attempts for the same referral serialize here.
  select * into ref from public.referrals where id = p_referral_id for update;
  if not found then
    return 'not_found';
  end if;
  select * into rr from public.giveaway_earning_rules where id;
  v_enabled := coalesce(rr.referral_rewards_enabled, false);

  -- Serialize everything per referrer on their wallet row (the row _giveaway_wallet_apply locks):
  -- the monthly-cap count and the milestone count can't race a concurrent claim.
  if ref.referrer_profile_id is not null then
    insert into public.giveaway_wallets (profile_id) values (ref.referrer_profile_id) on conflict do nothing;
    perform 1 from public.giveaway_wallets where profile_id = ref.referrer_profile_id for update;
  end if;

  -- a. Referrer's per-referral credit (the only credit the monthly cap applies to).
  if ref.reward_status in ('pending', 'failed') then
    if not v_enabled or rr.referrer_reward <= 0 or ref.referrer_profile_id is null then
      ref.reward_status := 'not_eligible';
    else
      v_month_start := date_trunc('month', now() at time zone c_tz) at time zone c_tz;
      select count(*) into v_used
        from public.giveaway_credit_ledger
       where profile_id = ref.referrer_profile_id
         and reason = 'referral_signup_reward'
         and created_at >= v_month_start;
      if v_used >= rr.monthly_referrer_cap then
        ref.reward_status := 'capped';
      else
        perform public._giveaway_wallet_apply(
          ref.referrer_profile_id, rr.referrer_reward, 'referral_signup_reward', null, ref.id,
          'referral_signup:' || ref.id, null, 'Referral reward');
        ref.reward_status := 'rewarded';
      end if;
    end if;
    update public.referrals set reward_status = ref.reward_status, reward_decided_at = now() where id = ref.id;
  end if;

  -- b. Newly referred user's credit (never capped: one referral per profile, forever).
  if ref.referred_reward_status in ('pending', 'failed') then
    if not v_enabled or rr.referred_reward <= 0 then
      ref.referred_reward_status := 'not_eligible';
    else
      perform public._giveaway_wallet_apply(
        ref.referred_profile_id, rr.referred_reward, 'referral_referred_reward', null, ref.id,
        'referral_referred:' || ref.id, null, 'Welcome bonus: joined through a referral');
      ref.referred_reward_status := 'rewarded';
    end if;
    update public.referrals set referred_reward_status = ref.referred_reward_status, referred_reward_decided_at = now()
     where id = ref.id;
  end if;

  if ref.referrer_profile_id is not null then
    -- d. Velocity flag (review only — never withholds a credit).
    if ref.flagged_at is null then
      select count(*) into v_count from public.referrals
       where referrer_profile_id = ref.referrer_profile_id and created_at > now() - interval '24 hours';
      if v_count > coalesce(rr.velocity_flag_threshold, 5) then
        update public.referrals
           set flagged_at = now(),
               flag_reason = format('%s referrals by this referrer in 24 hours (review threshold %s)',
                                    v_count, rr.velocity_flag_threshold)
         where id = ref.id;
      end if;
    end if;

    -- c. Milestone bonuses, once per threshold.
    if v_enabled and coalesce(rr.milestones_enabled, false) then
      select count(*) into v_count from public.referrals
       where referrer_profile_id = ref.referrer_profile_id and reward_status in ('rewarded', 'capped');
      for m in select value from jsonb_array_elements(rr.milestones) order by (value->>'threshold')::numeric loop
        v_threshold := (m->>'threshold')::numeric::int;
        v_bonus     := (m->>'bonus')::numeric::int;
        exit when v_count < v_threshold;
        continue when v_bonus <= 0;
        v_award := null;
        insert into public.referral_milestone_awards (referrer_profile_id, threshold, bonus, referral_count, referral_id)
        values (ref.referrer_profile_id, v_threshold, v_bonus, v_count, ref.id)
        on conflict on constraint referral_milestone_awards_once do nothing
        returning id into v_award;
        if v_award is not null then
          v_res := public._giveaway_wallet_apply(
            ref.referrer_profile_id, v_bonus, 'referral_milestone_bonus', null, ref.id,
            'referral_milestone:' || ref.referrer_profile_id || ':' || v_threshold, null,
            format('Referral milestone: %s successful referrals', v_threshold));
          update public.referral_milestone_awards set ledger_id = (v_res->>'ledger_id')::bigint where id = v_award;
        end if;
      end loop;
    end if;
  end if;

  return ref.reward_status;
end
$$;
revoke all on function public._referral_issue_signup_reward(bigint) from public, anon, authenticated;

-- Never breaks the caller: an error rolls back only the reward attempt (sub-transaction) and marks
-- whichever credit was still undecided 'failed' for a later idempotent retry.
create or replace function public._referral_try_signup_reward(p_referral_id bigint)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result text;
begin
  begin
    v_result := public._referral_issue_signup_reward(p_referral_id);
  exception when others then
    update public.referrals
       set reward_status = case when reward_status in ('pending', 'failed') then 'failed' else reward_status end,
           reward_decided_at = case when reward_status in ('pending', 'failed') then now() else reward_decided_at end,
           referred_reward_status = case when referred_reward_status in ('pending', 'failed') then 'failed' else referred_reward_status end,
           referred_reward_decided_at = case when referred_reward_status in ('pending', 'failed') then now() else referred_reward_decided_at end
     where id = p_referral_id;
    return 'failed';
  end;
  return v_result;
end
$$;
revoke all on function public._referral_try_signup_reward(bigint) from public, anon, authenticated;

-- ── 6. claim_referral: identical rules/outcomes; window from the rules row ─────────────────
create or replace function public.claim_referral(p_code text, p_source text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window   interval := make_interval(days => coalesce(
               (select attribution_window_days from public.giveaway_earning_rules where id), 7));
  v_uid      uuid := auth.uid();
  v_me       bigint;
  v_signup   timestamptz;
  v_code_id  bigint;
  v_owner    bigint;
  v_existing bigint;
  v_new_id   bigint;
  v_source   text := case when p_source in ('link', 'manual') then p_source else 'manual' end;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'status', 'not_authenticated');
  end if;

  select id_auto into v_me from public.profiles where id = v_uid;
  if v_me is null then
    return jsonb_build_object('ok', false, 'status', 'no_profile');
  end if;

  select rc.id, rc.profile_id into v_code_id, v_owner
    from public.referral_codes rc
    join public.profiles p on p.id_auto = rc.profile_id
   where rc.code = upper(btrim(coalesce(p_code, '')))
     and rc.disabled_at is null
     and coalesce(p.status, 'active') = 'active'
     and not p.is_disabled
     and p.deleted_at is null;
  if v_code_id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid_code');
  end if;

  if v_owner = v_me then
    return jsonb_build_object('ok', false, 'status', 'self_referral');
  end if;

  -- Existing attribution wins, always (checked before the window so repeats stay idempotent).
  select referrer_profile_id into v_existing from public.referrals where referred_profile_id = v_me;
  if found then
    -- Same referral re-claimed: retry a pending/failed credit for either party (idempotent).
    if v_existing = v_owner then
      perform public._referral_try_signup_reward(r.id)
         from public.referrals r
        where r.referred_profile_id = v_me
          and (r.reward_status in ('pending', 'failed') or r.referred_reward_status in ('pending', 'failed'));
    end if;
    return jsonb_build_object('ok', v_existing = v_owner,
      'status', case when v_existing = v_owner then 'already_claimed' else 'already_attributed' end);
  end if;

  -- Window measured from auth.users.created_at (server-set; profiles.created_at is client-writable).
  select created_at into v_signup from auth.users where id = v_uid;
  if v_signup is null or v_signup < now() - v_window then
    return jsonb_build_object('ok', false, 'status', 'window_expired');
  end if;

  if exists (select 1 from public.referrals
              where referred_profile_id = v_owner and referrer_profile_id = v_me) then
    return jsonb_build_object('ok', false, 'status', 'mutual_referral');
  end if;

  insert into public.referrals (referred_profile_id, referrer_profile_id, referral_code_id, source)
  values (v_me, v_owner, v_code_id, v_source)
  on conflict (referred_profile_id) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select referrer_profile_id into v_existing from public.referrals where referred_profile_id = v_me;
    return jsonb_build_object('ok', v_existing = v_owner,
      'status', case when v_existing = v_owner then 'already_claimed' else 'already_attributed' end);
  end if;

  -- Credits per the earning rules. Never fails the claim (attribution above is kept).
  perform public._referral_try_signup_reward(v_new_id);

  return jsonb_build_object('ok', true, 'status', 'claimed');
end
$$;
revoke all on function public.claim_referral(text, text) from public, anon;
grant execute on function public.claim_referral(text, text) to authenticated;

-- ── 7. Super Admin RPCs ───────────────────────────────────────────────────────────────────
create or replace function public._earning_rules_json(rr public.giveaway_earning_rules)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'referral_rewards_enabled', rr.referral_rewards_enabled,
    'referrer_reward', rr.referrer_reward,
    'referred_reward', rr.referred_reward,
    'attribution_window_days', rr.attribution_window_days,
    'monthly_referrer_cap', rr.monthly_referrer_cap,
    'velocity_flag_threshold', rr.velocity_flag_threshold,
    'milestones_enabled', rr.milestones_enabled,
    'milestones', rr.milestones,
    'updated_at', rr.updated_at,
    'updated_by_name', (select name from public.profiles where id_auto = rr.updated_by))
$$;
revoke all on function public._earning_rules_json(public.giveaway_earning_rules) from public, anon, authenticated;

create or replace function public.get_giveaway_earning_rules()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  rr public.giveaway_earning_rules%rowtype;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix';
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into rr from public.giveaway_earning_rules where id;
  return jsonb_build_object(
    'rules', public._earning_rules_json(rr),
    'stats', jsonb_build_object(
      'referrals_total', (select count(*) from public.referrals),
      'referrals_this_month', (select count(*) from public.referrals where created_at >= v_month_start),
      'referrer_credits_this_month', (select coalesce(sum(delta), 0) from public.giveaway_credit_ledger
                                       where reason = 'referral_signup_reward' and created_at >= v_month_start),
      'referred_credits_this_month', (select coalesce(sum(delta), 0) from public.giveaway_credit_ledger
                                       where reason = 'referral_referred_reward' and created_at >= v_month_start),
      'milestone_awards_total', (select count(*) from public.referral_milestone_awards),
      'capped_total', (select count(*) from public.referrals where reward_status = 'capped'),
      'flagged_open', (select count(*) from public.referrals where flagged_at is not null and flag_reviewed_at is null)));
end
$$;
revoke all on function public.get_giveaway_earning_rules() from public, anon;
grant execute on function public.get_giveaway_earning_rules() to authenticated;

-- Partial update: only keys present in p_rules change. Validated; every change is audit_log'd.
create or replace function public.set_giveaway_earning_rules(p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     bigint := public._authz_my_id_auto();
  v_before public.giveaway_earning_rules%rowtype;
  v_after  public.giveaway_earning_rules%rowtype;
  k        text;
  c_bool   constant text[] := array['referral_rewards_enabled', 'milestones_enabled'];
  c_int    constant text[] := array['referrer_reward', 'referred_reward', 'attribution_window_days',
                                    'monthly_referrer_cap', 'velocity_flag_threshold'];
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    return jsonb_build_object('ok', false, 'status', 'invalid', 'field', null);
  end if;
  for k in select jsonb_object_keys(p_rules) loop
    if k = any (c_bool) then
      if jsonb_typeof(p_rules->k) <> 'boolean' then
        return jsonb_build_object('ok', false, 'status', 'invalid', 'field', k);
      end if;
    elsif k = any (c_int) then
      if jsonb_typeof(p_rules->k) <> 'number' or (p_rules->>k)::numeric <> trunc((p_rules->>k)::numeric) then
        return jsonb_build_object('ok', false, 'status', 'invalid', 'field', k);
      end if;
    elsif k = 'milestones' then
      if not public._earning_milestones_valid(p_rules->k) then
        return jsonb_build_object('ok', false, 'status', 'invalid', 'field', k);
      end if;
    else
      return jsonb_build_object('ok', false, 'status', 'unknown_field', 'field', k);
    end if;
  end loop;

  select * into v_before from public.giveaway_earning_rules where id for update;
  begin
    update public.giveaway_earning_rules set
      referral_rewards_enabled = coalesce((p_rules->>'referral_rewards_enabled')::boolean, referral_rewards_enabled),
      referrer_reward          = coalesce((p_rules->>'referrer_reward')::numeric::int, referrer_reward),
      referred_reward          = coalesce((p_rules->>'referred_reward')::numeric::int, referred_reward),
      attribution_window_days  = coalesce((p_rules->>'attribution_window_days')::numeric::int, attribution_window_days),
      monthly_referrer_cap     = coalesce((p_rules->>'monthly_referrer_cap')::numeric::int, monthly_referrer_cap),
      velocity_flag_threshold  = coalesce((p_rules->>'velocity_flag_threshold')::numeric::int, velocity_flag_threshold),
      milestones_enabled       = coalesce((p_rules->>'milestones_enabled')::boolean, milestones_enabled),
      milestones               = coalesce(
        (select jsonb_agg(jsonb_build_object('threshold', (m->>'threshold')::numeric::int,
                                             'bonus', (m->>'bonus')::numeric::int)
                          order by (m->>'threshold')::numeric)
           from jsonb_array_elements(p_rules->'milestones') m),
        case when p_rules ? 'milestones' then '[]'::jsonb else milestones end),
      updated_at = now(),
      updated_by = v_me
    where id
    returning * into v_after;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'status', 'out_of_range', 'field', null);
  end;

  insert into public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
  values (v_me, 'super_admin', 'giveaway_earning_rules.update', 'giveaway_earning_rules', null,
          jsonb_build_object('before', public._earning_rules_json(v_before),
                             'after', public._earning_rules_json(v_after),
                             'changed', p_rules));

  return jsonb_build_object('ok', true, 'status', 'saved', 'rules', public._earning_rules_json(v_after));
end
$$;
revoke all on function public.set_giveaway_earning_rules(jsonb) from public, anon;
grant execute on function public.set_giveaway_earning_rules(jsonb) to authenticated;

-- Flagged referrals for review (open first, then the 25 most recently reviewed). Names only.
create or replace function public.list_flagged_referrals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'reviewed_at' nulls first, x->>'flagged_at' desc)
      from (
        select jsonb_build_object(
                 'id', r.id, 'created_at', r.created_at, 'flagged_at', r.flagged_at,
                 'flag_reason', r.flag_reason, 'reviewed_at', r.flag_reviewed_at,
                 'reward_status', r.reward_status, 'referred_reward_status', r.referred_reward_status,
                 'referrer_id', r.referrer_profile_id, 'referrer_name', pr.name, 'referrer_username', pr.user_name,
                 'referred_id', r.referred_profile_id, 'referred_name', pd.name, 'referred_username', pd.user_name) x
          from public.referrals r
          left join public.profiles pr on pr.id_auto = r.referrer_profile_id
          left join public.profiles pd on pd.id_auto = r.referred_profile_id
         where r.flagged_at is not null
           and (r.flag_reviewed_at is null
                or r.id in (select id from public.referrals where flag_reviewed_at is not null
                             order by flag_reviewed_at desc limit 25))
      ) s), '[]'::jsonb);
end
$$;
revoke all on function public.list_flagged_referrals() from public, anon;
grant execute on function public.list_flagged_referrals() to authenticated;

create or replace function public.review_referral_flag(p_referral_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me bigint := public._authz_my_id_auto();
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.referrals set flag_reviewed_at = now(), flag_reviewed_by = v_me
   where id = p_referral_id and flagged_at is not null and flag_reviewed_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_flagged_or_already_reviewed');
  end if;
  insert into public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
  values (v_me, 'super_admin', 'referral_flag.reviewed', 'referral', p_referral_id::int, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'status', 'reviewed');
end
$$;
revoke all on function public.review_referral_flag(bigint) from public, anon;
grant execute on function public.review_referral_flag(bigint) to authenticated;

-- ── 8. Wallet giveaways may end by date only ───────────────────────────────────────────────
alter table public.giveaways drop constraint giveaways_wallet_capacity;
alter table public.giveaways add constraint giveaways_wallet_capacity
  check (entry_mode <> 'wallet' or coalesce(max_entries, 0) > 0 or end_date is not null);

-- Guard trigger: verbatim from production except the capacity floor, which now applies only when a
-- capacity is set (a date-only wallet giveaway has max_entries NULL = unlimited).
create or replace function public.tg_giveaways_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op       text := public._giveaway_op();
  v_sum      bigint;
  v_max_mine integer;
begin
  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then
      raise exception 'giveaways cannot be created cancelled' using errcode = '42501';
    end if;
    -- Wallet giveaways always start as a draft (so the native launch hold in publish_giveaway
    -- can't be skipped by inserting them live).
    if new.entry_mode = 'wallet' and (new.status <> 'draft' or new.winner_id is not null) then
      raise exception 'wallet giveaways must be created as a draft' using errcode = '42501';
    end if;
    -- Older app versions still create legacy giveaways directly as active: stamp them published.
    if new.status = 'active' and new.published_at is null then
      new.published_at := now();
    end if;
    return new;
  end if;

  -- Drafts go live only through publish_giveaway (validation, wallet launch hold, one notification).
  if old.status = 'draft' and new.status not in ('draft', 'archived') and v_op <> 'publish' then
    raise exception 'drafts are published only through publish_giveaway' using errcode = '42501';
  end if;
  -- Nor can a never-published draft become active via archive → Restore.
  if new.status = 'active' and old.status <> 'active' and new.published_at is null and v_op <> 'publish' then
    raise exception 'this giveaway has never been published; use publish_giveaway' using errcode = '42501';
  end if;

  if new.entry_mode is distinct from old.entry_mode
     and exists (select 1 from public.giveaway_entries where giveaway_id = old.id) then
    raise exception 'entry mode cannot change after entries exist' using errcode = '42501';
  end if;

  -- Cancelled is terminal (other columns may still change, e.g. FK SET NULL on cancelled_by).
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'a cancelled giveaway cannot be reopened' using errcode = '42501';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and v_op <> 'cancel' then
    raise exception 'giveaways can only be cancelled through cancel_wallet_giveaway' using errcode = '42501';
  end if;

  if new.entry_mode = 'wallet' and v_op <> 'draw' then
    -- A winner can be cleared (account deletion) but never set/changed outside the draw function.
    if new.winner_id is not null and new.winner_id is distinct from old.winner_id then
      raise exception 'wallet giveaway winners are drawn only through draw_wallet_giveaway' using errcode = '42501';
    end if;
    if new.status = 'awarded' and old.status <> 'awarded'
       and not (old.status = 'archived' and old.winner_id is not null and new.winner_id = old.winner_id) then
      raise exception 'wallet giveaways are awarded only through draw_wallet_giveaway' using errcode = '42501';
    end if;
  end if;

  if new.entry_mode = 'wallet' then
    if new.status = 'archived' and old.status not in ('archived', 'awarded')
       and exists (select 1 from public.giveaway_entries where giveaway_id = old.id) then
      raise exception 'draw or cancel (refund) a wallet giveaway before archiving it' using errcode = '42501';
    end if;

    select coalesce(sum(quantity), 0), coalesce(max(quantity), 0) into v_sum, v_max_mine
      from public.giveaway_entries where giveaway_id = old.id;
    if new.max_entries is not null and new.max_entries < v_sum then
      raise exception 'capacity cannot be lowered below the % entries already in the giveaway', v_sum
        using errcode = '23514';
    end if;
    if new.per_user_max is not null and new.per_user_max < v_max_mine then
      raise exception 'per-user max cannot be lowered below an entrant''s existing % entries', v_max_mine
        using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

-- ── 9. End-by-date / capacity sweep ("whichever happens first", both entry methods) ───────
create or replace function public._giveaway_end_due_sweep()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.giveaways g
     set status = 'ended', ended_at = now(), updated_at = now()
   where g.status = 'active'
     and ((g.end_date is not null and g.end_date <= now())
          or (g.max_entries is not null
              and (select coalesce(sum(e.quantity), 0) from public.giveaway_entries e where e.giveaway_id = g.id)
                  >= g.max_entries));
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function public._giveaway_end_due_sweep() from public, anon, authenticated;

select cron.schedule('giveaway-end-sweep', '*/5 * * * *', 'select public._giveaway_end_due_sweep()');
