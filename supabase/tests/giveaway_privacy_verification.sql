-- supabase/tests/giveaway_privacy_verification.sql
--
-- ROLLBACK-ONLY production verification for the giveaway privacy hardening (G1 + G2).
-- NOT a migration. One single DO statement, so it is atomic no matter how it is submitted:
--   1. proves the hole exists on the REAL prod policies,
--   2. applies G1 + G2 INSIDE the statement (EXECUTE of the migration files),
--   3. replays every access case as REAL accounts (auth.uid() via request.jwt.claims,
--      current_user via SET LOCAL ROLE anon/authenticated) — every probe is itself rolled back,
--   4. applies the G2 rollback file and proves it restores the pre-G2 behavior,
--   5. ALWAYS ends with RAISE EXCEPTION carrying the JSON results → everything rolls back.
-- Placeholders __G1__, __G2__, __G2_RB__ are substituted (as dollar-quoted literals) by the runner.
-- Side effects: none persist. Rolled-back inserts can only advance the entries id sequence.
-- No notifications / pg_net / cron are invoked (pure SQL; no triggers on these tables).

do $verify$
declare
  r        jsonb := '[]'::jsonb;
  v_pass   int := 0;
  v_fail   int := 0;
  -- actors
  v_sa uuid;  v_sa_id bigint;      -- super_admin (giveaway admin)
  v_a  uuid;  v_a_id  bigint;      -- basic user WITH entries
  v_n  uuid;  v_n_id  bigint;      -- basic user with NO entries
  v_bo uuid;  v_bo_id bigint;      -- bar_owner   (authenticated, not a giveaway admin)
  v_td uuid;  v_td_id bigint;      -- tournament_director (authenticated, not a giveaway admin)
  -- fixtures
  v_open   integer;                -- active giveaway user A has NOT entered
  v_mine   integer;                -- a giveaway user A HAS entered
  v_award  integer;                -- an awarded giveaway (has winner history)
  -- truth (computed as postgres before any role switch)
  t_total      bigint;
  t_a_own      bigint;
  t_public_str text;
  t_hist       bigint;
  t_archived   bigint;
  t_public_g   bigint;
  got text;
