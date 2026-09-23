-- supabase/tests/referral_attribution_verification.sql
--
-- ROLLBACK-ONLY production verification for 20261002120000_referral_attribution.sql.
-- NOT a migration. One single DO statement:
--   1. applies the migration INSIDE the statement (incl. the real backfill over prod profiles),
--   2. creates throwaway brand-new accounts (auth.users + profiles) to exercise the new-user
--      trigger and the claim window — prod has no account inside the window,
--   3. replays every case as real/throwaway accounts (auth.uid() via request.jwt.claims,
--      current_user via SET LOCAL ROLE anon/authenticated),
--   4. ALWAYS ends with RAISE EXCEPTION carrying the JSON results → everything rolls back.
-- The runner substitutes the single MIGRATION placeholder below with the migration file as a
-- dollar-quoted literal.
-- Side effects: none persist. Rolled-back inserts can only advance identity/id sequences.
-- Profile inserts fire the existing AFTER INSERT triggers (notif prefs, provision player) — all
-- rolled back; no pg_net / notifications / cron are invoked.

do $verify$
declare
  r      jsonb := '[]'::jsonb;
  v_pass int := 0;
  v_fail int := 0;
  -- existing accounts (old — outside any claim window)
  v_ref uuid;  v_ref_id bigint;  v_ref_code text;   -- a referrer
  v_old uuid;  v_old_id bigint;                     -- another old basic user
  v_dis_id bigint; v_dis_code text;                 -- owner of a code we disable
  v_sa  uuid;                                       -- super_admin
  -- throwaway brand-new accounts
  n1 uuid := gen_random_uuid();  n1_id bigint;
  n2 uuid := gen_random_uuid();  n2_id bigint;
  n3 uuid := gen_random_uuid();  n3_id bigint;
  n4 uuid := gen_random_uuid();  n4_id bigint;
  t_profiles bigint;
  got text;
