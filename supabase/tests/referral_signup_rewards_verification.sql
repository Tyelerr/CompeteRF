-- supabase/tests/referral_signup_rewards_verification.sql
--
-- ROLLBACK-ONLY production verification for 20261006120000_referral_signup_rewards.sql.
-- NOT a migration. One single DO statement:
--   1. creates throwaway brand-new accounts (auth.users + profiles) and one PRE-LAUNCH referral,
--   2. applies the migration INSIDE the statement (placeholder MIGRATION),
--   3. replays every case as the throwaway / real accounts (auth.uid() via request.jwt.claims,
--      SET LOCAL ROLE authenticated/anon),
--   4. ALWAYS ends with RAISE EXCEPTION carrying the JSON results → everything rolls back.
-- Monthly-cap history is seeded as ledger rows written by postgres (rolled back) rather than 25
-- real signups. No pg_net / notifications / cron are invoked.

do $verify$
declare
  r      jsonb := '[]'::jsonb;
  v_pass int := 0;
  v_fail int := 0;
  -- existing referrers (real prod accounts, old)
  a_id bigint; a_code text;         -- referrer A: normal path
  b_id bigint; b_code text;         -- referrer B: monthly cap
  c_id bigint; c_code text;         -- referrer C: new-month reset
  d_id bigint; d_code text;         -- referrer D: pre-launch referral
  v_sa uuid;  v_basic uuid;
  -- throwaway brand-new accounts
  n1 uuid := gen_random_uuid(); n1_id bigint; n1_code text;
  n2 uuid := gen_random_uuid(); n2_id bigint;
  n3 uuid := gen_random_uuid(); n3_id bigint;
  n4 uuid := gen_random_uuid(); n4_id bigint;
  n5 uuid := gen_random_uuid(); n5_id bigint;
  n6 uuid := gen_random_uuid(); n6_id bigint;
  n7 uuid := gen_random_uuid(); n7_id bigint;
  n8 uuid := gen_random_uuid(); n8_id bigint;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix';
  v_ref_id bigint;
  v_ledger_before bigint;
  got text;