begin
  -- ── probe helper: run one scalar query as a user (null = anon); always rolled back ─────────
  execute $h$
    create function pg_temp.pv(p_uid uuid, p_sql text) returns text
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

  -- ── actors ──────────────────────────────────────────────────────────────────────────────
  select id, id_auto into v_sa, v_sa_id from profiles where role = 'super_admin' order by id_auto limit 1;
  select p.id, p.id_auto into v_a, v_a_id from profiles p
   where p.role = 'basic_user'
     and exists (select 1 from giveaway_entries e where e.user_id = p.id_auto)
     and exists (select 1 from giveaways g where g.status = 'active'
                   and not exists (select 1 from giveaway_entries e2 where e2.giveaway_id = g.id and e2.user_id = p.id_auto))
   order by p.id_auto limit 1;
  select id, id_auto into v_n, v_n_id from profiles p where role = 'basic_user'
     and not exists (select 1 from giveaway_entries e where e.user_id = p.id_auto) order by id_auto limit 1;
  select id, id_auto into v_bo, v_bo_id from profiles where role = 'bar_owner' order by id_auto limit 1;
  select id, id_auto into v_td, v_td_id from profiles where role = 'tournament_director' order by id_auto limit 1;

  select g.id into v_open from giveaways g where g.status = 'active'
     and not exists (select 1 from giveaway_entries e where e.giveaway_id = g.id and e.user_id = v_a_id)
   order by g.id limit 1;
  select e.giveaway_id into v_mine from giveaway_entries e where e.user_id = v_a_id order by e.id limit 1;
  select g.id into v_award from giveaways g where g.status = 'awarded' and g.winner_id is not null order by g.id limit 1;

  -- ── truth ───────────────────────────────────────────────────────────────────────────────
  select count(*) into t_total from giveaway_entries;
  select count(*) into t_a_own from giveaway_entries where user_id = v_a_id;
  select count(*) into t_hist  from giveaway_winner_history where giveaway_id = v_award;
  select count(*) into t_archived from giveaways where status = 'archived';
  select count(*) into t_public_g from giveaways where status in ('active','ended','awarded');
  select string_agg(x.id || ':' || x.c, ',' order by x.id) into t_public_str from (
    select g.id, count(e.id) c from giveaways g left join giveaway_entries e on e.giveaway_id = g.id
    where g.status in ('active','ended','awarded') group by g.id) x;

  r := r || jsonb_build_object('actors', jsonb_build_object(
         'super_admin', v_sa_id, 'user_a', v_a_id, 'user_no_entries', v_n_id,
         'bar_owner', v_bo_id, 'td', v_td_id, 'open_giveaway', v_open,
         'entered_giveaway', v_mine, 'awarded_giveaway', v_award,
         'total_entries', t_total, 'a_own', t_a_own, 'public_counts', t_public_str));

  -- ── BEFORE: prove the hole on current prod policies ─────────────────────────────────────
  got := pg_temp.pv(null, 'select count(email)::text from giveaway_entries');
  r := r || pg_temp.chk('B1', 'BEFORE: anon can read entrant emails (hole exists)', got, got = t_total::text);
  got := pg_temp.pv(v_n, 'select count(*)::text from giveaway_entries');
  r := r || pg_temp.chk('B2', 'BEFORE: user with no entries reads all rows (hole exists)', got, got = t_total::text);

  -- ── APPLY G1 + G2 inside this statement ─────────────────────────────────────────────────
  execute __G1__;
  execute __G2__;

  -- ── anon ────────────────────────────────────────────────────────────────────────────────
  got := pg_temp.pv(null, 'select count(*)::text from giveaway_entries');
  r := r || pg_temp.chk('A1', 'anon cannot read entrant rows', got, got like 'err:permission denied%');
  got := pg_temp.pv(null, 'select email from giveaway_entries limit 1');
  r := r || pg_temp.chk('A2', 'anon cannot read entrant PII columns', got, got like 'err:permission denied%');
  got := pg_temp.pv(null, $q$select string_agg(giveaway_id || ':' || entry_count, ',' order by giveaway_id) from get_giveaway_entry_counts()$q$);
  r := r || pg_temp.chk('A3', 'anon public counts == true counts (active/ended/awarded)', got, got = t_public_str);
  got := pg_temp.pv(null, $q$select count(*)::text from get_giveaway_entry_counts() c join giveaways g on g.id = c.giveaway_id where g.status = 'archived'$q$);
  r := r || pg_temp.chk('A4', 'anon counts exclude archived giveaways', got, got = '0');
  got := pg_temp.pv(null, $q$select count(*)::text from giveaways$q$);
  r := r || pg_temp.chk('A5', 'anon still reads public giveaways (page list)', got, got = t_public_g::text);
  got := pg_temp.pv(null, 'select count(*)::text from giveaway_winner_history');
  r := r || pg_temp.chk('A6', 'anon cannot read winner history', got, got like 'err:permission denied%');
  got := pg_temp.pv(null, $q$insert into giveaways (name, created_by) values ('x', 1) returning id::text$q$);
  r := r || pg_temp.chk('A7', 'anon cannot insert giveaways', got, got like 'err:%');
  got := pg_temp.pv(null, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone) values (%s, %s, 'x', '1990-01-01', 'x@x.x', '1') returning id::text$q$, v_open, v_a_id));
  r := r || pg_temp.chk('A8', 'anon cannot insert entries', got, got like 'err:%');
  got := pg_temp.pv(null, 'select _giveaway_is_admin()::text');
  r := r || pg_temp.chk('A9', 'anon cannot call admin helper directly', got, got like 'err:permission denied%');

  -- ── ordinary user A (has entries) ───────────────────────────────────────────────────────
  got := pg_temp.pv(v_a, 'select count(*)::text from giveaway_entries');
  r := r || pg_temp.chk('U1', 'user sees exactly their own rows', got, got = t_a_own::text);
  got := pg_temp.pv(v_a, format('select count(*)::text from giveaway_entries where user_id <> %s', v_a_id));
  r := r || pg_temp.chk('U2', 'user cannot read other entrants', got, got = '0');
  got := pg_temp.pv(v_a, format('select (count(name_as_on_id) + count(email) + count(phone) + count(birthday))::text from (select * from giveaway_entries where user_id = %s order by created_at desc limit 1) s', v_a_id));
  r := r || pg_temp.chk('U3', 'user reads own saved info (getSavedEntryInfo)', got, got = '4');
  got := pg_temp.pv(v_a, format('select count(*)::text from giveaway_entries where giveaway_id = %s and user_id = %s', v_mine, v_a_id));
  r := r || pg_temp.chk('U4', 'user hasUserEntered / getUserEntries works', got, got = '1');
  got := pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone, agreed_to_rules, agreed_to_privacy, confirmed_age, opted_in_promotions) values (%s, %s, 'Test', '1990-01-01', 't@t.t', '5550000', true, true, true, false) returning id::text$q$, v_open, v_a_id));
  r := r || pg_temp.chk('U5', 'user can enter a giveaway (insert + returning id, as createEntry .select().single())', got, got ~ '^[0-9]+$');
  got := pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone) values (%s, %s, 'Test', '1990-01-01', 't@t.t', '5550000') returning id::text$q$, v_mine, v_a_id));
  r := r || pg_temp.chk('U6', 'duplicate entry still rejected by UNIQUE (23505 path)', got, got like 'err:duplicate key%');
  got := pg_temp.pv(v_a, format($q$insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone) values (%s, %s, 'Test', '1990-01-01', 't@t.t', '5550000') returning id::text$q$, v_open, v_n_id));
  r := r || pg_temp.chk('U7', 'user cannot insert an entry as someone else', got, got like 'err:%row-level security%');
  got := pg_temp.pv(v_a, format($q$with u as (update giveaway_entries set phone = 'x' where user_id = %s returning 1) select count(*)::text from u$q$, v_a_id));
  r := r || pg_temp.chk('U8', 'user cannot update entries', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_a, format($q$with d as (delete from giveaway_entries where user_id = %s returning 1) select count(*)::text from d$q$, v_a_id));
  r := r || pg_temp.chk('U9', 'user cannot delete entries', got, got like 'err:permission denied%');
  got := pg_temp.pv(v_a, $q$select string_agg(giveaway_id || ':' || entry_count, ',' order by giveaway_id) from get_giveaway_entry_counts()$q$);
  r := r || pg_temp.chk('U10', 'authenticated public counts == true counts', got, got = t_public_str);
  got := pg_temp.pv(v_a, format($q$select entry_count::text from get_giveaway_entry_counts(array[%s])$q$, v_open));
  r := r || pg_temp.chk('U11', 'single-giveaway count (createEntry capacity check) works', got, got ~ '^[0-9]+$');

  -- ── unauthorized authenticated users ────────────────────────────────────────────────────
  got := pg_temp.pv(v_n, 'select count(*)::text from giveaway_entries');
  r := r || pg_temp.chk('X1', 'basic user with no entries reads 0 rows', got, got = '0');
  got := pg_temp.pv(v_bo, format('select count(*)::text from giveaway_entries where user_id <> %s', v_bo_id));
  r := r || pg_temp.chk('X2', 'bar_owner cannot read other entrants', got, got = '0');
  got := pg_temp.pv(v_td, format('select count(*)::text from giveaway_entries where user_id <> %s', v_td_id));
  r := r || pg_temp.chk('X3', 'tournament_director cannot read other entrants', got, got = '0');
  got := pg_temp.pv(v_bo, 'select count(*)::text from giveaway_winner_history');
  r := r || pg_temp.chk('X4', 'bar_owner cannot read winner history', got, got = '0');
  got := pg_temp.pv(v_bo, $q$select count(*)::text from get_giveaway_entry_counts() c join giveaways g on g.id = c.giveaway_id where g.status = 'archived'$q$);
  r := r || pg_temp.chk('X5', 'non-admin counts exclude archived', got, got = '0');

  -- ── giveaway admin (super_admin) ────────────────────────────────────────────────────────
  got := pg_temp.pv(v_sa, 'select count(*)::text from giveaway_entries');
  r := r || pg_temp.chk('S1', 'admin reads all entrant rows (participants list / getAllEntries)', got, got = t_total::text);
  got := pg_temp.pv(v_sa, 'select count(*)::text from giveaway_entries e join giveaways g on g.id = e.giveaway_id');
  r := r || pg_temp.chk('S2', 'admin entries + giveaway join (getAllEntries shape)', got, got = t_total::text);
  got := pg_temp.pv(v_sa, format('select count(*)::text from giveaway_winner_history h left join giveaway_entries e on e.id = h.entry_id where h.giveaway_id = %s and e.email is not null', v_award));
  r := r || pg_temp.chk('S3', 'admin winner history + entrant PII join (getWinnerHistory)', got, got = t_hist::text);
  got := pg_temp.pv(v_sa, format('select count(*)::text from giveaway_entries where giveaway_id = %s', v_open));
  r := r || pg_temp.chk('S4', 'admin draw can read entries of a giveaway (drawWinner)', got, got ~ '^[1-9][0-9]*$');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaways set winner_id = %s, winner_drawn_at = now(), winner_drawn_by = %s, status = 'awarded', ended_at = now(), updated_at = now() where id = %s returning 1) select count(*)::text from u$q$, v_a_id, v_sa_id, v_open));
  r := r || pg_temp.chk('S5', 'admin draw: update giveaway with winner', got, got = '1');
  got := pg_temp.pv(v_sa, format($q$insert into giveaway_winner_history (giveaway_id, user_id, entry_id, status, drawn_at, drawn_by) select %s, e.user_id, e.id, 'winner', now(), %s from giveaway_entries e where e.giveaway_id = %s limit 1 returning id::text$q$, v_open, v_sa_id, v_open));
  r := r || pg_temp.chk('S6', 'admin draw: insert winner history', got, got ~ '^[0-9]+$');
  got := pg_temp.pv(v_sa, format($q$with u as (update profiles set total_winnings = coalesce(total_winnings,0) + 1 where id_auto = %s returning 1) select count(*)::text from u$q$, v_a_id));
  r := r || pg_temp.chk('S7', 'admin draw: total_winnings fallback update', got, got = '1');
  got := pg_temp.pv(v_sa, format($q$with u as (update giveaway_winner_history set status = 'disqualified', disqualified_at = now(), disqualified_by = %s, disqualified_reason = 'test' where giveaway_id = %s and status = 'winner' returning 1) select count(*)::text from u$q$, v_sa_id, v_award));
  r := r || pg_temp.chk('S8', 'admin redraw: disqualify current winner', got, got ~ '^[1-9][0-9]*$');
  got := pg_temp.pv(v_sa, $q$select count(*)::text from get_giveaway_entry_counts() c join giveaways g on g.id = c.giveaway_id where g.status = 'archived'$q$);
  r := r || pg_temp.chk('S9', 'admin counts include archived giveaways', got, got = t_archived::text);
  got := pg_temp.pv(v_sa, 'select sum(c)::text from (select (select count(*) from giveaway_entries e where e.giveaway_id = g.id) c from giveaways g) s');
  r := r || pg_temp.chk('S10', 'admin embedded per-giveaway counts (getAllGiveaways) sum to total', got, got = t_total::text);

  -- ── G2 rollback restores pre-G2 behavior ────────────────────────────────────────────────
  execute __G2_RB__;
  got := pg_temp.pv(null, 'select count(email)::text from giveaway_entries');
  r := r || pg_temp.chk('R1', 'after G2 rollback: pre-G2 behavior restored (anon read returns)', got, got = t_total::text);

  select count(*) filter (where (x->>'pass')::boolean), count(*) filter (where not (x->>'pass')::boolean)
    into v_pass, v_fail from jsonb_array_elements(r) x where x ? 'pass';

  raise exception 'VERIFY_RESULT:%', jsonb_build_object('pass', v_pass, 'fail', v_fail, 'results', r)::text;
end
$verify$;
