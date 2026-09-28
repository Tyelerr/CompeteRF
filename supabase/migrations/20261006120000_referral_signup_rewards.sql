-- supabase/pending/20261006120000_referral_signup_rewards.sql   (PENDING — not applied)
--
-- Referral signup rewards: when a NEW account successfully claims a referral, the REFERRER earns
-- +1 Giveaway Entry through the existing wallet ledger. Server-side only — the client never
-- decides or requests a reward; it just calls claim_referral exactly as today.
--
-- Rules (product decisions):
--   • Qualifying event = a successful claim_referral insert (signup + valid claim). Raw visits,
--     /r clicks and the client's pending-referral storage never reward anything.
--   • Referrer only, +1 entry, at most once per referral (idempotency key referral_signup:<id>,
--     plus the referral row lock + status). referrals.referred_profile_id is already UNIQUE, so a
--     referred account can only ever belong to — and reward — one referrer.
--   • Cap: 25 referral rewards per referrer per calendar month (America/Phoenix, the business
--     timezone already used for recurring tournaments), counted from the authoritative ledger
--     under the referrer's wallet-row lock. Over the cap the referral still attributes normally and
--     is marked 'capped' — it never pays out later.
--   • Not retroactive: every referral that exists when this migration runs is 'not_eligible'.
--
-- Attribution survives reward failure: the reward runs in its own sub-block inside claim_referral;
-- an error rolls back only the reward attempt and marks the referral 'failed'. A failed/pending
-- reward is retried idempotently when the referred user's claim is re-sent (already_claimed path)
-- or by a super admin via retry_referral_signup_reward(referral_id).
--
-- Unchanged: claim_referral's outcomes/statuses, the 7-day window, self/mutual-referral rules,
-- _giveaway_wallet_apply, wallet spend/refund/draw, admin grant/revoke, the wallet publish hold,
-- referral_visits, and all client code paths.

-- ── 1. Ledger: allow the new earning reason ────────────────────────────────────────────────
alter table public.giveaway_credit_ledger drop constraint giveaway_credit_ledger_reason_check;
alter table public.giveaway_credit_ledger add constraint giveaway_credit_ledger_reason_check
  check (reason in ('admin_grant', 'admin_revoke', 'giveaway_spend', 'giveaway_refund',
                    'referral_signup_reward'));

-- Fast monthly-cap count per referrer.
create index if not exists giveaway_credit_ledger_referral_reward_idx
  on public.giveaway_credit_ledger (profile_id, created_at)
  where reason = 'referral_signup_reward';

-- ── 2. Referral reward state ───────────────────────────────────────────────────────────────
-- 'rewarded' is also provable from the ledger (referral_id + idempotency key); the column records
-- the decisions the ledger can't: capped, failed (retryable), not_eligible.
--   pending       new referral, reward not decided yet (only transiently inside claim_referral)
--   rewarded      +1 granted (ledger row references this referral)
--   capped        referrer was at the monthly cap — permanently no reward for this referral
--   failed        reward attempt errored — retryable, idempotent
--   not_eligible  pre-launch referral, or the referrer account no longer exists
-- Existing rows get 'not_eligible' from the ADD COLUMN default (non-retroactive); new rows then
-- default to 'pending'.
alter table public.referrals
  add column reward_status text not null default 'not_eligible',
  add column reward_decided_at timestamptz;
alter table public.referrals alter column reward_status set default 'pending';
alter table public.referrals add constraint referrals_reward_status_check
  check (reward_status in ('pending', 'rewarded', 'capped', 'failed', 'not_eligible'));

-- ── 3. The reward step (server-internal) ───────────────────────────────────────────────────
create or replace function public._referral_issue_signup_reward(p_referral_id bigint)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_monthly_cap constant integer := 25;
  c_tz          constant text := 'America/Phoenix';
  v_status      text;
  v_referrer    bigint;
  v_month_start timestamptz;
  v_used        integer;
