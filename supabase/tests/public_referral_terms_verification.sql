-- supabase/tests/public_referral_terms_verification.sql
-- ROLLBACK-ONLY verification for 20261016120000_public_referral_terms.sql. Runs the migration inside
-- a transaction, checks it, and ALWAYS raises at the end so nothing persists (the final exception
-- message carries the results). Safe against production.
do $verify$
declare
  v jsonb;
  v_keys text[];
  v_expected_keys text[] := array['attribution_window_days', 'milestones', 'monthly_referrer_cap',
                                  'referral_rewards_enabled', 'referred_reward', 'referrer_reward'];
  rr public.giveaway_earning_rules%rowtype;
  results text := '';
  fails int := 0;
begin
  execute __MIGRATION__;

  select * into rr from public.giveaway_earning_rules where id;

  -- T1: exactly the public keys, nothing else
  v := public.get_public_referral_terms();
  select array_agg(k order by k) into v_keys from jsonb_object_keys(v) k;
  if v_keys = v_expected_keys then results := results || 'T1 ok; '; else fails := fails + 1; results := results || 'T1 FAIL keys=' || v_keys::text || '; '; end if;

  -- T2: values mirror the live row
  if (v->>'referral_rewards_enabled')::boolean = rr.referral_rewards_enabled
     and (v->>'referrer_reward')::int = rr.referrer_reward
     and (v->>'referred_reward')::int = rr.referred_reward
     and (v->>'attribution_window_days')::int = rr.attribution_window_days
     and (v->>'monthly_referrer_cap')::int = rr.monthly_referrer_cap
  then results := results || 'T2 ok; '; else fails := fails + 1; results := results || 'T2 FAIL ' || v::text || '; '; end if;

  -- T3: milestones mirror the row when enabled
  if rr.milestones_enabled and jsonb_array_length(v->'milestones') =
       (select count(*) from jsonb_array_elements(rr.milestones) m where (m->>'bonus')::numeric > 0)
  then results := results || 'T3 ok ' || (v->'milestones')::text || '; ';
  elsif not rr.milestones_enabled and v->'milestones' = '[]'::jsonb then results := results || 'T3 ok (disabled); ';
  else fails := fails + 1; results := results || 'T3 FAIL; '; end if;

  -- T4: an admin edit is reflected immediately (no app release)
  update public.giveaway_earning_rules set referrer_reward = 3, monthly_referrer_cap = 10,
         milestones = '[{"threshold":20,"bonus":0},{"threshold":3,"bonus":2}]'::jsonb where id;
  v := public.get_public_referral_terms();
  if (v->>'referrer_reward')::int = 3 and (v->>'monthly_referrer_cap')::int = 10
     and v->'milestones' = '[{"bonus": 2, "threshold": 3}]'::jsonb
  then results := results || 'T4 ok; '; else fails := fails + 1; results := results || 'T4 FAIL ' || v::text || '; '; end if;

  -- T5: milestones disabled → []
  update public.giveaway_earning_rules set milestones_enabled = false where id;
  if public.get_public_referral_terms()->'milestones' = '[]'::jsonb then results := results || 'T5 ok; ';
  else fails := fails + 1; results := results || 'T5 FAIL; '; end if;

  -- T6: grants — anon + authenticated may execute; velocity/audit fields never present
  if has_function_privilege('anon', 'public.get_public_referral_terms()', 'execute')
     and has_function_privilege('authenticated', 'public.get_public_referral_terms()', 'execute')
     and not (public.get_public_referral_terms() ? 'velocity_flag_threshold')
     and not (public.get_public_referral_terms() ? 'updated_by')
  then results := results || 'T6 ok; '; else fails := fails + 1; results := results || 'T6 FAIL; '; end if;

  -- T7: as the anon role, through the same path PostgREST uses
  execute 'set local role anon';
  v := public.get_public_referral_terms();
  execute 'reset role';
  if v ? 'referrer_reward' then results := results || 'T7 ok (anon); '; else fails := fails + 1; results := results || 'T7 FAIL; '; end if;

  raise exception 'ROLLBACK-ONLY RESULT: % failures | %', fails, results;
end
$verify$;