begin
  -- ── helpers ─────────────────────────────────────────────────────────────────────────────
  -- pv(uid, sql, keep): run one scalar query as a user (null = anon). keep=false → its effects
  -- are rolled back; keep=true → effects persist for later steps (the whole DO still rolls back).
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
        if p_keep then
          return coalesce(v, '<null>');
        end if;
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

  -- ── APPLY (includes backfill over real prod profiles) ───────────────────────────────────
  execute __MIGRATION__;

  -- ── existing actors ─────────────────────────────────────────────────────────────────────
  select id, id_auto into v_ref, v_ref_id from profiles where role = 'basic_user' and status = 'active' order by id_auto limit 1;
  select id, id_auto into v_old, v_old_id from profiles where role = 'basic_user' and status = 'active' and id_auto <> v_ref_id order by id_auto limit 1;
  select id_auto into v_dis_id from profiles where role = 'basic_user' and status = 'active' and id_auto not in (v_ref_id, v_old_id) order by id_auto limit 1;
  select id into v_sa from profiles where role = 'super_admin' order by id_auto limit 1;
  select code into v_ref_code from referral_codes where profile_id = v_ref_id and disabled_at is null;
  select code into v_dis_code from referral_codes where profile_id = v_dis_id and disabled_at is null;
  select count(*) into t_profiles from profiles;

  -- ── backfill ────────────────────────────────────────────────────────────────────────────
  got := (select count(*)::text from referral_codes);
  r := r || pg_temp.chk('B1', 'backfill: one code per existing profile', got, got = t_profiles::text);
  got := (select count(*)::text from profiles p where (select count(*) from referral_codes c where c.profile_id = p.id_auto and c.disabled_at is null) <> 1 and p.id_auto <> v_dis_id);
  r := r || pg_temp.chk('B2', 'backfill: no profile with 0 or >1 active codes', got, got = '0');
  got := (select count(*)::text from (select code from referral_codes group by code having count(*) > 1) d);
  r := r || pg_temp.chk('B3', 'backfill: no duplicate codes', got, got = '0');
  got := (select string_agg(p.user_name || '=' || c.code, ',' order by p.id_auto) from profiles p join referral_codes c on c.profile_id = p.id_auto where upper(regexp_replace(p.user_name, '[^A-Za-z0-9]', '', 'g')) in ('COMPETE', 'TMONEYHILL'));
  r := r || pg_temp.chk('B4', 'backfill: case-insensitive username twins → older bare, newer suffixed', replace(got, E'\n', '\n'), got ~ '=COMPETE,.*=COMPETE2' and got ~ '=TMONEYHILL,.*=TMONEYHILL2');
  got := (select count(*)::text from referral_codes where code !~ '^[A-Z0-9]{3,16}$');
  r := r || pg_temp.chk('B5', 'backfill: every code is A-Z0-9, 3-16 chars', got, got = '0');
  begin
    perform public._referral_ensure_code(id_auto) from profiles;           -- re-run
    got := (select count(*)::text from referral_codes);
  exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.chk('B6', 'backfill is idempotent (re-run adds nothing)', got, got = t_profiles::text);
  -- Disable one real code AFTER the idempotency check (a later backfill re-run would give
  -- that profile a fresh active code — retire-and-reissue semantics).
  update referral_codes set disabled_at = now() where profile_id = v_dis_id;   -- a disabled code

  -- ── throwaway NEW accounts (fires the new-user trigger) ─────────────────────────────────
  insert into auth.users (id, email, created_at) values
    (n1, 'reftest1@example.invalid', now()), (n2, 'reftest2@example.invalid', now()),
    (n3, 'reftest3@example.invalid', now()), (n4, 'reftest4@example.invalid', now());
  insert into profiles (id, email, name, user_name, home_state) values
    (n1, 'reftest1@example.invalid', 'Ref Test1', 'reftestnew1', 'CA'),
    (n2, 'reftest2@example.invalid', 'Ref Test2', 'reftestnew2', 'CA'),
    (n3, 'reftest3@example.invalid', 'Ref Test3', 'reftestnew3', 'CA'),
    (n4, 'reftest4@example.invalid', 'Ref Test4', 'reftestnew4', 'CA');
  select id_auto into n1_id from profiles where id = n1;
  select id_auto into n2_id from profiles where id = n2;
  select id_auto into n3_id from profiles where id = n3;
  select id_auto into n4_id from profiles where id = n4;

  got := (select code from referral_codes where profile_id = n1_id and disabled_at is null);
  r := r || pg_temp.chk('N1', 'new profile gets a code from the trigger', got, got = 'REFTESTNEW1');
  got := pg_temp.pv(n1, 'select get_my_referral_code()');
  r := r || pg_temp.chk('N2', 'get_my_referral_code returns the caller''s code', got, got = 'REFTESTNEW1');
  got := pg_temp.pv(null, 'select get_my_referral_code()');
  r := r || pg_temp.chk('N3', 'anon cannot call get_my_referral_code', got, got like 'err:permission denied%');

  -- ── resolve ─────────────────────────────────────────────────────────────────────────────
  got := pg_temp.pv(null, format($q$select resolve_referral_code(%L)->>'valid'$q$, lower(v_ref_code)));
  r := r || pg_temp.chk('V1', 'resolve: valid code, lower-case, as anon', got, got = 'true');
  got := pg_temp.pv(null, $q$select resolve_referral_code('NOPE_NOT_A_CODE')->>'valid'$q$);
  r := r || pg_temp.chk('V2', 'resolve: invalid code', got, got = 'false');
  got := pg_temp.pv(null, format($q$select resolve_referral_code(%L)->>'valid'$q$, v_dis_code));
  r := r || pg_temp.chk('V3', 'resolve: disabled code', got, got = 'false');
  got := pg_temp.pv(null, format($q$select (select string_agg(k, ',' order by k) from jsonb_object_keys(x) k) || '|' || (x->>'code') || '|' || (x->>'inviter') from resolve_referral_code(%L) x$q$, lower(v_ref_code)));
  r := r || pg_temp.chk('V4', 'resolve exposes only {valid,code,inviter}; code upper-case; inviter "First L."', got,
         got = 'code,inviter,valid|' || v_ref_code || '|' || (select first_name || ' ' || upper(left(last_name, 1)) || '.' from profiles where id_auto = v_ref_id));
  got := pg_temp.pv(null, $q$select resolve_referral_code('NOPE_NOT_A_CODE')::text$q$);
  r := r || pg_temp.chk('V5', 'invalid code leaks nothing', got, got = '{"code": null, "valid": false, "inviter": null}');
  got := pg_temp.pv(null, format($q$select resolve_referral_code(%L)->>'valid'$q$, (select code from referral_codes where profile_id = n1_id)));
  r := r || pg_temp.chk('V6', 'brand-new user code resolves immediately', got, got = 'true');

  -- ── claims ──────────────────────────────────────────────────────────────────────────────
  got := pg_temp.pv(null, format($q$select claim_referral(%L, 'link')->>'status'$q$, v_ref_code));
  r := r || pg_temp.chk('C1', 'unauthenticated claim refused', got, got like 'err:permission denied%');
  got := pg_temp.pv(n1, format($q$select claim_referral(%L, 'link')->>'status'$q$, ' ' || lower(v_ref_code) || ' '), true);
  r := r || pg_temp.chk('C2', 'valid LINK claim (lower-case, padded) → claimed', got, got = 'claimed');
  got := (select referrer_profile_id || '/' || source || '/' || (referral_code_id is not null) from referrals where referred_profile_id = n1_id);
  r := r || pg_temp.chk('C3', 'recorded: referrer = code owner, source link, code id set', got, got = v_ref_id || '/link/true');
  got := pg_temp.pv(n1, format($q$select claim_referral(%L, 'link')::text$q$, v_ref_code), true);
  r := r || pg_temp.chk('C4', 'repeat identical claim → idempotent already_claimed, ok', got, got = '{"ok": true, "status": "already_claimed"}');
  got := pg_temp.pv(n1, $q$select claim_referral('REFTESTNEW2', 'manual')->>'status'$q$, true);
  r := r || pg_temp.chk('C5', 'switching referrer refused → already_attributed', got, got = 'already_attributed');
  got := (select referrer_profile_id::text from referrals where referred_profile_id = n1_id);
  r := r || pg_temp.chk('C6', 'original referrer unchanged after switch attempt', got, got = v_ref_id::text);
  got := pg_temp.pv(n2, $q$select claim_referral('reftestnew2', 'manual')->>'status'$q$, true);
  r := r || pg_temp.chk('C7', 'self-referral refused', got, got = 'self_referral');
  got := pg_temp.pv(n2, $q$select claim_referral('NOPE_NOT_A_CODE', 'manual')->>'status'$q$, true);
  r := r || pg_temp.chk('C8', 'invalid code refused', got, got = 'invalid_code');
  got := pg_temp.pv(n2, format($q$select claim_referral(%L, 'manual')->>'status'$q$, v_dis_code), true);
  r := r || pg_temp.chk('C9', 'disabled code refused', got, got = 'invalid_code');
  got := pg_temp.pv(v_old, format($q$select claim_referral(%L, 'manual')->>'status'$q$, v_ref_code), true);
  r := r || pg_temp.chk('C10', 'old account outside window refused', got, got = 'window_expired');
  got := pg_temp.pv(v_old, format($q$with u as (update profiles set created_at = now() where id = auth.uid() returning 1) select (select claim_referral(%L, 'manual')->>'status') from u$q$, v_ref_code));
  r := r || pg_temp.chk('C11', 'spoofing own profiles.created_at does not open the window', got, got = 'window_expired');
  got := pg_temp.pv(n2, $q$select claim_referral('REFTESTNEW3', 'manual')->>'status'$q$, true);
  r := r || pg_temp.chk('C12', 'valid MANUAL claim (n2 ← n3) → claimed', got, got = 'claimed');
  got := pg_temp.pv(n3, $q$select claim_referral('REFTESTNEW2', 'manual')->>'status'$q$, true);
  r := r || pg_temp.chk('C13', 'mutual A↔B loop refused', got, got = 'mutual_referral');
  got := pg_temp.pv(n4, $q$select claim_referral('REFTESTNEW1', 'bogus_source')::text$q$, true);
  r := r || pg_temp.chk('C14', 'chain n4 ← n1 (n1 ← ref) is a plain direct claim', got, got like '%claimed%');
  got := (select source || '|' || (select count(*) from referrals where referrer_profile_id = v_ref_id)::text from referrals where referred_profile_id = n4_id);
  r := r || pg_temp.chk('C15', 'untrusted source coerced to manual; ref has exactly 1 direct referral (no downline)', got, got = 'manual|1');
  begin
    insert into referrals (referred_profile_id, referrer_profile_id, source) values (n1_id, v_old_id, 'manual');
    got := 'inserted';
  exception when unique_violation then got := 'unique_violation'; end;
  r := r || pg_temp.chk('C16', 'DB unique(referred) blocks a second row even for the table owner (race backstop)', got, got = 'unique_violation');

  -- ── direct table access ─────────────────────────────────────────────────────────────────
  got := pg_temp.pv(n2, format($q$insert into referrals (referred_profile_id, referrer_profile_id, source) values (%s, %s, 'manual') returning id::text$q$, n2_id, v_ref_id));
  r := r || pg_temp.chk('D1', 'user cannot INSERT referrals directly', got, got like 'err:permission denied%');
  got := pg_temp.pv(n1, format($q$with u as (update referrals set referrer_profile_id = %s where referred_profile_id = %s returning 1) select count(*)::text from u$q$, v_old_id, n1_id));
  r := r || pg_temp.chk('D2', 'user cannot UPDATE their attribution', got, got like 'err:permission denied%');
  got := pg_temp.pv(n1, format($q$with d as (delete from referrals where referred_profile_id = %s returning 1) select count(*)::text from d$q$, n1_id));
  r := r || pg_temp.chk('D3', 'user cannot DELETE their attribution', got, got like 'err:permission denied%');
  got := pg_temp.pv(n2, format($q$insert into referral_codes (profile_id, code) values (%s, 'HIJACK') returning id::text$q$, v_ref_id));
  r := r || pg_temp.chk('D4', 'user cannot create codes (for anyone)', got, got like 'err:permission denied%');
  got := pg_temp.pv(n2, $q$with u as (update referral_codes set code = 'MINE' where profile_id = public._authz_my_id_auto() returning 1) select count(*)::text from u$q$);
  r := r || pg_temp.chk('D5', 'user cannot edit their own code', got, got like 'err:permission denied%');
  got := pg_temp.pv(n1, 'select count(*)::text from referrals');
  r := r || pg_temp.chk('D6', 'user reads 0 referral rows (admin-only in phase 1)', got, got = '0');
  got := pg_temp.pv(n1, 'select string_agg(code, '','') from referral_codes');
  r := r || pg_temp.chk('D7', 'user reads only their own code row', got, got = 'REFTESTNEW1');
  got := pg_temp.pv(null, 'select count(*)::text from referral_codes');
  r := r || pg_temp.chk('D8', 'anon cannot read referral_codes', got, got like 'err:permission denied%');
  got := pg_temp.pv(null, 'select count(*)::text from referrals');
  r := r || pg_temp.chk('D9', 'anon cannot read referrals', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_sa, 'select count(*)::text from referrals');
  r := r || pg_temp.chk('D10', 'super_admin reads all referral rows', got, got = (select count(*)::text from referrals));
  got := pg_temp.pv(v_sa, 'select count(*)::text from referral_codes');
  r := r || pg_temp.chk('D11', 'super_admin reads all codes', got, got = (select count(*)::text from referral_codes));
  got := pg_temp.pv(n1, 'select public._referral_ensure_code(1)');
  r := r || pg_temp.chk('D12', 'internal generator not client-callable', got, got like 'err:permission denied%');

  -- ── account deletion still works (FK on-delete behavior) ────────────────────────────────
  got := pg_temp.pv(n3, 'select public.delete_user_account()::text', true);    -- n3 referred n2
  r := r || pg_temp.chk('X1', 'delete_user_account succeeds for a REFERRER', got, got not like 'err:%');
  got := (select coalesce(referrer_profile_id::text, 'null') || '/' || coalesce(referral_code_id::text, 'null') from referrals where referred_profile_id = n2_id);
  r := r || pg_temp.chk('X2', 'referred user keeps attribution row; referrer + code set null', got, got = 'null/null');
  got := pg_temp.pv(n2, format($q$select claim_referral(%L, 'manual')->>'status'$q$, v_ref_code), true);
  r := r || pg_temp.chk('X3', 'after referrer deletion, referred user still cannot re-claim', got, got = 'already_attributed');
  got := pg_temp.pv(n4, 'select public.delete_user_account()::text', true);    -- n4 was referred
  r := r || pg_temp.chk('X4', 'delete_user_account succeeds for a REFERRED user; row cascades', got || '|' || (select count(*) from referrals where referred_profile_id = n4_id), got not like 'err:%' and (select count(*) from referrals where referred_profile_id = n4_id) = 0);

  select count(*) filter (where (x->>'pass')::boolean), count(*) filter (where not (x->>'pass')::boolean)
    into v_pass, v_fail from jsonb_array_elements(r) x where x ? 'pass';
  raise exception 'VERIFY_RESULT:%', jsonb_build_object('pass', v_pass, 'fail', v_fail, 'results', r)::text;
end
$verify$;