begin
  -- ── helpers ─────────────────────────────────────────────────────────────────────────────
  execute $h$
    create function pg_temp.pv(p_uid uuid, p_sql text, p_keep boolean default false) returns text
    language plpgsql as $f$
    declare v text; msg text;
    begin
      begin
        perform set_config('request.jwt.claims',
          case when p_uid is null then '{"role":"anon"}'
               else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
        perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
        perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
        execute p_sql into v;
        perform set_config('role', 'postgres', true);
        if p_keep then return coalesce(v, '<null>'); end if;
        raise exception 'PV:%', coalesce(v, '<null>');
      exception when others then
        msg := sqlerrm;
        if msg like 'PV:%' then return substr(msg, 4); end if;
        return 'err:' || msg;
      end;
    end $f$;
  $h$;
  execute $h$
    create function pg_temp.chk(p_id text, p_desc text, p_got text, p_ok boolean) returns jsonb
    language sql as $f$
      select jsonb_build_object('id', p_id, 'test', p_desc, 'got', p_got, 'pass', coalesce(p_ok, false))
    $f$;
  $h$;
  -- wallet balance (0 when no wallet) and referral-reward ledger rows for a profile
  execute $h$
    create function pg_temp.bal(p bigint) returns int language sql as $f$
      select coalesce((select balance from giveaway_wallets where profile_id = p), 0)
    $f$;
  $h$;
  execute $h$
    create function pg_temp.rewards(p bigint) returns int language sql as $f$
      select count(*)::int from giveaway_credit_ledger where profile_id = p and reason = 'referral_signup_reward'
    $f$;
  $h$;
  execute $h$
    create function pg_temp.claim_sql(p_code text) returns text language sql as $f$
      select format($q$select claim_referral(%L, 'link')->>'status'$q$, p_code)
    $f$;
  $h$;

  -- ── actors ──────────────────────────────────────────────────────────────────────────────
  select p.id_auto, c.code into a_id, a_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and coalesce(p.status, 'active') = 'active' and not p.is_disabled and p.deleted_at is null order by p.id_auto limit 1;
  select p.id_auto, c.code into b_id, b_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and coalesce(p.status, 'active') = 'active' and not p.is_disabled and p.deleted_at is null and p.id_auto > a_id order by p.id_auto limit 1;
  select p.id_auto, c.code into c_id, c_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and coalesce(p.status, 'active') = 'active' and not p.is_disabled and p.deleted_at is null and p.id_auto > b_id order by p.id_auto limit 1;
  select p.id_auto, c.code into d_id, d_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and coalesce(p.status, 'active') = 'active' and not p.is_disabled and p.deleted_at is null and p.id_auto > c_id order by p.id_auto limit 1;
  select id into v_sa from profiles where role = 'super_admin' order by id_auto limit 1;
  select id into v_basic from profiles where id_auto = a_id;

  -- ── throwaway NEW accounts (inside the 7-day claim window) ──────────────────────────────
  insert into auth.users (id, email, created_at) values
    (n1, 'rwtest1@example.invalid', now()), (n2, 'rwtest2@example.invalid', now()),
    (n3, 'rwtest3@example.invalid', now()), (n4, 'rwtest4@example.invalid', now()),
    (n5, 'rwtest5@example.invalid', now()), (n6, 'rwtest6@example.invalid', now()),
    (n7, 'rwtest7@example.invalid', now()), (n8, 'rwtest8@example.invalid', now());
  insert into profiles (id, email, name, user_name, home_state) values
    (n1, 'rwtest1@example.invalid', 'Rw Test1', 'rwtestnew1', 'AZ'),
    (n2, 'rwtest2@example.invalid', 'Rw Test2', 'rwtestnew2', 'AZ'),
    (n3, 'rwtest3@example.invalid', 'Rw Test3', 'rwtestnew3', 'AZ'),
    (n4, 'rwtest4@example.invalid', 'Rw Test4', 'rwtestnew4', 'AZ'),
    (n5, 'rwtest5@example.invalid', 'Rw Test5', 'rwtestnew5', 'AZ'),
    (n6, 'rwtest6@example.invalid', 'Rw Test6', 'rwtestnew6', 'AZ'),
    (n7, 'rwtest7@example.invalid', 'Rw Test7', 'rwtestnew7', 'AZ'),
    (n8, 'rwtest8@example.invalid', 'Rw Test8', 'rwtestnew8', 'AZ');
  select id_auto into n1_id from profiles where id = n1;
  select id_auto into n2_id from profiles where id = n2;
  select id_auto into n3_id from profiles where id = n3;
  select id_auto into n4_id from profiles where id = n4;
  select id_auto into n5_id from profiles where id = n5;
  select id_auto into n6_id from profiles where id = n6;
  select id_auto into n7_id from profiles where id = n7;
  select id_auto into n8_id from profiles where id = n8;
  select code into n1_code from referral_codes where profile_id = n1_id and disabled_at is null;

  -- ── PRE-LAUNCH: n7 claims D's code with the CURRENT (live, no-reward) claim_referral ─────
  got := pg_temp.pv(n7, pg_temp.claim_sql(d_code), true);
  r := r || pg_temp.chk('P0', 'setup: pre-launch claim recorded by the live claim_referral', got, got = 'claimed');

  -- ═══ APPLY ═════════════════════════════════════════════════════════════════════════════
  execute __MIGRATION__;

  -- ── structure / access ──────────────────────────────────────────────────────────────────
  got := (select pg_get_constraintdef(oid) from pg_constraint where conname = 'giveaway_credit_ledger_reason_check');
  r := r || pg_temp.chk('S1', 'ledger reason list = previous four + referral_signup_reward', got,
          got like '%admin_grant%' and got like '%admin_revoke%' and got like '%giveaway_spend%' and got like '%giveaway_refund%' and got like '%referral_signup_reward%');
  got := pg_temp.pv(v_basic, 'select _referral_issue_signup_reward(1)')
      || '|' || pg_temp.pv(v_basic, 'select _referral_try_signup_reward(1)')
      || '|' || pg_temp.pv(v_basic, $q$select _giveaway_wallet_apply(1, 1, 'referral_signup_reward')::text$q$)
      || '|' || pg_temp.pv(null, 'select _referral_try_signup_reward(1)');
  r := r || pg_temp.chk('S2', 'clients cannot call the reward internals or the wallet apply (grant themselves entries)', got,
          got = 'err:permission denied for function _referral_issue_signup_reward|err:permission denied for function _referral_try_signup_reward|err:permission denied for function _giveaway_wallet_apply|err:permission denied for function _referral_try_signup_reward');
  got := pg_temp.pv(v_basic, format($q$insert into giveaway_credit_ledger (profile_id, delta, balance_after, reason) values (%s, 1, 1, 'referral_signup_reward') returning id::text$q$, a_id));
  r := r || pg_temp.chk('S3', 'clients cannot insert ledger rows directly', got, got like 'err:permission denied%');

  -- ── 8. pre-launch referral: never rewarded ──────────────────────────────────────────────
  select id into v_ref_id from referrals where referred_profile_id = n7_id;
  got := (select reward_status from referrals where id = v_ref_id);
  got := got || '|' || pg_temp.pv(n7, pg_temp.claim_sql(d_code), true);       -- re-claim after launch
  got := got || '|' || (select public._referral_try_signup_reward(v_ref_id));  -- direct retry
  got := got || '|' || pg_temp.rewards(d_id) || '|' || pg_temp.bal(d_id);
  r := r || pg_temp.chk('R8', 'pre-launch referral is not_eligible; re-claim and retry grant nothing', got,
          got = 'not_eligible|already_claimed|not_eligible|0|0');

  -- ── 1 + 9. new signup through a valid referral → referrer +1 ────────────────────────────
  got := pg_temp.pv(n1, pg_temp.claim_sql(lower(a_code)), true);
  select id into v_ref_id from referrals where referred_profile_id = n1_id;
  got := got || '|' || (select reward_status from referrals where id = v_ref_id)
      || '|' || pg_temp.bal(a_id) || '|' || pg_temp.rewards(a_id)
      || '|' || (select delta || ',' || reason || ',' || (referral_id = v_ref_id) || ',' || idempotency_key
                   from giveaway_credit_ledger where profile_id = a_id and reason = 'referral_signup_reward');
  r := r || pg_temp.chk('R1', 'new signup claims A''s code → claimed, referral rewarded, A +1, ledger row = +1 / reason / referral_id / key', got,
          got = 'claimed|rewarded|1|1|1,referral_signup_reward,true,referral_signup:' || v_ref_id);
  got := pg_temp.bal(n1_id) || '|' || pg_temp.rewards(n1_id);
  r := r || pg_temp.chk('R1b', 'the referred user gets nothing', got, got = '0|0');
  got := pg_temp.pv(n1, 'select get_my_giveaway_balance()::text');
  r := r || pg_temp.chk('R1c', 'referrer sees it via the existing balance RPC (as A)', pg_temp.pv(v_basic, 'select get_my_giveaway_balance()::text'),
          pg_temp.pv(v_basic, 'select get_my_giveaway_balance()::text') = '1' and got = '0');

  -- ── 2. same referral path again → no second entry ──────────────────────────────────────
  got := pg_temp.pv(n1, pg_temp.claim_sql(a_code), true)
      || '|' || pg_temp.pv(n1, pg_temp.claim_sql(a_code), true)
      || '|' || (select public._referral_try_signup_reward(v_ref_id))
      || '|' || (select public._referral_issue_signup_reward(v_ref_id))
      || '|' || pg_temp.bal(a_id) || '|' || pg_temp.rewards(a_id);
  r := r || pg_temp.chk('R2', 're-claim ×2, retry, direct issue → still exactly one +1', got,
          got = 'already_claimed|already_claimed|rewarded|rewarded|1|1');

  -- ── 3. self referral ────────────────────────────────────────────────────────────────────
  got := pg_temp.pv(n2, pg_temp.claim_sql((select code from referral_codes where profile_id = n2_id and disabled_at is null)), true)
      || '|' || pg_temp.bal(n2_id) || '|' || (select count(*) from referrals where referred_profile_id = n2_id);
  r := r || pg_temp.chk('R3', 'self referral rejected; no referral row, no entry', got, got = 'self_referral|0|0');

  -- ── 4. referred user already belongs to another referrer ───────────────────────────────
  got := pg_temp.pv(n1, pg_temp.claim_sql(b_code), true)
      || '|' || pg_temp.bal(b_id) || '|' || pg_temp.rewards(b_id)
      || '|' || (select referrer_profile_id = a_id from referrals where referred_profile_id = n1_id);
  r := r || pg_temp.chk('R4', 'n1 (A''s referral) claims B''s code → already_attributed; B gets nothing; still A''s', got,
          got = 'already_attributed|0|0|true');

  -- ── 5 + 6. monthly cap: B has 24 this month → 25th granted, 26th capped ────────────────
  insert into giveaway_credit_ledger (profile_id, delta, balance_after, reason, created_at, note)
  select b_id, 1, g, 'referral_signup_reward', v_month_start + interval '1 minute' * g, 'test seed'
    from generate_series(1, 24) g;
  insert into giveaway_wallets (profile_id, balance) values (b_id, 24);
  got := pg_temp.pv(n3, pg_temp.claim_sql(b_code), true);
  got := got || '|' || (select reward_status from referrals where referred_profile_id = n3_id)
      || '|' || pg_temp.bal(b_id) || '|' || pg_temp.rewards(b_id);
  r := r || pg_temp.chk('R5', 'B at 24 this month → next signup grants the 25th', got, got = 'claimed|rewarded|25|25');
  got := pg_temp.pv(n4, pg_temp.claim_sql(b_code), true);
  got := got || '|' || (select reward_status from referrals where referred_profile_id = n4_id)
      || '|' || (select (referrer_profile_id = b_id)::text from referrals where referred_profile_id = n4_id)
      || '|' || pg_temp.bal(b_id) || '|' || pg_temp.rewards(b_id);
  r := r || pg_temp.chk('R6', 'B at 25 → next signup still attributes (claimed, row is B''s) but is capped: no entry', got,
          got = 'claimed|capped|true|25|25');
  select id into v_ref_id from referrals where referred_profile_id = n4_id;
  got := pg_temp.pv(n4, pg_temp.claim_sql(b_code), true) || '|' || (select public._referral_try_signup_reward(v_ref_id))
      || '|' || pg_temp.bal(b_id);
  r := r || pg_temp.chk('R6b', 'a capped referral never pays out on retry', got, got = 'already_claimed|capped|25');

  -- ── 7. new calendar month resets the cap ───────────────────────────────────────────────
  insert into giveaway_credit_ledger (profile_id, delta, balance_after, reason, created_at, note)
  select c_id, 1, g, 'referral_signup_reward', v_month_start - interval '1 hour' * g, 'test seed (previous month)'
    from generate_series(1, 25) g;
  insert into giveaway_wallets (profile_id, balance) values (c_id, 25);
  -- (claim first, read state in a separate statement: a subquery in the same expression would use
  -- the statement's starting snapshot and miss the claim)
  got := pg_temp.pv(n5, pg_temp.claim_sql(c_code), true);
  got := got || '|' || (select reward_status from referrals where referred_profile_id = n5_id)
      || '|' || pg_temp.bal(c_id);
  r := r || pg_temp.chk('R7', 'C earned 25 LAST month → a signup this month is rewarded', got, got = 'claimed|rewarded|26');
  got := (select to_char(v_month_start at time zone 'America/Phoenix', 'YYYY-MM-DD HH24:MI'));
  r := r || pg_temp.chk('R7b', 'month boundary is midnight on the 1st, America/Phoenix', got, got like '%-01 00:00');

  -- ── 10. wallet failure → attribution kept, reward failed; retry grants exactly once ────
  -- Force the wallet step to fail for this one reward (temporary constraint, rolled back).
  alter table giveaway_credit_ledger add constraint zz_test_force_fail
    check (idempotency_key is distinct from ('referral_signup:' || coalesce(referral_id, 0))) not valid;
  got := pg_temp.pv(n6, pg_temp.claim_sql(a_code), true);
  select id into v_ref_id from referrals where referred_profile_id = n6_id;
  got := got || '|' || coalesce(v_ref_id::text, 'no-row') || '|' || (select reward_status from referrals where id = v_ref_id)
      || '|' || pg_temp.bal(a_id) || '|' || pg_temp.rewards(a_id);
  r := r || pg_temp.chk('R10', 'wallet step fails → claim still "claimed", referral row kept, status failed, no entry', got,
          got like 'claimed|%|failed|1|1' and v_ref_id is not null);
  alter table giveaway_credit_ledger drop constraint zz_test_force_fail;
  got := pg_temp.pv(n6, pg_temp.claim_sql(a_code), true);                   -- client re-sends the claim
  got := got || '|' || (select reward_status from referrals where id = v_ref_id)
      || '|' || pg_temp.bal(a_id);
  got := got || '|' || pg_temp.pv(n6, pg_temp.claim_sql(a_code), true);
  got := got || '|' || (select public._referral_try_signup_reward(v_ref_id));
  got := got || '|' || pg_temp.bal(a_id) || '|' || pg_temp.rewards(a_id);
  r := r || pg_temp.chk('R10b', 'recovery: re-claim grants once; further retries grant nothing', got,
          got = 'already_claimed|rewarded|2|already_claimed|rewarded|2|2');
  got := pg_temp.pv(v_basic, format('select retry_referral_signup_reward(%s)->>''status''', v_ref_id))
      || '|' || pg_temp.pv(v_sa, format('select retry_referral_signup_reward(%s)->>''status''', v_ref_id))
      || '|' || pg_temp.bal(a_id);
  r := r || pg_temp.chk('R10c', 'admin retry: basic user forbidden; super admin retry is idempotent', got, got = 'forbidden|rewarded|2');

  -- ── 11. raw visit / click never rewards ────────────────────────────────────────────────
  select count(*) into v_ledger_before from giveaway_credit_ledger;
  got := pg_temp.pv(null, format($q$select coalesce(log_referral_visit(%L, 'web', 'ios', null)::text, 'null')$q$, a_code), true);
  got := got || '|' || ((select count(*) from giveaway_credit_ledger) - v_ledger_before) || '|' || pg_temp.bal(a_id);
  r := r || pg_temp.chk('R11', 'anonymous referral visit/click → no ledger change', got, got like '%|0|2');

  -- ── 12. signup without a referral → no wallet change ───────────────────────────────────
  select count(*) into v_ledger_before from giveaway_credit_ledger;
  got := pg_temp.pv(n8, 'select get_my_giveaway_balance()::text')
      || '|' || ((select count(*) from giveaway_credit_ledger) - v_ledger_before)
      || '|' || (select count(*) from referrals where referred_profile_id = n8_id);
  r := r || pg_temp.chk('R12', 'new account that never claims → balance 0, no ledger rows, no referral', got, got = '0|0|0');

  -- ── 13. existing wallet ops unchanged (full coverage: wallet suite run separately) ─────
  got := pg_temp.pv(v_sa, format($q$select admin_grant_giveaway_entries(%s, 2, 'test grant', 'rw-test-grant-1')::text$q$, n8_id), true);
  got := (select reason || ',' || delta from giveaway_credit_ledger where profile_id = n8_id) || '|' || pg_temp.bal(n8_id)
      || '|' || pg_temp.pv(v_basic, format($q$select admin_grant_giveaway_entries(%s, 2, 'x', 'rw-test-grant-2')::text$q$, n8_id));
  r := r || pg_temp.chk('R13', 'admin grant still works (super admin) and is still refused for others', got,
          got like 'admin_grant,2|2|%' and got not like '%|2|{%"ok": true%');

  select count(*) filter (where (x->>'pass')::boolean), count(*) filter (where not (x->>'pass')::boolean)
    into v_pass, v_fail from jsonb_array_elements(r) x where x ? 'pass';
  raise exception 'VERIFY_RESULT:%', jsonb_build_object('pass', v_pass, 'fail', v_fail, 'results', r)::text;
end
$verify$;