begin
  -- Lock the referral: concurrent attempts for the same referral serialize here.
  select reward_status, referrer_profile_id into v_status, v_referrer
    from public.referrals where id = p_referral_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_status not in ('pending', 'failed') then
    return v_status;                         -- already decided: rewarded / capped / not_eligible
  end if;

  if v_referrer is null then                 -- referrer account deleted before the reward
    update public.referrals set reward_status = 'not_eligible', reward_decided_at = now()
     where id = p_referral_id;
    return 'not_eligible';
  end if;

  -- Serialize the monthly-cap check per referrer on their wallet row (the same row
  -- _giveaway_wallet_apply locks), so two simultaneous claims can't both take the 25th slot.
  insert into public.giveaway_wallets (profile_id) values (v_referrer) on conflict do nothing;
  perform 1 from public.giveaway_wallets where profile_id = v_referrer for update;

  v_month_start := date_trunc('month', now() at time zone c_tz) at time zone c_tz;
  select count(*) into v_used
    from public.giveaway_credit_ledger
   where profile_id = v_referrer
     and reason = 'referral_signup_reward'
     and created_at >= v_month_start;

  if v_used >= c_monthly_cap then
    update public.referrals set reward_status = 'capped', reward_decided_at = now()
     where id = p_referral_id;
    return 'capped';
  end if;

  -- Deterministic key: even if the status write were lost, a second grant is a no-op.
  perform public._giveaway_wallet_apply(
    v_referrer, 1, 'referral_signup_reward', null, p_referral_id,
    'referral_signup:' || p_referral_id, null, 'Referral signup reward');

  update public.referrals set reward_status = 'rewarded', reward_decided_at = now()
   where id = p_referral_id;
  return 'rewarded';
end
$$;
revoke all on function public._referral_issue_signup_reward(bigint) from public, anon, authenticated;

-- Runs the reward step without ever breaking the caller: an error rolls back only the reward
-- attempt (sub-transaction) and marks the referral 'failed' for a later idempotent retry.
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
    update public.referrals set reward_status = 'failed', reward_decided_at = now()
     where id = p_referral_id and reward_status in ('pending', 'failed');
    return 'failed';
  end;
  return v_result;
end
$$;
revoke all on function public._referral_try_signup_reward(bigint) from public, anon, authenticated;

-- ── 4. claim_referral: identical rules and outcomes + the reward step ─────────────────────
-- Only two additions (marked ★): reward after a new claim, and an idempotent retry of a
-- pending/failed reward when the same referral is re-claimed. The returned jsonb is unchanged.
create or replace function public.claim_referral(p_code text, p_source text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_window   constant interval := interval '7 days';
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
    -- ★ Same referral re-claimed: retry a pending/failed reward (idempotent; no-op otherwise).
    if v_existing = v_owner then
      perform public._referral_try_signup_reward(r.id)
         from public.referrals r
        where r.referred_profile_id = v_me and r.reward_status in ('pending', 'failed');
    end if;
    return jsonb_build_object('ok', v_existing = v_owner,
      'status', case when v_existing = v_owner then 'already_claimed' else 'already_attributed' end);
  end if;

  -- Window measured from auth.users.created_at: server-set, unlike profiles.created_at, which the
  -- client can write on insert and on its own-row update.
  select created_at into v_signup from auth.users where id = v_uid;
  if v_signup is null or v_signup < now() - c_window then
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
    -- Lost a concurrent race: report what won.
    select referrer_profile_id into v_existing from public.referrals where referred_profile_id = v_me;
    return jsonb_build_object('ok', v_existing = v_owner,
      'status', case when v_existing = v_owner then 'already_claimed' else 'already_attributed' end);
  end if;

  -- ★ Referrer's +1 Giveaway Entry. Never fails the claim: attribution above is kept even if the
  -- reward step errors (it is then marked 'failed' and retried idempotently later).
  perform public._referral_try_signup_reward(v_new_id);

  return jsonb_build_object('ok', true, 'status', 'claimed');
end
$$;
revoke all on function public.claim_referral(text, text) from public, anon;
grant execute on function public.claim_referral(text, text) to authenticated;

-- ── 5. Super-admin recovery for a failed reward (idempotent) ──────────────────────────────
create or replace function public.retry_referral_signup_reward(p_referral_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public._giveaway_is_admin() then
    return jsonb_build_object('ok', false, 'status', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'status', public._referral_try_signup_reward(p_referral_id));
end
$$;
revoke all on function public.retry_referral_signup_reward(bigint) from public, anon;
grant execute on function public.retry_referral_signup_reward(bigint) to authenticated;
