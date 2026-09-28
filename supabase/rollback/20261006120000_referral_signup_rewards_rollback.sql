-- supabase/rollback/20261006120000_referral_signup_rewards_rollback.sql
--
-- Reverts the referral signup rewards migration: claim_referral goes back to the exact
-- attribution-only version (verbatim from 20261002120000_referral_attribution.sql), the reward
-- functions / columns / index are dropped, and the ledger reason list is restored.
--
-- ⚠ Referral reward ledger rows already granted are NOT deleted automatically (entries may have
-- been spent). If any exist, the reason constraint cannot be restored until they are handled;
-- this script aborts in that case so nothing is half-reverted. Decide per row (admin_revoke to
-- claw back, or keep them and leave the widened constraint) before re-running.

do $guard$
begin
  if exists (select 1 from public.giveaway_credit_ledger where reason = 'referral_signup_reward') then
    raise exception 'referral_signup_reward ledger rows exist — resolve them before rolling back';
  end if;
end
$guard$;

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

  return jsonb_build_object('ok', true, 'status', 'claimed');
end
$$;

revoke all on function public.claim_referral(text, text) from public, anon;
grant execute on function public.claim_referral(text, text) to authenticated;

drop function if exists public.retry_referral_signup_reward(bigint);
drop function if exists public._referral_try_signup_reward(bigint);
drop function if exists public._referral_issue_signup_reward(bigint);

alter table public.referrals drop constraint if exists referrals_reward_status_check;
alter table public.referrals drop column if exists reward_decided_at;
alter table public.referrals drop column if exists reward_status;

drop index if exists public.giveaway_credit_ledger_referral_reward_idx;
alter table public.giveaway_credit_ledger drop constraint giveaway_credit_ledger_reason_check;
alter table public.giveaway_credit_ledger add constraint giveaway_credit_ledger_reason_check
  check (reason in ('admin_grant', 'admin_revoke', 'giveaway_spend', 'giveaway_refund'));
