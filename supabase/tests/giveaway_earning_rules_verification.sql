-- supabase/tests/giveaway_earning_rules_verification.sql
--
-- ROLLBACK-ONLY production verification for 20261015120000_giveaway_earning_rules.sql.
-- NOT a migration. One DO statement that:
--   1. creates throwaway brand-new accounts (auth.users + profiles),
--   2. applies the migration INSIDE the statement (placeholder __MIGRATION__, substituted by the
--      runner),
--   3. replays every case as those accounts / a real super admin / a real basic user
--      (auth.uid() via request.jwt.claims, role authenticated),
--   4. ALWAYS ends with RAISE EXCEPTION carrying the JSON results → everything rolls back.
-- Monthly-cap history is seeded through _giveaway_wallet_apply as postgres (rolled back).
-- No notifications / pg_net are invoked; the cron job is created and rolled back.

do $verify$
declare
  r      jsonb := '[]'::jsonb;
  v_pass int := 0;
  v_fail int := 0;
  -- real accounts
  v_sa uuid; sa_id bigint;
  v_basic uuid; basic_id bigint;
  a_id bigint; a_code text;   -- old referrer: normal path
  b_id bigint; b_code text;   -- old referrer: monthly cap
  c_id bigint; c_code text;   -- old referrer: milestones + velocity
  -- throwaway brand-new accounts
  n uuid[] := array[]::uuid[];
  nid bigint[] := array[]::bigint[];
  ncode text[] := array[]::text[];
  i int;
  got text;
  v_g integer;
  v_g2 integer;
  v_g3 integer;
  v_ref bigint;
  v_req uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix';
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
        perform set_config('role', 'postgres', true);
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
  execute $h$
    create function pg_temp.bal(p bigint) returns int language sql as $f$
      select coalesce((select balance from giveaway_wallets where profile_id = p), 0)
    $f$;
  $h$;
  execute $h$
    create function pg_temp.lsum(p bigint, p_reason text) returns int language sql as $f$
      select coalesce(sum(delta), 0)::int from giveaway_credit_ledger where profile_id = p and reason = p_reason
    $f$;
  $h$;
  execute $h$
    create function pg_temp.claim_sql(p_code text) returns text language sql as $f$
      select format($q$select claim_referral(%L, 'link')->>'status'$q$, p_code)
    $f$;
  $h$;
  execute $h$
    create function pg_temp.newacct(p_tag text, p_created timestamptz default now()) returns uuid
    language plpgsql as $f$
    declare u uuid := gen_random_uuid();
    begin
      insert into auth.users (id, email, created_at) values (u, 'ertest_' || p_tag || '@example.invalid', p_created);
      insert into profiles (id, email, name, user_name, home_state)
      values (u, 'ertest_' || p_tag || '@example.invalid', 'Er Test ' || p_tag, 'ertest' || p_tag, 'AZ');
      return u;
    end $f$;
  $h$;

  -- ── actors ──────────────────────────────────────────────────────────────────────────────
  select id, id_auto into v_sa, sa_id from profiles where role = 'super_admin' order by id_auto limit 1;
  select p.id_auto, c.code into a_id, a_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and coalesce(p.status, 'active') = 'active' and not p.is_disabled and p.deleted_at is null order by p.id_auto limit 1;
  select p.id_auto, c.code into b_id, b_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and coalesce(p.status, 'active') = 'active' and not p.is_disabled and p.deleted_at is null and p.id_auto > a_id order by p.id_auto limit 1;
  select p.id_auto, c.code into c_id, c_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and coalesce(p.status, 'active') = 'active' and not p.is_disabled and p.deleted_at is null and p.id_auto > b_id order by p.id_auto limit 1;
  select id, id_auto into v_basic, basic_id from profiles where id_auto = a_id;

  for i in 1..16 loop
    n := n || pg_temp.newacct(i::text);
    nid := nid || (select id_auto from profiles where id = n[i]);
    ncode := ncode || (select code from referral_codes where profile_id = nid[i] and disabled_at is null);
  end loop;

  -- ═══ APPLY ═════════════════════════════════════════════════════════════════════════════
  execute __MIGRATION__;

  -- ── structure / access ──────────────────────────────────────────────────────────────────
  got := (select pg_get_constraintdef(oid) from pg_constraint where conname = 'giveaway_credit_ledger_reason_check');
  r := r || pg_temp.chk('S1', 'ledger reasons add referral_referred_reward + referral_milestone_bonus', got,
          got like '%referral_signup_reward%' and got like '%referral_referred_reward%' and got like '%referral_milestone_bonus%'
          and got like '%admin_grant%' and got like '%giveaway_refund%');
  got := (select format('%s|%s|%s|%s|%s|%s|%s|%s', referral_rewards_enabled, referrer_reward, referred_reward,
                        attribution_window_days, monthly_referrer_cap, velocity_flag_threshold, milestones_enabled, milestones)
            from giveaway_earning_rules);
  r := r || pg_temp.chk('S2', 'rules seeded: on, +1/+1, 7 days, cap 25, velocity 5, milestones 5/10/25/50 → +5', got,
          got = 't|1|1|7|25|5|t|[{"bonus": 5, "threshold": 5}, {"bonus": 5, "threshold": 10}, {"bonus": 5, "threshold": 25}, {"bonus": 5, "threshold": 50}]');
  got := pg_temp.pv(v_basic, 'select count(*)::text from giveaway_earning_rules') || '|' ||
         pg_temp.pv(v_sa, 'select count(*)::text from giveaway_earning_rules');
  r := r || pg_temp.chk('S3', 'rules row: basic user sees 0 rows (RLS), super admin sees 1', got, got = '0|1');
  got := pg_temp.pv(v_basic, 'select get_giveaway_earning_rules()::text') || ' || ' ||
         pg_temp.pv(v_sa, $q$select (get_giveaway_earning_rules()->'rules'->>'referred_reward')$q$);
  r := r || pg_temp.chk('S4', 'get_giveaway_earning_rules: basic → not authorized; super admin → rules', got,
          got like 'err:not authorized% || 1');
  got := pg_temp.pv(null, $q$select set_giveaway_earning_rules('{"referrer_reward":2}')::text$q$);
  r := r || pg_temp.chk('S5', 'anon cannot call set_giveaway_earning_rules', got, got like 'err:%');
  got := (select count(*)::text from cron.job where jobname = 'giveaway-end-sweep' and schedule = '*/5 * * * *');
  r := r || pg_temp.chk('S6', 'end sweep scheduled every 5 minutes', got, got = '1');

  -- ── referral credits ────────────────────────────────────────────────────────────────────
  got := pg_temp.pv(n[1], pg_temp.claim_sql(a_code), true);
  select id into v_ref from referrals where referred_profile_id = nid[1];
  got := got || '|' || (pg_temp.bal(a_id) - 0) || '|' || pg_temp.bal(nid[1]) || '|' ||
         pg_temp.lsum(a_id, 'referral_signup_reward') || '|' || pg_temp.lsum(nid[1], 'referral_referred_reward') || '|' ||
         (select reward_status || ',' || referred_reward_status from referrals where id = v_ref) || '|' ||
         (select count(*) from giveaway_credit_ledger where idempotency_key in ('referral_signup:' || v_ref, 'referral_referred:' || v_ref));
  r := r || pg_temp.chk('R1', 'A refers N1: A +1 (referral_signup_reward), N1 +1 (referral_referred_reward), two ledger rows', got,
          got like 'claimed|%|1|1|1|rewarded,rewarded|2' and split_part(got, '|', 2)::int >= 1);

  got := pg_temp.pv(n[1], pg_temp.claim_sql(a_code), true) || '|' || pg_temp.lsum(a_id, 'referral_signup_reward') || '|' || pg_temp.bal(nid[1]);
  r := r || pg_temp.chk('R2', 'duplicate claim → already_claimed, no second credit for either party', got, got = 'already_claimed|1|1');

  update referrals set referred_reward_status = 'failed', reward_status = 'failed' where id = v_ref;
  got := pg_temp.pv(n[1], pg_temp.claim_sql(a_code), true);
  got := got || '|' || pg_temp.lsum(a_id, 'referral_signup_reward') || '|' || pg_temp.bal(nid[1])
      || '|' || (select reward_status || ',' || referred_reward_status from referrals where id = v_ref);
  r := r || pg_temp.chk('R3', 'retry of failed credits is idempotent (keys already used → no double credit)', got,
          got = 'already_claimed|1|1|rewarded,rewarded');

  got := pg_temp.pv(n[1], pg_temp.claim_sql(ncode[1]), true);
  r := r || pg_temp.chk('R4', 'self-referral blocked', got, got = 'self_referral');

  got := pg_temp.pv(n[3], pg_temp.claim_sql(ncode[2]), true) || '|' || pg_temp.pv(n[2], pg_temp.claim_sql(ncode[3]), true);
  r := r || pg_temp.chk('R5', 'mutual referral blocked (N3 referred by N2 → N2 cannot claim N3)', got, got = 'claimed|mutual_referral');

  got := pg_temp.pv(n[2], pg_temp.claim_sql(a_code), true);
  r := r || pg_temp.chk('R6', 'N2 (blocked only from the mutual claim) can still be referred by A', got, got = 'claimed');

  got := pg_temp.pv(v_basic, pg_temp.claim_sql(ncode[4]), true);
  r := r || pg_temp.chk('R7', 'old account outside the window → window_expired', got, got = 'window_expired');

  -- window comes from the rules: N5 is 3 days old
  update auth.users set created_at = now() - interval '3 days' where id = n[5];
  got := pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"attribution_window_days":2}')->>'status'$q$, true);
  got := got || '|' || pg_temp.pv(n[5], pg_temp.claim_sql(a_code), true);
  perform pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"attribution_window_days":7}')->>'status'$q$, true);
  got := got || '|' || pg_temp.pv(n[5], pg_temp.claim_sql(a_code), true);
  r := r || pg_temp.chk('R8', 'attribution window is configurable (2 days → expired, 7 days → claimed)', got, got = 'saved|window_expired|claimed');

  -- disabled rewards
  got := pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"referral_rewards_enabled":false}')->>'status'$q$, true);
  got := got || '|' || pg_temp.pv(n[6], pg_temp.claim_sql(b_code), true);
  got := got || '|' || pg_temp.bal(nid[6]) || '|' ||
         pg_temp.lsum(b_id, 'referral_signup_reward') || '|' ||
         (select reward_status || ',' || referred_reward_status from referrals where referred_profile_id = nid[6]);
  perform pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"referral_rewards_enabled":true}')->>'status'$q$, true);
  r := r || pg_temp.chk('R9', 'rewards disabled → claim still attributes, no credits, both not_eligible', got,
          got = 'saved|claimed|0|0|not_eligible,not_eligible');

  -- monthly cap: seed B with 25 referrer credits this month
  for i in 1..25 loop
    perform _giveaway_wallet_apply(b_id, 1, 'referral_signup_reward', null, null, 'ertest-cap-' || i, null, 'seed');
  end loop;
  got := pg_temp.pv(n[7], pg_temp.claim_sql(b_code), true);
  got := got || '|' || pg_temp.lsum(b_id, 'referral_signup_reward') || '|' ||
         pg_temp.bal(nid[7]) || '|' || (select reward_status || ',' || referred_reward_status from referrals where referred_profile_id = nid[7]);
  r := r || pg_temp.chk('R10', 'monthly cap (25): referrer credit capped; referred user still +1', got, got = 'claimed|25|1|capped,rewarded');
  perform pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"monthly_referrer_cap":26}')->>'status'$q$, true);
  got := pg_temp.pv(n[8], pg_temp.claim_sql(b_code), true) || '|' || pg_temp.lsum(b_id, 'referral_signup_reward');
  perform pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"monthly_referrer_cap":25}')->>'status'$q$, true);
  r := r || pg_temp.chk('R11', 'cap is configurable (26 → next referral rewarded)', got, got = 'claimed|26');

  -- milestones: C gets 5 referrals (N9..N13) → +5 bonus once; 6th (N14) → velocity flag
  for i in 9..13 loop
    perform pg_temp.pv(n[i], pg_temp.claim_sql(c_code), true);
  end loop;
  got := pg_temp.lsum(c_id, 'referral_signup_reward') || '|' || pg_temp.lsum(c_id, 'referral_milestone_bonus') || '|' ||
         (select count(*) from referral_milestone_awards where referrer_profile_id = c_id) || '|' ||
         (select threshold || ',' || bonus || ',' || referral_count || ',' || (ledger_id is not null) from referral_milestone_awards where referrer_profile_id = c_id) || '|' ||
         (select count(*) from giveaway_credit_ledger where idempotency_key = 'referral_milestone:' || c_id || ':5');
  r := r || pg_temp.chk('M1', '5th successful referral → +5 milestone bonus (ledgered, keyed, award row)', got, got = '5|5|1|5,5,5,true|1');

  -- re-run the reward step for every C referral: nothing more is awarded
  perform _referral_issue_signup_reward(id) from referrals where referrer_profile_id = c_id;
  got := pg_temp.lsum(c_id, 'referral_milestone_bonus') || '|' || pg_temp.lsum(c_id, 'referral_signup_reward') || '|' ||
         (select count(*) from referral_milestone_awards where referrer_profile_id = c_id);
  r := r || pg_temp.chk('M2', 'milestone awarded exactly once (re-running the step is a no-op)', got, got = '5|5|1');

  got := pg_temp.pv(n[14], pg_temp.claim_sql(c_code), true);
  got := got || '|' ||
         (select (flagged_at is not null)::text || ',' || coalesce(flag_reason, '') from referrals where referred_profile_id = nid[14]) || '|' ||
         pg_temp.lsum(c_id, 'referral_signup_reward') || '|' || pg_temp.bal(nid[14]);
  r := r || pg_temp.chk('V1', '6th referral in 24 h → flagged for review, credits still issued', got,
          got like 'claimed|true,6 referrals by this referrer in 24 hours%|6|1');
  got := (select count(*) from referrals where referrer_profile_id = c_id and flagged_at is not null)::text;
  r := r || pg_temp.chk('V2', 'earlier referrals (≤ threshold) not flagged', got, got = '1');

  got := pg_temp.pv(v_basic, 'select list_flagged_referrals()::text') || ' || ' ||
         pg_temp.pv(v_sa, $q$select (select count(*) from jsonb_array_elements(list_flagged_referrals()) x where (x->>'referrer_id')::bigint = $q$ || c_id || ')::text');
  r := r || pg_temp.chk('V3', 'list_flagged_referrals: basic → not authorized; super admin → sees the flag', got, got like 'err:not authorized% || 1');
  select id into v_ref from referrals where referred_profile_id = nid[14];
  got := pg_temp.pv(v_basic, format('select review_referral_flag(%s)::text', v_ref)) || ' || ' ||
         pg_temp.pv(v_sa, format($q$select review_referral_flag(%s)->>'status'$q$, v_ref), true);
  got := got || '|' || pg_temp.pv(v_sa, format($q$select review_referral_flag(%s)->>'status'$q$, v_ref), true);
  got := got || '|' ||
         (select (flag_reviewed_at is not null)::text from referrals where id = v_ref) || '|' ||
         (select count(*) from audit_log where action = 'referral_flag.reviewed' and entity_id = v_ref);
  r := r || pg_temp.chk('V4', 'review_referral_flag: basic refused; SA marks reviewed once (audited)', got,
          got like 'err:not authorized% || reviewed|not_flagged_or_already_reviewed|true|1');

  -- milestones configurable + disabled
  got := pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"milestones":[{"threshold":7,"bonus":3},{"threshold":5,"bonus":5}]}')->>'status'$q$, true)
