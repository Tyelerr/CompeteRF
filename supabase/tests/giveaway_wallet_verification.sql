-- supabase/tests/giveaway_wallet_verification.sql
--
-- ROLLBACK-ONLY production verification for 20261003120000_giveaway_wallet.sql.
-- NOT a migration. One single DO statement:
--   1. fingerprints every existing (legacy) giveaway, entry, winner-history row and the public
--      counts BEFORE,
--   2. applies the migration INSIDE the statement (the runner substitutes the single MIGRATION
--      placeholder below with the migration file as a dollar-quoted literal),
--   3. proves the legacy fingerprints are unchanged, then replays legacy + wallet + admin + abuse
--      cases as REAL accounts (auth.uid() via request.jwt.claims, SET LOCAL ROLE),
--   4. ALWAYS ends with RAISE EXCEPTION carrying the JSON results → everything rolls back.
-- Side effects: none persist (rolled-back inserts only advance id sequences). No pg_net /
-- notifications are invoked (notifications are sent by the client, not these functions).

do $verify$
declare
  r      jsonb := '[]'::jsonb;
  v_pass int := 0;
  v_fail int := 0;
  -- actors
  v_sa uuid;  v_sa_id bigint;
  v_a  uuid;  v_a_id  bigint;
  v_b  uuid;  v_b_id  bigint;
  v_c  uuid;  v_c_id  bigint;
  v_td uuid;  v_td_id bigint;
  -- legacy fixtures
  v_leg      integer;   -- an ACTIVE legacy giveaway user A has not entered
  v_leg_done integer;   -- an awarded/archived legacy giveaway
  v_max_old  integer;   -- highest pre-existing giveaway id
  -- wallet fixtures
  w1 integer; w2 integer; w3 integer;
  -- fingerprints
  fp_g1 text; fp_e1 text; fp_h1 text; fp_c1 text;
  fp_g2 text; fp_e2 text; fp_h2 text; fp_c2 text;
  v_winner1 bigint; v_winner2 bigint;
  ent  text := '{"name_as_on_id":"Wallet Test","email":"wallet.test@example.invalid","phone":"5550100","birthday":"1990-01-01","agreed_to_rules":true,"agreed_to_privacy":true,"confirmed_age":true}';
  got text;
  n   bigint;
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
  -- Fingerprints use only the PRE-EXISTING columns, so adding columns can't mask a data change.
  execute $h$
    create function pg_temp.fp_g(p_max integer) returns text language sql as $f$
      select md5(string_agg(row(id, name, description, description_es, prize_value, image_url, rules_text,
        min_age, end_date, max_entries, status, winner_id, winner_drawn_at, winner_drawn_by, created_by,
        created_at, updated_at, ended_at, archived_at, end_type)::text, '|' order by id))
      from public.giveaways where id <= p_max
    $f$;
  $h$;
  execute $h$
    create function pg_temp.fp_e(p_max integer) returns text language sql as $f$
      select md5(string_agg(row(id, giveaway_id, user_id, name_as_on_id, birthday, email, phone,
        agreed_to_rules, agreed_to_privacy, confirmed_age, opted_in_promotions, created_at)::text, '|' order by id))
      from public.giveaway_entries where giveaway_id <= p_max
    $f$;
  $h$;
  execute $h$
    create function pg_temp.fp_h(p_max integer) returns text language sql as $f$
      select md5(string_agg(h::text, '|' order by id)) from public.giveaway_winner_history h where giveaway_id <= p_max
    $f$;
  $h$;
  execute $h$
    create function pg_temp.fp_c(p_max integer) returns text language sql as $f$
      select string_agg(giveaway_id || ':' || entry_count, ',' order by giveaway_id)
      from public.get_giveaway_entry_counts(null) where giveaway_id <= p_max
    $f$;
  $h$;

  -- ── actors & legacy fixtures ────────────────────────────────────────────────────────────
  select max(id) into v_max_old from giveaways;
  select id, id_auto into v_sa, v_sa_id from profiles where role = 'super_admin' order by id_auto limit 1;
  select id, id_auto into v_td, v_td_id from profiles where role = 'tournament_director' order by id_auto limit 1;
  select g.id into v_leg from giveaways g where g.status = 'active' order by g.id limit 1;
  -- A/B/C have NO giveaway history at all, so deleting one (AD1) can't touch legacy fingerprints.
  create temp table fresh_users on commit drop as
    select p.id, p.id_auto from profiles p
     where p.role = 'basic_user' and p.status = 'active'
       and not exists (select 1 from giveaway_entries e where e.user_id = p.id_auto)
       and not exists (select 1 from giveaway_winner_history h where h.user_id = p.id_auto or h.drawn_by = p.id_auto)
       and not exists (select 1 from giveaways g where g.created_by = p.id_auto or g.winner_id = p.id_auto)
     order by p.id_auto desc limit 3;
  select id, id_auto into v_a, v_a_id from fresh_users order by id_auto desc limit 1;
  select id, id_auto into v_b, v_b_id from fresh_users order by id_auto desc offset 1 limit 1;
  select id, id_auto into v_c, v_c_id from fresh_users order by id_auto desc offset 2 limit 1;
  select id into v_leg_done from giveaways where status in ('awarded', 'archived') order by id limit 1;

  fp_g1 := pg_temp.fp_g(v_max_old); fp_e1 := pg_temp.fp_e(v_max_old);
  fp_h1 := pg_temp.fp_h(v_max_old); fp_c1 := pg_temp.fp_c(v_max_old);

  r := r || jsonb_build_object('actors', jsonb_build_object('sa', v_sa_id, 'td', v_td_id, 'a', v_a_id,
         'b', v_b_id, 'c', v_c_id, 'legacy_active', v_leg, 'legacy_done', v_leg_done, 'max_old_id', v_max_old,
         'counts_before', fp_c1));

  -- ── APPLY ───────────────────────────────────────────────────────────────────────────────
  execute __MIGRATION__;

  -- ── grandfathering: legacy data unchanged ───────────────────────────────────────────────
  fp_g2 := pg_temp.fp_g(v_max_old); fp_e2 := pg_temp.fp_e(v_max_old);
  fp_h2 := pg_temp.fp_h(v_max_old); fp_c2 := pg_temp.fp_c(v_max_old);
  r := r || pg_temp.chk('F1', 'giveaway rows unchanged (pre-existing columns)', fp_g2, fp_g1 = fp_g2);
  r := r || pg_temp.chk('F2', 'entry rows unchanged (pre-existing columns)', fp_e2, fp_e1 = fp_e2);
  r := r || pg_temp.chk('F3', 'winner history unchanged', fp_h2, fp_h1 = fp_h2);
  r := r || pg_temp.chk('F4', 'public counts identical (SUM(quantity) = COUNT for legacy)', fp_c2, fp_c1 = fp_c2);
  got := (select count(*) filter (where entry_mode <> 'legacy_single')::text || '/' || count(*) from giveaways);
  r := r || pg_temp.chk('F5', 'every existing giveaway backfilled legacy_single', got, got like '0/%');
  got := (select count(*) filter (where quantity <> 1)::text || '/' || count(*) from giveaway_entries);
  r := r || pg_temp.chk('F6', 'every existing entry backfilled quantity 1', got, got like '0/%');

  -- ── legacy behavior unchanged ───────────────────────────────────────────────────────────
  got := pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone, agreed_to_rules, agreed_to_privacy, confirmed_age, opted_in_promotions) values (%s, %s, 'Legacy Test', '1990-01-01', 'l@example.invalid', '5550101', true, true, true, false) returning quantity::text$q$, v_leg, v_a_id));
  r := r || pg_temp.chk('L1', 'legacy entry via existing client insert still works (quantity 1)', got, got = '1');
  got := pg_temp.pv(v_a, format($q$with first as (insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone) values (%s, %s, 'Dup Test', '1990-01-01', 'd@example.invalid', '5550102') returning 1) select count(*)::text from first$q$, v_leg, v_a_id), true)
      || '|' || pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone) values (%s, %s, 'Dup Test', '1990-01-01', 'd@example.invalid', '5550102') returning id::text$q$, v_leg, v_a_id));
  r := r || pg_temp.chk('L1b', 'duplicate entry into an ACTIVE legacy giveaway still hits UNIQUE (23505 → "already entered")', got, got like '1|err:duplicate key%');
  delete from giveaway_entries where giveaway_id = v_leg and user_id = v_a_id;   -- keep fixtures clean
  got := pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone, quantity) values (%s, %s, 'Legacy Test', '1990-01-01', 'l@example.invalid', '5550101', 5) returning id::text$q$, v_leg, v_a_id));
  r := r || pg_temp.chk('L2', 'legacy insert with quantity 5 refused', got, got like 'err:%');
  got := pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone) values (%s, %s, 'Legacy Test', '1990-01-01', 'l@example.invalid', '5550101') returning id::text$q$, v_leg_done, v_a_id));
  r := r || pg_temp.chk('L3', 'legacy insert into a non-active giveaway refused', got, got like 'err:%row-level security%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'ended', ended_at = now() where id = %s returning 1) select count(*)::text from u$q$, v_leg));
  r := r || pg_temp.chk('L4', 'legacy End Early (admin client update) still works', got, got = '1');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set winner_id = %s, winner_drawn_at = now(), status = 'awarded' where id = %s returning 1) select count(*)::text from u$q$, v_a_id, v_leg));
  r := r || pg_temp.chk('L5', 'legacy client draw write (winner/awarded) still works', got, got = '1');
  got := pg_temp.pv(null, 'select count(*)::text from giveaway_entries');
  r := r || pg_temp.chk('P1', 'privacy: anon still cannot read entries', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_b, format('select count(*)::text from giveaway_entries where user_id <> %s', v_b_id));
  r := r || pg_temp.chk('P2', 'privacy: user still cannot read other entrants', got, got = '0');

  -- ── wallet giveaways created by the admin through the normal client path (as DRAFTS) ────
  w1 := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, per_user_max, entry_mode, created_by, end_type, status) values ('Wallet Test 1', 50, 10, 4, 'wallet', %s, 'entries', 'draft') returning id::text$q$, v_sa_id), true)::int;
  w2 := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, per_user_max, entry_mode, created_by, end_type, status) values ('Wallet Test 2', 20, 100, 50, 'wallet', %s, 'entries', 'draft') returning id::text$q$, v_sa_id), true)::int;
  w3 := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, per_user_max, entry_mode, created_by, end_type) values ('Wallet Test 3', 10, 50, 10, 'wallet', %s, 'entries') returning id::text$q$, v_sa_id), true)::int;
  r := r || pg_temp.chk('W0', 'admin creates wallet giveaways as drafts via client insert (w3 via the draft DEFAULT)', w1 || ',' || w2 || ',' || w3,
         w1 > v_max_old and w3 > w2 and (select count(*) from giveaways where id in (w1, w2, w3) and status = 'draft') = 3);
  got := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, per_user_max, entry_mode, created_by) values ('No cap', 5, 5, 'wallet', %s) returning id::text$q$, v_sa_id));
  r := r || pg_temp.chk('W1', 'wallet giveaway without capacity refused', got, got like 'err:%giveaways_wallet_capacity%');
  got := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, per_user_max, entry_mode, created_by, status) values ('Pre-cancelled', 5, 5, 5, 'wallet', %s, 'cancelled') returning id::text$q$, v_sa_id));
  r := r || pg_temp.chk('W2', 'giveaway cannot be created already cancelled', got, got like 'err:giveaways cannot be created cancelled%');
  got := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, entry_mode, created_by, status) values ('No per-user max', 5, 50, 'wallet', %s, 'draft') returning id::text$q$, v_sa_id));
  r := r || pg_temp.chk('W3', 'wallet giveaway without a per-user max refused', got, got like 'err:%giveaways_wallet_per_user_max_required%');
  got := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, per_user_max, entry_mode, created_by, status) values ('Live wallet', 5, 50, 5, 'wallet', %s, 'active') returning id::text$q$, v_sa_id));
  r := r || pg_temp.chk('W4', 'wallet giveaway cannot be created already live (skipping the launch hold)', got, got like 'err:wallet giveaways must be created as a draft%');

  -- ── DRAFT lifecycle ───────────────────────────────────────────────────────────────────────
  declare dl integer; dl2 integer;
  begin
    dl  := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, created_by, status) values ('Legacy Draft', 25, 30, %s, 'draft') returning id::text$q$, v_sa_id), true)::int;
    dl2 := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, created_by, status) values ('Legacy Draft 2', 25, 30, %s, 'draft') returning id::text$q$, v_sa_id), true)::int;
    got := pg_temp.pv(null, format('select count(*)::text from giveaways where id in (%s, %s, %s)', dl, w1, w2));
    r := r || pg_temp.chk('DR1', 'drafts are invisible to the public list (anon)', got, got = '0');
    got := pg_temp.pv(v_a, format('select count(*)::text from giveaways where id in (%s, %s, %s)', dl, w1, w2));
    r := r || pg_temp.chk('DR2', 'drafts are invisible to signed-in users', got, got = '0');
    got := pg_temp.pv(null, format('select count(*)::text from get_giveaway_entry_counts(array[%s, %s])', dl, w1));
    r := r || pg_temp.chk('DR3', 'drafts are excluded from public aggregate counts', got, got = '0');
    got := pg_temp.pv(v_sa, format('select count(*)::text from giveaways where id in (%s, %s, %s)', dl, w1, w2));
    r := r || pg_temp.chk('DR4', 'drafts are visible to the admin (management list)', got, got = '3');
    got := pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone) values (%s, %s, 'x', '1990-01-01', 'x@x.x', '1') returning id::text$q$, dl, v_a_id));
    r := r || pg_temp.chk('DR5', 'legacy draft refuses entries', got, got like 'err:%row-level security%');
    got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 1, gen_random_uuid(), %L::jsonb)->>'status'$q$, w1, ent));
    r := r || pg_temp.chk('DR6', 'wallet draft refuses entries', got, got = 'closed');
    got := pg_temp.pv(v_sa, format($q$select draw_wallet_giveaway(%s)->>'status'$q$, w1));
    r := r || pg_temp.chk('DR7', 'wallet draft cannot be drawn', got, got = 'not_ended');
    got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set winner_id = %s, status = 'awarded' where id = %s returning 1) select count(*)::text from u$q$, v_a_id, dl));
    r := r || pg_temp.chk('DR8', 'legacy draft cannot be drawn/awarded through the client path', got, got like 'err:drafts are published only%');
    got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set name = 'Edited Draft', max_entries = 40, prize_value = 99 where id = %s returning 1) select count(*)::text from u$q$, dl), true);
    got := got || '|' || pg_temp.pv(v_sa, format($q$with u as (update giveaways set per_user_max = 3, max_entries = 20 where id = %s returning 1) select count(*)::text from u$q$, w2));
    r := r || pg_temp.chk('DR9', 'drafts are freely editable (legacy + wallet)', got, got = '1|1');
    got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'active' where id = %s returning 1) select count(*)::text from u$q$, dl));
    r := r || pg_temp.chk('DR10', 'direct draft → active refused (publish path only)', got, got like 'err:drafts are published only%');
    got := pg_temp.pv(v_td, format($q$select publish_giveaway(%s)::text$q$, dl));
    r := r || pg_temp.chk('DR11', 'tournament director cannot publish', got, got like 'err:not authorized%');
    got := pg_temp.pv(null, format($q$select publish_giveaway(%s)::text$q$, dl));
    r := r || pg_temp.chk('DR12', 'anon cannot publish', got, got like 'err:permission denied%');
    got := pg_temp.pv(v_sa, format($q$select publish_giveaway(%s)::text$q$, dl), true);
    r := r || pg_temp.chk('DR13', 'legacy publish: draft → active, reports published', got,
           got = '{"ok": true, "status": "published", "entry_mode": "legacy_single"}'
           and (select status = 'active' and published_at is not null from giveaways where id = dl));
    got := pg_temp.pv(v_sa, format($q$select (publish_giveaway(%s)->>'status') || ',' || (publish_giveaway(%s)->>'status')$q$, dl, dl), true);
    r := r || pg_temp.chk('DR14', 'repeat publish is idempotent (never "published" again → no second notification)', got, got = 'already_published,already_published');
    got := pg_temp.pv(null, format('select count(*)::text from giveaways where id = %s', dl));
    r := r || pg_temp.chk('DR15', 'published legacy giveaway is now public', got, got = '1');
    got := pg_temp.pv(v_sa, format($q$select publish_giveaway(%s)::text$q$, w1), true);
    r := r || pg_temp.chk('DR16', 'wallet publish blocked by the native launch hold; stays draft', got,
           got = '{"ok": false, "status": "wallet_publish_on_hold"}' and (select status from giveaways where id = w1) = 'draft');
    perform pg_temp.pv(v_sa, format($q$with u as (update giveaways set end_date = now() - interval '1 day', end_type = 'both' where id = %s returning 1) select count(*)::text from u$q$, dl2), true);
    got := pg_temp.pv(v_sa, format($q$select publish_giveaway(%s)->>'status'$q$, dl2), true);
    r := r || pg_temp.chk('DR17', 'publish validates configuration (end date in the past)', got, got = 'end_date_in_past');
    got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'archived', archived_at = now() where id = %s returning 1) select count(*)::text from u$q$, dl2), true);
    got := got || '|' || pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'active', archived_at = null where id = %s returning 1) select count(*)::text from u$q$, dl2));
    got := got || '|' || pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'draft', archived_at = null where id = %s returning 1) select count(*)::text from u$q$, dl2));
    r := r || pg_temp.chk('DR18', 'a draft can be archived; Restore returns it to draft, never straight to active', got,
           got like '1|err:%never been published%|1');
    got := pg_temp.pv(v_sa, format($q$insert into giveaways (name, prize_value, max_entries, created_by, status) values ('Old-app legacy', 5, 10, %s, 'active') returning (published_at is not null)::text$q$, v_sa_id));
    r := r || pg_temp.chk('DR19', 'older app versions creating a legacy giveaway directly as active still work (stamped published)', got, got = 'true');
  end;

  -- The remaining wallet tests need LIVE wallet giveaways. publish_giveaway refuses them while the
  -- native launch hold is on (DR16), so simulate the hold being lifted — exactly the update that
  -- publish_giveaway performs after its checks. Test-only; the real publish path stays blocked.
  perform set_config('compete.giveaway_op', 'publish', true);
  update giveaways set status = 'active', published_at = now() where id in (w1, w2, w3);
  perform set_config('compete.giveaway_op', '', true);

  -- ── admin grant / revoke ────────────────────────────────────────────────────────────────
  got := pg_temp.pv(v_sa, format($q$select admin_grant_giveaway_entries(%s, 10, 'test grant')::text$q$, v_a_id), true);
  r := r || pg_temp.chk('G1', 'admin grant 10 → balance 10', got, got = '{"ok": true, "status": "granted", "balance": 10}');
  got := (select delta || '/' || balance_after || '/' || reason || '/' || created_by || '/' || note from giveaway_credit_ledger where profile_id = v_a_id order by id desc limit 1);
  r := r || pg_temp.chk('G2', 'ledger row: +10, balance_after 10, admin_grant, created_by admin, note', got, got = '10/10/admin_grant/' || v_sa_id || '/test grant');
  got := pg_temp.pv(v_sa, format($q$select (admin_grant_giveaway_entries(%s, 5, 'promo', 'promo-1')->>'status') || '|' || (admin_grant_giveaway_entries(%s, 5, 'promo', 'promo-1')->>'balance')$q$, v_b_id, v_b_id), true);
  r := r || pg_temp.chk('G3', 'same idempotency key twice → applied once (balance 5)', got, got = 'granted|5');
  got := pg_temp.pv(v_td, format($q$select admin_grant_giveaway_entries(%s, 10, 'x')::text$q$, v_td_id));
  r := r || pg_temp.chk('G4', 'tournament director cannot grant', got, got like 'err:not authorized%');
  got := pg_temp.pv(v_a, format($q$select admin_grant_giveaway_entries(%s, 100, 'x')::text$q$, v_a_id));
  r := r || pg_temp.chk('G5', 'user cannot grant themselves entries', got, got like 'err:not authorized%');
  got := pg_temp.pv(null, format($q$select admin_grant_giveaway_entries(%s, 100, 'x')::text$q$, v_a_id));
  r := r || pg_temp.chk('G6', 'anon cannot call grant', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_sa, format($q$select (admin_grant_giveaway_entries(%s, 0, 'x')->>'status') || ',' || (admin_grant_giveaway_entries(%s, -5, 'x')->>'status')$q$, v_a_id, v_a_id));
  r := r || pg_temp.chk('G7', 'grant amount must be a positive integer', got, got = 'invalid_amount,invalid_amount');
  got := pg_temp.pv(v_sa, format($q$select admin_revoke_giveaway_entries(%s, 1, '')->>'status'$q$, v_a_id));
  r := r || pg_temp.chk('G8', 'revoke requires a note', got, got = 'note_required');
  got := pg_temp.pv(v_sa, format($q$select admin_revoke_giveaway_entries(%s, 999, 'too much')::text$q$, v_a_id), true);
  r := r || pg_temp.chk('G9', 'revoke beyond balance refused, balance untouched', got, got = '{"ok": false, "status": "insufficient_balance", "balance": 10}');
  got := pg_temp.pv(v_sa, format($q$select admin_revoke_giveaway_entries(%s, 2, 'correction')->>'balance'$q$, v_a_id), true);
  r := r || pg_temp.chk('G10', 'revoke 2 → balance 8', got, got = '8');
  perform pg_temp.pv(v_sa, format($q$select admin_grant_giveaway_entries(%s, 2, 'restore')::text$q$, v_a_id), true);
  perform pg_temp.pv(v_sa, format($q$select admin_grant_giveaway_entries(%s, 5, 'c grant')::text$q$, v_c_id), true);
  perform pg_temp.pv(v_sa, format($q$select admin_grant_giveaway_entries(%s, 10, 'b top-up')::text$q$, v_b_id), true);

  -- ── direct access ───────────────────────────────────────────────────────────────────────
  got := pg_temp.pv(v_a, format($q$with u as (update giveaway_wallets set balance = 9999 where profile_id = %s returning 1) select count(*)::text from u$q$, v_a_id));
  r := r || pg_temp.chk('D1', 'user cannot update their wallet balance', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_a, format($q$insert into giveaway_credit_ledger (profile_id, delta, balance_after, reason) values (%s, 500, 500, 'admin_grant') returning id::text$q$, v_a_id));
  r := r || pg_temp.chk('D2', 'user cannot insert ledger rows', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaway_wallets set balance = 9999 where profile_id = %s returning 1) select count(*)::text from u$q$, v_a_id));
  r := r || pg_temp.chk('D3', 'even an admin cannot write balances directly', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_a, 'select count(*)::text || ''/'' || coalesce(sum(balance), 0) from giveaway_wallets');
  r := r || pg_temp.chk('D4', 'user reads only their own wallet (1 row, 10)', got, got = '1/10');
  got := pg_temp.pv(v_a, format('select count(*)::text from giveaway_credit_ledger where profile_id <> %s', v_a_id));
  r := r || pg_temp.chk('D5', 'user cannot read other users'' ledger', got, got = '0');
  got := pg_temp.pv(null, 'select count(*)::text from giveaway_wallets');
  r := r || pg_temp.chk('D6', 'anon cannot read wallets', got, got like 'err:permission denied%');
  got := pg_temp.pv(null, 'select count(*)::text from giveaway_credit_ledger');
  r := r || pg_temp.chk('D7', 'anon cannot read ledger', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_a, 'select get_my_giveaway_balance()::text');
  r := r || pg_temp.chk('D8', 'get_my_giveaway_balance = 10', got, got = '10');
  got := pg_temp.pv(v_sa, 'select count(*)::text from giveaway_wallets');
  r := r || pg_temp.chk('D9', 'admin reads all wallets', got, got = (select count(*)::text from giveaway_wallets));

  -- ── entering wallet giveaways ───────────────────────────────────────────────────────────
  got := pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone) values (%s, %s, 'x', '1990-01-01', 'x@x.x', '1') returning id::text$q$, w1, v_a_id));
  r := r || pg_temp.chk('E0', 'legacy insert path into a WALLET giveaway refused (trigger + RLS)', got,
         got like 'err:wallet giveaway entries can only be created%' or got like 'err:%row-level security%');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 3, gen_random_uuid())->>'status'$q$, w1), true);
  r := r || pg_temp.chk('E1', 'first entry without entrant details refused', got, got = 'entrant_details_required');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 3, gen_random_uuid(), %L::jsonb || '{"birthday":"2015-01-01"}')->>'status'$q$, w1, ent), true);
  r := r || pg_temp.chk('E2', 'underage entrant refused', got, got = 'underage');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 3, 'aaaaaaaa-0000-0000-0000-000000000001', %L::jsonb)::text$q$, w1, ent), true);
  r := r || pg_temp.chk('E3', 'enter 3 → my 3, total 3, balance 7', got, got like '%"status": "entered"%' and got like '%"balance": 7%' and got like '%"my_entries": 3%' and got like '%"total_entries": 3%');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 3, 'aaaaaaaa-0000-0000-0000-000000000001', %L::jsonb)::text$q$, w1, ent), true);
  r := r || pg_temp.chk('E4', 'replaying the same request id charges nothing', got, got like '%"duplicate"%' and got like '%"balance": 7%' and got like '%"my_entries": 3%');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 2, gen_random_uuid())::text$q$, w1), true);
  r := r || pg_temp.chk('E5', 'per-user cap (3 + 2 > 4) refused, remaining 1', got, got like '%per_user_cap%' and got like '%"remaining": 1%');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 1, gen_random_uuid())->>'my_entries'$q$, w1), true);
  r := r || pg_temp.chk('E6', 'top-up of 1 (no details needed) → my 4', got, got = '4');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 20, gen_random_uuid(), %L::jsonb)::text$q$, w2, ent), true);
  r := r || pg_temp.chk('E7', 'insufficient balance refused (balance 6)', got, got = '{"ok": false, "status": "insufficient_balance", "balance": 6}');
  got := (select count(*)::text from giveaway_entries where giveaway_id = w2);
  r := r || pg_temp.chk('E8', 'failed spend left no entry row behind', got, got = '0');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 1, gen_random_uuid(), %L::jsonb)->>'status'$q$, v_leg, ent), true);
  r := r || pg_temp.chk('E9', 'wallet RPC refuses a legacy giveaway', got, got = 'not_wallet_giveaway');
  got := pg_temp.pv(v_a, format($q$select (enter_wallet_giveaway(%s, 0, gen_random_uuid())->>'status') || ',' || (enter_wallet_giveaway(%s, -3, gen_random_uuid())->>'status')$q$, w1, w1), true);
  r := r || pg_temp.chk('E10', 'quantity must be positive', got, got = 'invalid_quantity,invalid_quantity');
  got := pg_temp.pv(null, format($q$select enter_wallet_giveaway(%s, 1, gen_random_uuid())::text$q$, w1));
  r := r || pg_temp.chk('E11', 'anon cannot enter', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_b, format($q$select enter_wallet_giveaway(%s, 4, gen_random_uuid(), %L::jsonb)->>'total_entries'$q$, w1, ent), true);
  r := r || pg_temp.chk('E12', 'second user enters 4 → total 8', got, got = '8');
  got := pg_temp.pv(v_c, format($q$select enter_wallet_giveaway(%s, 3, gen_random_uuid(), %L::jsonb)::text$q$, w1, ent), true);
  r := r || pg_temp.chk('E13', 'capacity (8 + 3 > 10) refused, remaining 2', got, got like '%"capacity"%' and got like '%"remaining": 2%');
  got := pg_temp.pv(v_c, format($q$select enter_wallet_giveaway(%s, 2, gen_random_uuid(), %L::jsonb)::text$q$, w1, ent), true);
  r := r || pg_temp.chk('E14', 'filling exactly to capacity closes the giveaway', got, got like '%"closed": true%' and (select status from giveaways where id = w1) = 'ended');
  got := pg_temp.pv(v_c, format($q$select enter_wallet_giveaway(%s, 1, gen_random_uuid())->>'status'$q$, w1), true);
  r := r || pg_temp.chk('E15', 'ended giveaway refuses entries', got, got = 'closed');
  perform pg_temp.pv(v_sa, format($q$with u as (update giveaways set end_date = now() - interval '1 minute', end_type = 'both' where id = %s returning 1) select count(*)::text from u$q$, w2), true);
  got := pg_temp.pv(v_b, format($q$select enter_wallet_giveaway(%s, 1, gen_random_uuid(), %L::jsonb)->>'status'$q$, w2, ent), true);
  r := r || pg_temp.chk('E16', 'past end date refuses entries even while status is still active', got, got = 'closed');
  got := pg_temp.pv(null, format('select entry_count::text from get_giveaway_entry_counts(array[%s])', w1));
  r := r || pg_temp.chk('K1', 'public count = SUM(quantity) = 10 (3 entrant rows)', got || '/' || (select count(*) from giveaway_entries where giveaway_id = w1), got = '10');
  got := pg_temp.pv(v_a, format('select quantity::text from giveaway_entries where giveaway_id = %s', w1));
  r := r || pg_temp.chk('K2', 'user reads own quantity (You: 4)', got, got = '4');

  -- ── quantity / giveaway manipulation ────────────────────────────────────────────────────
  got := pg_temp.pv(v_a, format($q$with u as (update giveaway_entries set quantity = 999 where giveaway_id = %s and user_id = %s returning 1) select count(*)::text from u$q$, w1, v_a_id));
  r := r || pg_temp.chk('M1', 'user cannot change their quantity', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaway_entries set quantity = 999 where giveaway_id = %s returning 1) select count(*)::text from u$q$, w1));
  r := r || pg_temp.chk('M2', 'admin cannot change quantities via the API', got, got like 'err:permission denied%');
  begin
    update giveaway_entries set quantity = 999 where giveaway_id = w1 and user_id = v_a_id;
    got := 'updated';
  exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.chk('M3', 'even the table owner cannot change a wallet quantity outside the RPC (trigger)', got, got like 'err:wallet giveaway entries%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set entry_mode = 'legacy_single', per_user_max = null where id = %s returning 1) select count(*)::text from u$q$, w1));
  r := r || pg_temp.chk('M4', 'entry mode locked once entries exist', got, got like 'err:%entry mode cannot change%' or got like 'err:%per_user_max_wallet_only%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set max_entries = 5 where id = %s returning 1) select count(*)::text from u$q$, w1));
  r := r || pg_temp.chk('M5', 'capacity cannot drop below entries held', got, got like 'err:capacity cannot be lowered%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set per_user_max = 2 where id = %s returning 1) select count(*)::text from u$q$, w1));
  r := r || pg_temp.chk('M6', 'per-user max cannot drop below an entrant''s holding', got, got like 'err:per-user max cannot be lowered%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set winner_id = %s, status = 'awarded' where id = %s returning 1) select count(*)::text from u$q$, v_a_id, w1));
  r := r || pg_temp.chk('M7', 'admin cannot hand-pick a wallet winner (client legacy draw path blocked)', got, got like 'err:wallet giveaway winners%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'archived', archived_at = now() where id = %s returning 1) select count(*)::text from u$q$, w1));
  r := r || pg_temp.chk('M8', 'cannot archive an undrawn wallet giveaway with spent entries', got, got like 'err:draw or cancel%');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'cancelled' where id = %s returning 1) select count(*)::text from u$q$, w1));
  r := r || pg_temp.chk('M9', 'cannot cancel by direct update (would skip refunds)', got, got like 'err:giveaways can only be cancelled%');

  -- ── server-side weighted draw ───────────────────────────────────────────────────────────
  got := pg_temp.pv(v_td, format($q$select draw_wallet_giveaway(%s)::text$q$, w1));
  r := r || pg_temp.chk('R1', 'tournament director cannot draw', got, got like 'err:not authorized%');
  got := pg_temp.pv(v_sa, format($q$select draw_wallet_giveaway(%s)::text$q$, v_leg), true);
  r := r || pg_temp.chk('R2', 'wallet draw refuses legacy giveaways (legacy keeps its own flow)', got, got like '%not_wallet_giveaway%');
  got := pg_temp.pv(v_sa, format($q$select draw_wallet_giveaway(%s)::text$q$, w1), true);
  select winner_id into v_winner1 from giveaways where id = w1;
  r := r || pg_temp.chk('R3', 'draw: awarded, ticket 1..10 of 10, winner is an entrant', left(got, 160),
         got like '%"status": "drawn"%' and got like '%"total_tickets": 10%'
         and (select status from giveaways where id = w1) = 'awarded'
         and v_winner1 in (v_a_id, v_b_id, v_c_id)
         and (select winning_ticket between 1 and 10 from giveaway_draws where giveaway_id = w1 and draw_number = 1));
  got := (select count(*)::text || '/' || count(*) filter (where status = 'winner') from giveaway_winner_history where giveaway_id = w1)
      || '|' || (select count(*) from giveaway_draws where giveaway_id = w1 and pool_hash is not null);
  r := r || pg_temp.chk('R4', 'draw recorded in winner history + auditable giveaway_draws row', got, got = '1/1|1');
  got := pg_temp.pv(v_sa, format($q$select draw_wallet_giveaway(%s)->>'status'$q$, w1), true);
  r := r || pg_temp.chk('R5', 'a second plain draw is refused', got, got = 'not_ended');
  got := pg_temp.pv(v_sa, format($q$select draw_wallet_giveaway(%s, 'failed verification')::text$q$, w1), true);
  select winner_id into v_winner2 from giveaways where id = w1;
  r := r || pg_temp.chk('R6', 'redraw: new winner, previous disqualified + draw invalidated', left(got, 120),
         got like '%"status": "redrawn"%' and v_winner2 is distinct from v_winner1
         and (select status from giveaway_winner_history where giveaway_id = w1 and user_id = v_winner1) = 'disqualified'
         and (select invalidated from giveaway_draws where giveaway_id = w1 and draw_number = 1)
         and (select total_tickets from giveaway_draws where giveaway_id = w1 and draw_number = 2)
             = 10 - (select quantity from giveaway_entries where giveaway_id = w1 and user_id = v_winner1));
  -- Weighting: the draw's exact selection expression over pool {4, 4, 2}, 20,000 trials.
  with pool as (select * from (values (1, 4), (2, 4), (3, 2)) v(id, q)),
       cum as (select id, sum(q) over (order by id) upto from pool),
       t as (select ((('x' || encode(extensions.gen_random_bytes(8), 'hex'))::bit(64)::bigint & 9223372036854775807) % 10) + 1 as ticket
               from generate_series(1, 20000)),
       pick as (select (select id from cum where upto >= t.ticket order by id limit 1) id from t)
  select string_agg(id || ':' || round(c / 20000.0, 3), ',' order by id) into got from (select id, count(*) c from pick group by id) s;
  r := r || pg_temp.chk('R7', 'selection is weighted by quantity (expect ≈ 0.4 / 0.4 / 0.2)', got,
         got ~ '^1:0\.(3[89]|4[01])[0-9]*,2:0\.(3[89]|4[01])[0-9]*,3:0\.(19|2[01])[0-9]*$');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'archived', archived_at = now() where id = %s returning 1) select count(*)::text from u$q$, w1), true);
  r := r || pg_temp.chk('R8', 'awarded wallet giveaway can be archived', got, got = '1');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'awarded', archived_at = null where id = %s returning 1) select count(*)::text from u$q$, w1), true);
  r := r || pg_temp.chk('R9', 'existing Restore (archived → awarded, same winner) still works', got, got = '1');

  -- ── cancel + refund ─────────────────────────────────────────────────────────────────────
  perform pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 2, gen_random_uuid(), %L::jsonb)::text$q$, w3, ent), true);
  perform pg_temp.pv(v_b, format($q$select enter_wallet_giveaway(%s, 3, gen_random_uuid(), %L::jsonb)::text$q$, w3, ent), true);
  got := (select string_agg(profile_id || '=' || balance, ',' order by profile_id) from giveaway_wallets where profile_id in (v_a_id, v_b_id));
  got := pg_temp.pv(v_sa, format($q$select cancel_wallet_giveaway(%s, '')->>'status'$q$, w3), true);
  r := r || pg_temp.chk('X1', 'cancel requires a reason', got, got = 'reason_required');
  n := (select coalesce(sum(balance), 0) from giveaway_wallets where profile_id in (v_a_id, v_b_id));
  got := pg_temp.pv(v_sa, format($q$select cancel_wallet_giveaway(%s, 'prize unavailable')::text$q$, w3), true);
  r := r || pg_temp.chk('X2', 'cancel refunds 2 entrants / 5 credits', got, got = '{"ok": true, "status": "cancelled", "credits_refunded": 5, "entrants_refunded": 2}');
  r := r || pg_temp.chk('X3', 'balances restored by exactly the spent amount',
         (select coalesce(sum(balance), 0) from giveaway_wallets where profile_id in (v_a_id, v_b_id))::text,
         (select coalesce(sum(balance), 0) from giveaway_wallets where profile_id in (v_a_id, v_b_id)) = n + 5);
  got := pg_temp.pv(v_sa, format($q$select cancel_wallet_giveaway(%s, 'again')->>'status'$q$, w3), true);
  r := r || pg_temp.chk('X4', 'second cancel is a no-op (no double refund)', got || '/' || (select count(*) from giveaway_credit_ledger where giveaway_id = w3 and reason = 'giveaway_refund'),
         got = 'already_cancelled' and (select count(*) from giveaway_credit_ledger where giveaway_id = w3 and reason = 'giveaway_refund') = 2);
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set status = 'active' where id = %s returning 1) select count(*)::text from u$q$, w3));
  r := r || pg_temp.chk('X5', 'cancelled giveaway cannot be reopened', got, got like 'err:a cancelled giveaway cannot be reopened%');
  got := pg_temp.pv(v_a, format($q$select enter_wallet_giveaway(%s, 1, gen_random_uuid())->>'status'$q$, w3), true);
  r := r || pg_temp.chk('X6', 'cancelled giveaway refuses entries', got, got = 'closed');
  got := pg_temp.pv(v_sa, format($q$select (cancel_wallet_giveaway(%s, 'x')->>'status') || ',' || (cancel_wallet_giveaway(%s, 'x')->>'status')$q$, v_leg_done, w1), true);
  r := r || pg_temp.chk('X7', 'cannot cancel a legacy or an awarded giveaway', got, got = 'not_wallet_giveaway,not_cancellable');
  begin
    update giveaways set cancelled_by = null where id = w3;              -- what FK SET NULL does
    got := 'ok';
  exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.chk('X8', 'cancelled_by can still be nulled (admin account deletion)', got, got = 'ok');
  got := pg_temp.pv(null, format('select count(*)::text from giveaways where id = %s', w3));
  r := r || pg_temp.chk('X9', 'cancelled giveaways are hidden from the public list', got, got = '0');

  -- ── ledger integrity ────────────────────────────────────────────────────────────────────
  got := (select count(*)::text from giveaway_wallets w
           where w.balance <> (select coalesce(sum(delta), 0) from giveaway_credit_ledger l where l.profile_id = w.profile_id));
  r := r || pg_temp.chk('Z1', 'every wallet balance = SUM(ledger deltas)', got, got = '0');
  got := (select count(*)::text from giveaway_credit_ledger l
           where l.balance_after <> (select sum(delta) from giveaway_credit_ledger x where x.profile_id = l.profile_id and x.id <= l.id));
  r := r || pg_temp.chk('Z2', 'every ledger balance_after is the running total', got, got = '0');
  got := (select count(*)::text from giveaway_credit_ledger where reason = 'giveaway_spend' and giveaway_id is null);
  r := r || pg_temp.chk('Z3', 'every spend is tied to its giveaway', got, got = '0');

  -- ── account deletion still works ────────────────────────────────────────────────────────
  got := pg_temp.pv((select id from profiles where id_auto = v_winner2), 'select public.delete_user_account()::text', true);
  r := r || pg_temp.chk('AD1', 'current wallet-giveaway WINNER can still delete their account', got, got not like 'err:%');
  got := (select coalesce(winner_id::text, 'null') from giveaways where id = w1)
      || '|' || (select count(*) from giveaway_wallets where profile_id = v_winner2)
      || '|' || (select count(*) from giveaway_credit_ledger where profile_id = v_winner2);
  r := r || pg_temp.chk('AD2', 'winner cleared; their wallet + ledger removed with the account', got, got = 'null|0|0');

  -- ── legacy data still untouched after all of the above (probes on legacy rows rolled back) ─
  r := r || pg_temp.chk('F7', 'legacy giveaways/entries/history/counts still identical at the end',
         pg_temp.fp_g(v_max_old) || pg_temp.fp_e(v_max_old),
         pg_temp.fp_g(v_max_old) = fp_g1 and pg_temp.fp_e(v_max_old) = fp_e1
         and pg_temp.fp_h(v_max_old) = fp_h1 and pg_temp.fp_c(v_max_old) = fp_c1);

  select count(*) filter (where (x->>'pass')::boolean), count(*) filter (where not (x->>'pass')::boolean)
    into v_pass, v_fail from jsonb_array_elements(r) x where x ? 'pass';
  raise exception 'VERIFY_RESULT:%', jsonb_build_object('pass', v_pass, 'fail', v_fail, 'results', r)::text;
end
$verify$;
