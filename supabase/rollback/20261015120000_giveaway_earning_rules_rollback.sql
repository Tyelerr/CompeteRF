-- supabase/rollback/20261015120000_giveaway_earning_rules_rollback.sql
--
-- Reverts 20261015120000_giveaway_earning_rules.sql. Restores the previous claim_referral /
-- reward functions (verbatim from 20261006120000) and tg_giveaways_guard (verbatim from production
-- before this migration), the wallet-capacity CHECK and the ledger reason list; drops the earning
-- rules, milestone awards, referral review/referred-credit columns, admin RPCs and the end sweep.
--
-- Refuses to run once the new behaviour has produced data that the old schema can't hold:
-- referred-user / milestone ledger credits, or a date-only (no capacity) wallet giveaway.

do $guard$
begin
  if exists (select 1 from public.giveaway_credit_ledger
              where reason in ('referral_referred_reward', 'referral_milestone_bonus')) then
    raise exception 'rollback refused: referred-user or milestone credits exist in the ledger';
  end if;
  if exists (select 1 from public.giveaways where entry_mode = 'wallet' and coalesce(max_entries, 0) <= 0) then
    raise exception 'rollback refused: a date-only wallet giveaway exists';
  end if;
end
$guard$;

select cron.unschedule('giveaway-end-sweep')
 where exists (select 1 from cron.job where jobname = 'giveaway-end-sweep');
drop function if exists public._giveaway_end_due_sweep();

alter table public.giveaways drop constraint giveaways_wallet_capacity;
alter table public.giveaways add constraint giveaways_wallet_capacity
  check (entry_mode <> 'wallet' or coalesce(max_entries, 0) > 0);

create or replace function public.tg_giveaways_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
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
    if coalesce(new.max_entries, 0) < v_sum then
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

drop function if exists public.review_referral_flag(bigint);
drop function if exists public.list_flagged_referrals();
drop function if exists public.set_giveaway_earning_rules(jsonb);
drop function if exists public.get_giveaway_earning_rules();
drop function if exists public._earning_rules_json(public.giveaway_earning_rules);

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

drop index if exists public.referrals_flagged_idx;
drop index if exists public.referrals_referrer_created_idx;
alter table public.referrals drop constraint if exists referrals_referred_reward_status_check;
alter table public.referrals
  drop column if exists flag_reviewed_by,
  drop column if exists flag_reviewed_at,
  drop column if exists flag_reason,
  drop column if exists flagged_at,
  drop column if exists referred_reward_decided_at,
  drop column if exists referred_reward_status;

drop table if exists public.referral_milestone_awards;
drop table if exists public.giveaway_earning_rules;
drop function if exists public._earning_milestones_valid(jsonb);

alter table public.giveaway_credit_ledger drop constraint giveaway_credit_ledger_reason_check;
alter table public.giveaway_credit_ledger add constraint giveaway_credit_ledger_reason_check
  check (reason in ('admin_grant', 'admin_revoke', 'giveaway_spend', 'giveaway_refund',
                    'referral_signup_reward'));
