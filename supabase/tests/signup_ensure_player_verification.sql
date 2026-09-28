-- supabase/tests/signup_ensure_player_verification.sql
--
-- ROLLBACK-ONLY production verification for 20261007120000_fix_ensure_player_signup.sql.
-- Replays what Supabase Auth does on email signup (INSERT auth.users → UPDATE email_confirmed_at
-- → UPDATE last_sign_in_at) and what the app does next (INSERT profiles, claim_referral), BEFORE
-- and AFTER applying the fix inside the statement. Always ends with RAISE → everything rolls back.

do $verify$
declare
  r jsonb := '[]'::jsonb;
  v_pass int := 0;
  v_fail int := 0;
  u1 uuid := gen_random_uuid();   -- before fix
  u2 uuid := gen_random_uuid();   -- after fix, plain signup
  u3 uuid := gen_random_uuid();   -- after fix, signup with referral
  u4 uuid := gen_random_uuid();   -- after fix, email matches an existing PENDING player
  ref_code text; ref_id bigint;
  pend uuid;
  got text;
begin
  execute $h$
    create function pg_temp.chk(p_id text, p_desc text, p_got text, p_ok boolean) returns jsonb
    language sql as $f$ select jsonb_build_object('id', p_id, 'test', p_desc, 'got', p_got, 'pass', coalesce(p_ok, false)) $f$;
  $h$;
  -- Auth's three writes for one email signup; returns 'ok' or the error.
  execute $h$
    create function pg_temp.auth_signup(p_id uuid, p_email text) returns text
    language plpgsql as $f$
    begin
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, 'x',
              '{"provider":"email","providers":["email"]}', '{}', now(), now());
      update auth.users set email_confirmed_at = now() where id = p_id;
      update auth.users set last_sign_in_at = now() where id = p_id;
      return 'ok';
    exception when others then
      return 'err:' || sqlstate || ' ' || sqlerrm;
    end $f$;
  $h$;
  execute $h$
    create function pg_temp.pv(p_uid uuid, p_sql text) returns text
    language plpgsql as $f$
    declare v text;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', p_uid::text, true);
      perform set_config('role', 'authenticated', true);
      execute p_sql into v;
      perform set_config('role', 'postgres', true);
      return coalesce(v, '<null>');
    exception when others then
      perform set_config('role', 'postgres', true);
      return 'err:' || sqlerrm;
    end $f$;
  $h$;

  -- ── BEFORE: the live function breaks Auth's confirm step ──────────────────────────────
  got := pg_temp.auth_signup(u1, 'sigtest1-' || substr(u1::text, 1, 8) || '@example.invalid');
  r := r || pg_temp.chk('B1', 'BEFORE fix: email signup fails at the confirm step (FK on players.profile_id)', got,
          got like 'err:23503%players_profile_id_fkey%');

  -- ── APPLY ──────────────────────────────────────────────────────────────────────────────
  execute __MIGRATION__;

  -- ── 1. plain signup ───────────────────────────────────────────────────────────────────
  got := pg_temp.auth_signup(u2, 'sigtest2-' || substr(u2::text, 1, 8) || '@example.invalid');
  got := got || '|' || (select count(*) from auth.users where id = u2 and email_confirmed_at is not null and last_sign_in_at is not null)
      || '|' || (select count(*) from players where profile_id = u2);
  r := r || pg_temp.chk('S1', 'signup succeeds; auth user confirmed + signed in; no player yet (no profile)', got, got = 'ok|1|0');
  insert into profiles (id, email, name, first_name, last_name, user_name, home_state, preferred_game, favorite_player, status)
  values (u2, 'sigtest2-' || substr(u2::text, 1, 8) || '@example.invalid', 'Sig Two', 'Sig', 'Two', 'sigtesttwo', 'AZ', '8-Ball', 'Tyelerr', 'active');
  got := (select count(*) from players where profile_id = u2)
      || '|' || (select count(*) from referral_codes where profile_id = (select id_auto from profiles where id = u2))
      || '|' || (select home_state || ',' || preferred_game || ',' || favorite_player from profiles where id = u2);
  r := r || pg_temp.chk('S2', 'profile insert → exactly one player + a referral code; fields saved', got, got = '1|1|AZ,8-Ball,Tyelerr');

  -- ── 2. signup with a valid referral code → referrer +1 exactly once ─────────────────
  select c.code, c.profile_id into ref_code, ref_id from referral_codes c join profiles p on p.id_auto = c.profile_id
   where c.disabled_at is null and p.role = 'basic_user' and coalesce(p.status, 'active') = 'active' and not p.is_disabled and p.deleted_at is null
   order by c.profile_id limit 1;
  got := pg_temp.auth_signup(u3, 'sigtest3-' || substr(u3::text, 1, 8) || '@example.invalid');
  insert into profiles (id, email, name, first_name, last_name, user_name, home_state, status)
  values (u3, 'sigtest3-' || substr(u3::text, 1, 8) || '@example.invalid', 'Sig Three', 'Sig', 'Three', 'sigtestthree', 'AZ', 'active');
  got := got || '|' || pg_temp.pv(u3, format($q$select claim_referral(%L, 'manual')->>'status'$q$, ref_code));
  got := got || '|' || pg_temp.pv(u3, format($q$select claim_referral(%L, 'manual')->>'status'$q$, ref_code));
  got := got || '|' || (select count(*) from giveaway_credit_ledger l join referrals rf on rf.id = l.referral_id
                        where rf.referred_profile_id = (select id_auto from profiles where id = u3) and l.reason = 'referral_signup_reward')
      || '|' || (select count(*) from players where profile_id = u3);
  r := r || pg_temp.chk('S3', 'signup + referral: claimed once, referrer rewarded exactly once, one player', got,
          got = 'ok|claimed|already_claimed|1|1');

  -- ── 3. email matches an existing PENDING player → linked at profile creation ─────────
  insert into players (display_name, first_name, last_name, email, account_status)
  values ('Pending Sig', 'Pending', 'Sig', 'sigtest4-' || substr(u4::text, 1, 8) || '@example.invalid', 'PENDING')
  returning id into pend;
  got := pg_temp.auth_signup(u4, 'sigtest4-' || substr(u4::text, 1, 8) || '@example.invalid');
  insert into profiles (id, email, name, first_name, last_name, user_name, home_state, status)
  values (u4, 'sigtest4-' || substr(u4::text, 1, 8) || '@example.invalid', 'Sig Four', 'Sig', 'Four', 'sigtestfour', 'AZ', 'active');
  got := got || '|' || (select count(*) from players where profile_id = u4)
      || '|' || (select (profile_id = u4 and account_status = 'ACTIVE')::text from players where id = pend);
  r := r || pg_temp.chk('S4', 'pending player with the same email is claimed (no duplicate player)', got, got = 'ok|1|true');

  -- ── 4. existing user sign-in path still works ─────────────────────────────────────────
  got := (select count(*)::text from auth.users where last_sign_in_at is not null);
  begin
    update auth.users set last_sign_in_at = now() where id = (select id from profiles order by id_auto limit 1);
    got := 'ok';
  exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.chk('S5', 'existing user sign-in update still works', got, got = 'ok');

  select count(*) filter (where (x->>'pass')::boolean), count(*) filter (where not (x->>'pass')::boolean)
    into v_pass, v_fail from jsonb_array_elements(r) x;
  raise exception 'VERIFY_RESULT:%', jsonb_build_object('pass', v_pass, 'fail', v_fail, 'results', r)::text;
end
$verify$;