;
  got := got || '|' || (select milestones::text from giveaway_earning_rules);
  r := r || pg_temp.chk('M3', 'milestones editable; stored sorted by threshold', got,
          got = 'saved|[{"bonus": 5, "threshold": 5}, {"bonus": 3, "threshold": 7}]');
  got := pg_temp.pv(n[15], pg_temp.claim_sql(c_code), true) || '|' || pg_temp.lsum(c_id, 'referral_milestone_bonus');
  r := r || pg_temp.chk('M4', '7th referral → new 7-referral milestone (+3) awarded once; 5 not repeated', got, got = 'claimed|8');
  perform pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"milestones_enabled":false,"milestones":[{"threshold":8,"bonus":4}]}')->>'status'$q$, true);
  got := pg_temp.pv(n[16], pg_temp.claim_sql(c_code), true) || '|' || pg_temp.lsum(c_id, 'referral_milestone_bonus') || '|' || pg_temp.lsum(c_id, 'referral_signup_reward');
  r := r || pg_temp.chk('M5', 'milestones disabled → no bonus at 8; per-referral +1 still paid', got, got = 'claimed|8|8');

  -- set_giveaway_earning_rules validation + audit
  got := pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"milestones":[{"threshold":5,"bonus":1},{"threshold":5,"bonus":2}]}')->>'status'$q$, true)
      || '|' || pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"nope":1}')->>'status'$q$, true)
      || '|' || pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"referrer_reward":500}')->>'status'$q$, true)
      || '|' || pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"referrer_reward":"2"}')->>'status'$q$, true)
      || '|' || pg_temp.pv(v_sa, $q$select set_giveaway_earning_rules('{"referrer_reward":2.5}')->>'status'$q$, true)
      || '|' || pg_temp.pv(v_basic, $q$select set_giveaway_earning_rules('{"referrer_reward":2}')::text$q$);
  r := r || pg_temp.chk('A1', 'invalid edits refused (dup thresholds, unknown field, out of range, wrong type, fraction, non-admin)', got,
          got like 'invalid|unknown_field|out_of_range|invalid|invalid|err:not authorized%');
  got := (select count(*)::text from audit_log where action = 'giveaway_earning_rules.update' and user_id = sa_id) || '|' ||
         (select (details->'changed')::text from audit_log where action = 'giveaway_earning_rules.update' order by id desc limit 1);
  r := r || pg_temp.chk('A2', 'each successful rules change writes audit_log (before/after/changed)', got,
          split_part(got, '|', 1)::int >= 8 and got like '%milestones_enabled%');
  got := pg_temp.pv(v_sa, $q$update giveaway_earning_rules set referrer_reward = 9 where id returning referrer_reward::text$q$);
  r := r || pg_temp.chk('A3', 'direct table writes refused even for super admin (RPC only)', got, got like 'err:%');

  -- ── wallet giveaways: end by date / entries / both ─────────────────────────────────────
  got := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, end_date, max_entries, entry_mode, per_user_max, end_type, status, created_by)
          values ('ertest date-only', 10, now() + interval '10 days', null, 'wallet', 2, 'date', 'draft', %s) returning id::text$q$, sa_id), true);
  v_g := nullif(regexp_replace(got, '[^0-9]', '', 'g'), '')::int;
  r := r || pg_temp.chk('W1', 'date-only wallet giveaway (no capacity) can be created', got, v_g is not null and got !~ 'err');
  got := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, end_date, max_entries, entry_mode, per_user_max, status, created_by)
          values ('ertest no end', 10, null, null, 'wallet', 2, 'draft', %s) returning id::text$q$, sa_id), true);
  r := r || pg_temp.chk('W2', 'wallet giveaway with neither date nor capacity still refused', got, got like 'err:%giveaways_wallet_capacity%');
  got := pg_temp.pv(v_sa, format($q$select publish_giveaway(%s)->>'status'$q$, v_g), true);
  r := r || pg_temp.chk('W3', 'wallet publish hold still ON', got, got = 'wallet_publish_on_hold');

  -- simulate a lifted hold: make it active as the publish op would
  perform set_config('compete.giveaway_op', 'publish', true);
  update giveaways set status = 'active', published_at = now() where id = v_g;
  perform set_config('compete.giveaway_op', '', true);
  perform pg_temp.pv(v_sa, format($q$select admin_grant_giveaway_entries(%s, 5, 'ertest', 'ertest-grant-n1')::text$q$, nid[1]), true);
  v_req := gen_random_uuid();
  got := pg_temp.pv(n[1], format($q$select enter_wallet_giveaway(%s, 2, %L, '{"name_as_on_id":"Er Test","email":"e@example.invalid","phone":"5555555555","birthday":"1990-01-01","agreed_to_rules":true,"agreed_to_privacy":true,"confirmed_age":true}'::jsonb)::text$q$, v_g, v_req), true);
  got := (got::jsonb->>'status') || ',' || coalesce(got::jsonb->>'capacity', 'null') || ',' || (got::jsonb->>'closed') || '|' || pg_temp.bal(nid[1]);
  r := r || pg_temp.chk('W4', 'date-only (unlimited) wallet giveaway: spend 2 from the general wallet (1 referral + 5 grant)', got, got = 'entered,null,false|4');
  got := pg_temp.pv(n[1], format($q$select enter_wallet_giveaway(%s, 1, %L, null)->>'status'$q$, v_g, gen_random_uuid()), true) || '|' || pg_temp.bal(nid[1]);
  r := r || pg_temp.chk('W5', 'per-giveaway max per user (2) enforced; balance untouched', got, got = 'per_user_cap|4');
  got := pg_temp.pv(n[1], format($q$select enter_wallet_giveaway(%s, 2, %L, null)->>'status'$q$, v_g, v_req), true) || '|' || pg_temp.bal(nid[1]);
  r := r || pg_temp.chk('W6', 'replayed request id is idempotent (duplicate, no charge)', got, got = 'duplicate|4');
  got := pg_temp.pv(v_sa, format($q$select cancel_wallet_giveaway(%s, 'ertest refund')->>'status'$q$, v_g), true) || '|' || pg_temp.bal(nid[1]);
  r := r || pg_temp.chk('W7', 'cancel & refund returns exactly the spent entries', got, got like '%|6');

  -- capacity giveaway: guard floor still applies when a capacity is set
  got := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, end_date, max_entries, entry_mode, per_user_max, end_type, status, created_by)
          values ('ertest capacity', 10, null, 3, 'wallet', 3, 'entries', 'draft', %s) returning id::text$q$, sa_id), true);
  v_g2 := nullif(regexp_replace(got, '[^0-9]', '', 'g'), '')::int;
  perform set_config('compete.giveaway_op', 'publish', true);
  update giveaways set status = 'active', published_at = now() where id = v_g2;
  perform set_config('compete.giveaway_op', '', true);
  got := pg_temp.pv(n[1], format($q$select enter_wallet_giveaway(%s, 2, %L, '{"name_as_on_id":"Er Test","email":"e@example.invalid","phone":"5555555555","birthday":"1990-01-01","agreed_to_rules":true,"agreed_to_privacy":true,"confirmed_age":true}'::jsonb)->>'status'$q$, v_g2, gen_random_uuid()), true)
      || '|' || pg_temp.pv(v_sa, format($q$update giveaways set max_entries = 1 where id = %s returning id::text$q$, v_g2));
  r := r || pg_temp.chk('W8', 'capacity giveaway: capacity cannot drop below existing entries', got, got like 'entered|err:capacity cannot be lowered%');
  got := pg_temp.pv(n[1], format($q$select enter_wallet_giveaway(%s, 1, %L, null)::text$q$, v_g2, gen_random_uuid()), true);
  got := (got::jsonb->>'status') || ',' || (got::jsonb->>'closed') || '|' || (select status from giveaways where id = v_g2);
  r := r || pg_temp.chk('W9', 'entries-only: reaching capacity ends it immediately', got, got = 'entered,true|ended');

  -- end sweep: date passed (both methods), capacity reached (legacy), future/below capacity untouched
  insert into giveaways (name, prize_value, end_date, max_entries, status, created_by, published_at)
  values ('ertest legacy past date', 1, now() + interval '1 day', 50, 'active', sa_id, now()) returning id into v_g3;
  update giveaways set end_date = now() - interval '1 minute' where id = v_g3;
  insert into giveaways (name, prize_value, end_date, max_entries, status, created_by, published_at)
  values ('ertest legacy full', 1, now() + interval '10 days', 1, 'active', sa_id, now()) returning id into v_g;
  insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone, agreed_to_rules, agreed_to_privacy, confirmed_age)
  values (v_g, nid[2], 'Er Test', '1990-01-01', 'e2@example.invalid', '5555555555', true, true, true);
  insert into giveaways (name, prize_value, end_date, max_entries, status, created_by, published_at)
  values ('ertest legacy both open', 1, now() + interval '10 days', 50, 'active', sa_id, now()) returning id into v_g2;
  perform _giveaway_end_due_sweep();
  got := (select status from giveaways where id = v_g3) || '|' || (select status from giveaways where id = v_g) || '|' ||
         (select status from giveaways where id = v_g2);
  r := r || pg_temp.chk('E1', 'sweep: date passed → ended; capacity reached → ended; neither → stays active', got, got = 'ended|ended|active');

  -- no expiry anywhere
  got := (select count(*)::text from information_schema.columns where table_schema = 'public'
           and table_name in ('giveaway_wallets', 'giveaway_credit_ledger', 'giveaway_earning_rules') and column_name ilike '%expir%');
  r := r || pg_temp.chk('X1', 'no expiry columns on wallet / ledger / rules (entries never expire)', got, got = '0');

  select count(*) filter (where (x->>'pass')::boolean), count(*) filter (where not (x->>'pass')::boolean)
    into v_pass, v_fail from jsonb_array_elements(r) x where x ? 'pass';
  raise exception 'VERIFY_RESULT:%', jsonb_build_object('pass', v_pass, 'fail', v_fail, 'results', r)::text;
end
$verify$;
