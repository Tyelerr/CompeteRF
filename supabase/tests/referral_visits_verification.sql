-- supabase/tests/referral_visits_verification.sql
--
-- ROLLBACK-ONLY production verification for 20261004120000_referral_visits.sql.
-- One DO statement: applies the migration inside it (the runner substitutes the single MIGRATION
-- placeholder below), replays every case as real / throwaway accounts, then ALWAYS raises with
-- the JSON results so everything rolls back. No data persists.

do $verify$
declare
  r      jsonb := '[]'::jsonb;
  v_pass int := 0;
  v_fail int := 0;
  v_ref uuid; v_ref_id bigint; v_ref_code text;      -- referrer (existing account)
  v_oth uuid; v_oth_id bigint; v_oth_code text;      -- another code owner
  v_sa  uuid;
  n1 uuid := gen_random_uuid(); n1_id bigint;        -- throwaway new user who gets referred
  n2 uuid := gen_random_uuid();                      -- throwaway new user with no referral
  vis uuid; vis2 uuid; vis_other uuid; vis_old uuid;
  got text;
  i int;
begin
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

  execute __MIGRATION__;

  select p.id, p.id_auto, c.code into v_ref, v_ref_id, v_ref_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and p.status = 'active' order by p.id_auto limit 1;
  select p.id, p.id_auto, c.code into v_oth, v_oth_id, v_oth_code from profiles p join referral_codes c on c.profile_id = p.id_auto and c.disabled_at is null
   where p.role = 'basic_user' and p.status = 'active' and p.id_auto <> v_ref_id order by p.id_auto limit 1;
  select id into v_sa from profiles where role = 'super_admin' order by id_auto limit 1;

  -- ── log_referral_visit ──────────────────────────────────────────────────────────────────
  vis := pg_temp.pv(null, format($q$select log_referral_visit(%L, 'web', 'android', 'spring_flyer')::text$q$, lower(v_ref_code)), true)::uuid;
  got := (select channel || '/' || platform || '/' || coalesce(campaign, '-') || '/' || (referral_code_id = (select id from referral_codes where code = v_ref_code)) from referral_visits where id = vis);
  r := r || pg_temp.chk('L1', 'anon logs a visit (lower-case code) → uuid; coarse fields only', vis::text || ' ' || got, vis is not null and got = 'web/android/spring_flyer/true');
  got := pg_temp.pv(null, $q$select coalesce(log_referral_visit('NOPE_NOT_A_CODE')::text, 'null')$q$, true);
  r := r || pg_temp.chk('L2', 'invalid code → null (nothing stored)', got, got = 'null');
  got := pg_temp.pv(null, format($q$select log_referral_visit(%L, 'hacked', 'toaster', 'x y;drop')::text$q$, v_ref_code), true);
  got := (select channel || '/' || platform || '/' || coalesce(campaign, '-') from referral_visits where id = got::uuid);
  r := r || pg_temp.chk('L3', 'unknown channel/platform coerced, non-slug campaign dropped', got, got = 'web/unknown/-');
  got := (select count(*)::text from information_schema.columns where table_name = 'referral_visits'
           and column_name ~* '(ip|agent|device|fingerprint|advert|idfa|gaid|email|phone|user)');
  r := r || pg_temp.chk('L4', 'no IP / user-agent / device / ad-id / personal columns exist', got, got = '0');
  -- Rate limit: 30 per code per rolling minute (now() is fixed inside this transaction).
  for i in 1..40 loop
    perform pg_temp.pv(null, format($q$select log_referral_visit(%L, 'web', 'ios')::text$q$, v_oth_code), true);
  end loop;
  got := (select count(*)::text from referral_visits where referral_code_id = (select id from referral_codes where code = v_oth_code));
  r := r || pg_temp.chk('L5', 'per-code rate limit caps at 30 visits / minute (40 attempted)', got, got = '30');
  got := pg_temp.pv(null, format($q$select coalesce(log_referral_visit(%L)::text, 'null')$q$, v_oth_code), true);
  r := r || pg_temp.chk('L6', 'over the limit → null, silently', got, got = 'null');

  -- ── direct access ───────────────────────────────────────────────────────────────────────
  got := pg_temp.pv(null, 'select count(*)::text from referral_visits');
  r := r || pg_temp.chk('A1', 'anon cannot read visits', got, got like 'err:permission denied%');
  got := pg_temp.pv(null, format($q$insert into referral_visits (referral_code_id, channel, platform) values ((select id from referral_codes limit 1), 'web', 'ios') returning id::text$q$));
  r := r || pg_temp.chk('A2', 'anon cannot insert visits directly', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_ref, 'select count(*)::text from referral_visits');
  r := r || pg_temp.chk('A3', 'a normal user (even the code owner) reads 0 visit rows', got, got = '0');
  got := pg_temp.pv(v_ref, format($q$with u as (update referral_visits set installed_at = now() where id = %L returning 1) select count(*)::text from u$q$, vis));
  r := r || pg_temp.chk('A4', 'a normal user cannot update visits directly', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_ref, format($q$with d as (delete from referral_visits where id = %L returning 1) select count(*)::text from d$q$, vis));
  r := r || pg_temp.chk('A5', 'a normal user cannot delete visits', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_sa, 'select count(*)::text from referral_visits');
  r := r || pg_temp.chk('A6', 'admin reads visits (analytics)', got, got = (select count(*)::text from referral_visits));

  -- ── mark_referral_visit ─────────────────────────────────────────────────────────────────
  got := pg_temp.pv(null, format($q$select mark_referral_visit(%L, 'app_open')::text || ',' || mark_referral_visit(%L, 'app_open')::text$q$, vis, vis), true);
  r := r || pg_temp.chk('M1', 'app_open set once (second call is a no-op)', got, got = 'true,false');
  got := pg_temp.pv(null, format($q$select mark_referral_visit(%L, 'install')::text || ',' || mark_referral_visit(%L, 'install')::text$q$, vis, vis), true);
  r := r || pg_temp.chk('M2', 'install set once', got, got = 'true,false');
  got := pg_temp.pv(null, format($q$select mark_referral_visit(%L, 'purchase')::text || ',' || mark_referral_visit(gen_random_uuid(), 'app_open')::text$q$, vis), true);
  r := r || pg_temp.chk('M3', 'unknown event / unknown visit id → false', got, got = 'false,false');
  vis_old := pg_temp.pv(null, format($q$select log_referral_visit(%L)::text$q$, v_ref_code), true)::uuid;
  update referral_visits set created_at = now() - interval '31 days' where id = vis_old;
  got := pg_temp.pv(null, format($q$select mark_referral_visit(%L, 'app_open')::text$q$, vis_old), true);
  r := r || pg_temp.chk('M4', 'visits older than 30 days cannot be marked', got, got = 'false');

  -- ── link_referral_visit (after the real claim_referral) ──────────────────────────────────
  insert into auth.users (id, email, created_at) values (n1, 'visit1@example.invalid', now()), (n2, 'visit2@example.invalid', now());
  insert into profiles (id, email, name, user_name, home_state) values
    (n1, 'visit1@example.invalid', 'Visit Test1', 'visittest1', 'CA'),
    (n2, 'visit2@example.invalid', 'Visit Test2', 'visittest2', 'CA');
  select id_auto into n1_id from profiles where id = n1;
  vis2      := pg_temp.pv(null, format($q$select log_referral_visit(%L, 'web', 'ios')::text$q$, v_ref_code), true)::uuid;
  vis_other := nullif(pg_temp.pv(null, format($q$select log_referral_visit(%L, 'web', 'ios')::text$q$, v_oth_code), true), '<null>')::uuid;
  if vis_other is null then          -- v_oth hit the rate limit above; make a row directly for the check
    insert into referral_visits (referral_code_id, channel, platform)
    values ((select id from referral_codes where code = v_oth_code), 'web', 'ios') returning id into vis_other;
  end if;

  got := pg_temp.pv(n1, format($q$select link_referral_visit(%L)::text$q$, vis2), true);
  r := r || pg_temp.chk('K1', 'no referral yet → link refused', got, got = 'false');
  got := pg_temp.pv(n1, format($q$select claim_referral(%L, 'link')->>'status'$q$, v_ref_code), true);
  r := r || pg_temp.chk('K2', 'claim_referral (unchanged) still claims', got, got = 'claimed');
  got := pg_temp.pv(n1, format($q$select link_referral_visit(%L)::text$q$, vis_other), true);
  r := r || pg_temp.chk('K3', 'a visit for a DIFFERENT referrer''s code cannot be linked', got, got = 'false');
  got := pg_temp.pv(n1, format($q$select link_referral_visit(%L)::text || ',' || link_referral_visit(%L)::text$q$, vis2, vis2), true);
  r := r || pg_temp.chk('K4', 'matching visit links once; repeat is a no-op', got, got = 'true,false');
  got := (select (referral_id = (select id from referrals where referred_profile_id = n1_id))::text from referral_visits where id = vis2);
  r := r || pg_temp.chk('K5', 'visit now points at the caller''s referral row', got, got = 'true');
  update referral_visits set created_at = now() - interval '31 days' where id = vis;   -- same referrer, too old
  got := pg_temp.pv(n1, format($q$select link_referral_visit(%L)::text$q$, vis), true);
  r := r || pg_temp.chk('K6', 'visits older than 30 days are not linked', got, got = 'false');
  got := pg_temp.pv(n2, format($q$select link_referral_visit(%L)::text$q$, vis_old), true);
  r := r || pg_temp.chk('K7', 'a user with no referral cannot link anything', got, got = 'false');
  got := pg_temp.pv(null, format($q$select link_referral_visit(%L)::text$q$, vis2));
  r := r || pg_temp.chk('K8', 'anon cannot call link', got, got like 'err:permission denied%');
  got := (select count(*)::text from referrals where referred_profile_id = n1_id and referrer_profile_id = v_ref_id);
  r := r || pg_temp.chk('K9', 'the referral itself is unaffected by visit linking', got, got = '1');

  select count(*) filter (where (x->>'pass')::boolean), count(*) filter (where not (x->>'pass')::boolean)
    into v_pass, v_fail from jsonb_array_elements(r) x where x ? 'pass';
  raise exception 'VERIFY_RESULT:%', jsonb_build_object('pass', v_pass, 'fail', v_fail, 'results', r)::text;
end
$verify$;
