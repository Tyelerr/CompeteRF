-- supabase/tests/app_events_hardening_verification.sql
--
-- ROLLBACK-ONLY production verification for the app_events hardening (STEP 1A + 1B + 2).
-- One DO statement, as real accounts (auth.uid() via request.jwt.claims, SET LOCAL ROLE):
--   1. BEFORE — proves the current exposure on the live policies,
--   2. applies STEP 1A (placeholder STEP1) and re-tests every actor, the temporary director /
--      owner raw-read bridge, the aggregate RPC, the rate limit, and per-tournament dashboard
--      regression for EVERY director and venue owner in prod,
--   3. applies STEP 1B (placeholder STEP1B) and re-tests director / owner reads,
--   4. applies STEP 2 (placeholder STEP2) and re-tests writes,
--   5. ALWAYS raises with the JSON results → everything (DDL + rows) rolls back.

do $verify$
declare
  r      jsonb := '[]'::jsonb;
  v_pass int := 0;
  v_fail int := 0;
  v_a  uuid;              -- basic user who HAS app_opened events (victim)
  v_b  uuid;              -- another basic user (attacker)
  v_td uuid; v_td_id bigint; v_td_ids int[]; v_td_other int;
  v_bo uuid; v_bo_id bigint; v_bo_ids int[]; v_bo_other int;
  v_sa uuid;
  v_ca uuid;              -- a basic user temporarily promoted to compete_admin (rolled back)
  t_total bigint; t_null_entity bigint; t_a_rows bigint; t_td_views bigint; t_bo_views bigint; t_other_views bigint;
  got text;
  -- regression
  types text[] := array['tournament_viewed', 'directions_clicked', 'venue_contact_clicked',
                        'tournament_favorited', 'tournament_shared'];
  rec record; v_since timestamptz; old_j jsonb; new_j jsonb; raw_j jsonb;
  n_actors int := 0; n_cmp int := 0; mism jsonb := '[]'::jsonb;
  -- rate limit
  prior bigint; n_ok int; i int;
  fp_other_before text; fp_other_after text;
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
        -- A plain INSERT (no RETURNING) is run exactly like the app sends it: without INTO.
        if p_sql ~* '^\s*insert' and p_sql !~* 'returning' then
          execute p_sql;
        else
          execute p_sql into v;
        end if;
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
  -- Sum of get_tournament_event_counts for one event type, as SQL text for pv().
  execute $h$
    create function pg_temp.rpc_sum(p_ids int[], p_type text) returns text
    language sql as $f$
      select format($q$select coalesce(sum(event_count), 0)::text from get_tournament_event_counts(%L::int[], array[%L]::text[])$q$, p_ids, p_type)
    $f$;
  $h$;
  -- Live tournament_viewed count for a set of tournaments (expected values are computed at check
  -- time, since test rows are inserted along the way).
  execute $h$
    create function pg_temp.views(p_ids int[]) returns text
    language sql as $f$
      select count(*)::text from app_events e
       where e.entity_type = 'tournament' and e.event_type = 'tournament_viewed' and e.entity_id = any(p_ids)
    $f$;
  $h$;
  execute $h$
    create function pg_temp.fp_other() returns text
    language sql as $f$
      select md5(
        (select coalesce(string_agg(x::text, '|' order by x::text), '') from referral_visits x) ||
        (select coalesce(string_agg(x::text, '|' order by x::text), '') from referrals x) ||
        (select coalesce(string_agg(x::text, '|' order by x::text), '') from referral_codes x) ||
        (select coalesce(string_agg(x::text, '|' order by x::text), '') from giveaway_wallets x) ||
        (select coalesce(string_agg(x::text, '|' order by x::text), '') from giveaway_credit_ledger x) ||
        (select coalesce(string_agg(policyname || tablename, '|' order by tablename, policyname), '') from pg_policies
          where tablename in ('referral_visits', 'referrals', 'referral_codes', 'giveaway_wallets', 'giveaway_credit_ledger', 'giveaway_entries')))
    $f$;
  $h$;

  -- ── actors ──────────────────────────────────────────────────────────────────────────────
  select p.id into v_a from profiles p where p.role = 'basic_user'
     and exists (select 1 from app_events e where e.user_id = p.id and e.event_type = 'app_opened') order by p.id_auto limit 1;
  select p.id into v_b from profiles p where p.role = 'basic_user' and p.id <> v_a order by p.id_auto desc limit 1;
  select p.id, p.id_auto into v_td, v_td_id from profiles p where p.role = 'tournament_director'
     and exists (select 1 from tournaments t join app_events e on e.entity_type = 'tournament' and e.entity_id = t.id where t.director_id = p.id_auto)
   order by p.id_auto limit 1;
  select p.id, p.id_auto into v_bo, v_bo_id from profiles p where p.role = 'bar_owner'
     and exists (select 1 from venue_owners vo join tournaments t on t.venue_id = vo.venue_id join app_events e on e.entity_type = 'tournament' and e.entity_id = t.id
                  where vo.owner_id = p.id_auto and vo.archived_at is null)
   order by p.id_auto limit 1;
  select id into v_sa from profiles where role = 'super_admin' order by id_auto limit 1;
  select id into v_ca from profiles where role = 'basic_user' and id not in (v_a, v_b) order by id_auto limit 1;

  -- the ID lists exactly as the dashboards build them
  v_td_ids := array(select t.id from tournaments t where t.director_id = v_td_id);
  v_bo_ids := array(select t.id from tournaments t where t.venue_id in
                      (select vo.venue_id from venue_owners vo where vo.owner_id = v_bo_id and vo.archived_at is null));
  -- a tournament with views that neither the TD nor the owner may see
  select e.entity_id into v_td_other from app_events e join tournaments t on t.id = e.entity_id
   where e.entity_type = 'tournament' and e.event_type = 'tournament_viewed'
     and t.director_id is distinct from v_td_id and t.director_id is distinct from v_bo_id
     and t.id <> all(v_bo_ids)
   group by e.entity_id order by count(*) desc limit 1;
  v_bo_other := v_td_other;

  select count(*) into t_total from app_events;
  select count(*) into t_null_entity from app_events where entity_id is null;
  select count(*) into t_a_rows from app_events where user_id = v_a;
  select count(*) into t_td_views from app_events e where e.entity_type = 'tournament' and e.event_type = 'tournament_viewed' and e.entity_id = any(v_td_ids);
  select count(*) into t_bo_views from app_events e where e.entity_type = 'tournament' and e.event_type = 'tournament_viewed' and e.entity_id = any(v_bo_ids);
  select count(*) into t_other_views from app_events e where e.entity_type = 'tournament' and e.event_type = 'tournament_viewed' and e.entity_id = v_td_other;

  r := r || jsonb_build_object('actors', jsonb_build_object('total', t_total, 'null_entity', t_null_entity,
          'victim_rows', t_a_rows, 'td_views', t_td_views, 'bo_views', t_bo_views, 'other_tournament_views', t_other_views,
          'have_td', v_td is not null, 'have_bo', v_bo is not null));

  fp_other_before := pg_temp.fp_other();

  -- ═══ BEFORE: current production exposure ═══════════════════════════════════════════════
  got := pg_temp.pv(null, format($q$insert into app_events (event_type, user_id, metadata) values ('app_opened', %L, '{"t":"B1"}')$q$, v_a), true);
  got := got || '|' || (select count(*) from app_events where metadata->>'t' = 'B1' and user_id = v_a);
  r := r || pg_temp.chk('B1', 'BEFORE: anon can insert an event attributed to another user', got, got = '<null>|1');
  got := pg_temp.pv(v_b, format($q$insert into app_events (event_type, user_id) values ('tournament_favorited', %L) returning user_id::text$q$, v_a));
  r := r || pg_temp.chk('B2', 'BEFORE: signed-in user can insert as another user', got, got = v_a::text);
  got := pg_temp.pv(null, $q$insert into app_events (event_type, metadata) values ('totally_made_up', '{"t":"B3","junk":[1,2,3]}')$q$, true);
  got := got || '|' || (select count(*) from app_events where metadata->>'t' = 'B3');
  r := r || pg_temp.chk('B3', 'BEFORE: arbitrary event types accepted', got, got = '<null>|1');
  got := pg_temp.pv(v_b, format('select count(*)::text from app_events where user_id = %L', v_a));
  r := r || pg_temp.chk('B4', 'BEFORE: a basic user reads ANOTHER user''s events (user_id visible)', got, got::bigint > 0);
  got := pg_temp.pv(v_b, 'select count(*)::text from app_events where entity_id is null');
  r := r || pg_temp.chk('B5', 'BEFORE: a basic user reads every entity_id-null row (app_opened / filters)', got, got = (select count(*)::text from app_events where entity_id is null));
  got := pg_temp.pv(v_td, format('select count(distinct user_id)::text from app_events where entity_id = any(%L::int[]) and user_id is not null', v_td_ids));
  r := r || pg_temp.chk('B6', 'BEFORE: a TD reads raw rows incl. the user_id of viewers of their tournaments', got, got::int > 0);

  -- ═══ STEP 1 ═══════════════════════════════════════════════════════════════════════════
  execute __STEP1__;   -- STEP 1A

  -- anon
  got := pg_temp.pv(null, 'select count(*)::text from app_events');
  r := r || pg_temp.chk('A1', 'anon cannot read app_events', got, got like 'err:permission denied%');
  got := pg_temp.pv(null, format($q$insert into app_events (event_type, user_id) values ('app_opened', %L)$q$, v_a));
  r := r || pg_temp.chk('A2', 'anon cannot attribute an event to a user', got, got like 'err:%row-level security%');
  got := pg_temp.pv(null, $q$insert into app_events (event_type, metadata) values ('app_opened', '{"platform":"ios","t":"A3"}')$q$, true);
  got := got || '|' || (select count(*) from app_events where metadata->>'t' = 'A3' and user_id is null);
  r := r || pg_temp.chk('A3', 'anon anonymous direct insert (what current native builds send) still works', got, got = '<null>|1');
  got := pg_temp.pv(null, $q$insert into app_events (event_type) values ('totally_made_up')$q$);
  r := r || pg_temp.chk('A4', 'unknown event types refused', got, got like 'err:%row-level security%');
  got := pg_temp.pv(null, $q$with u as (update app_events set event_type = 'app_opened' returning 1) select count(*)::text from u$q$);
  got := got || '|' || pg_temp.pv(null, $q$with d as (delete from app_events returning 1) select count(*)::text from d$q$);
  r := r || pg_temp.chk('A5', 'anon cannot update / delete', got, got like 'err:permission denied%|err:permission denied%');
  got := pg_temp.pv(null, pg_temp.rpc_sum(v_td_ids, 'tournament_viewed'));
  r := r || pg_temp.chk('A6', 'anon cannot call the aggregate RPC', got, got like 'err:permission denied%');

  -- signed-in basic user
  got := pg_temp.pv(v_b, format($q$insert into app_events (event_type, user_id) values ('tournament_favorited', %L)$q$, v_a));
  r := r || pg_temp.chk('U1', 'basic user cannot insert as another user', got, got like 'err:%row-level security%');
  got := pg_temp.pv(v_b, format($q$insert into app_events (event_type, entity_type, entity_id, user_id, metadata) values ('tournament_viewed', 'tournament', 1, %L, '{"source_screen":"billiards","t":"U2"}')$q$, v_b), true);
  got := got || '|' || (select count(*) from app_events where metadata->>'t' = 'U2' and user_id = v_b);
  r := r || pg_temp.chk('U2', 'basic user direct insert as themselves (what current native builds send) still works', got, got = '<null>|1');
  got := pg_temp.pv(v_b, $q$insert into app_events (event_type, metadata) values ('app_opened', '[1]')$q$);
  got := got || '|' || pg_temp.pv(v_b, format($q$insert into app_events (event_type, metadata) values ('app_opened', jsonb_build_object('x', %L))$q$, repeat('a', 3000)));
  r := r || pg_temp.chk('U3', 'non-object / oversized metadata refused (direct insert)', got, got like 'err:%row-level security%|err:%row-level security%');
  got := pg_temp.pv(v_b, format('select count(*)::text from app_events where user_id = %L', v_a));
  got := got || '|' || pg_temp.pv(v_b, format('select count(*)::text from app_events where user_id = %L', v_b));
  got := got || '|' || pg_temp.pv(v_b, 'select count(*)::text from app_events');
  r := r || pg_temp.chk('U4', 'basic user reads no rows (others'', own, total)', got, got = '0|0|0');
  got := pg_temp.pv(v_b, $q$with u as (update app_events set metadata = '{}' returning 1) select count(*)::text from u$q$);
  got := got || '|' || pg_temp.pv(v_b, $q$with d as (delete from app_events returning 1) select count(*)::text from d$q$);
  r := r || pg_temp.chk('U5', 'basic user cannot update / delete', got, got like 'err:permission denied%|err:permission denied%');
  got := pg_temp.pv(v_b, pg_temp.rpc_sum(array[v_td_other], 'tournament_viewed'));
  r := r || pg_temp.chk('U6', 'basic user gets 0 from the aggregate RPC for someone else''s tournament', got, got = '0' and t_other_views > 0);

  -- log_app_event
  got := pg_temp.pv(null, $q$select log_app_event('tournament_viewed', 'tournament', 1, '{"source_screen":"billiards"}')::text$q$, true);
  got := got || '|' || (select (user_id is null)::text from app_events order by id desc limit 1);
  r := r || pg_temp.chk('F1', 'log_app_event as anon → recorded as anonymous', got, got = 'true|true');
  got := pg_temp.pv(v_b, $q$select log_app_event('app_opened', null, null, '{"platform":"web"}')::text$q$, true);
  got := got || '|' || (select (user_id = v_b and event_type = 'app_opened' and metadata = '{"platform":"web"}')::text from app_events order by id desc limit 1);
  r := r || pg_temp.chk('F2', 'app_opened via log_app_event → caller derived from auth, metadata intact', got, got = 'true|true');
  got := pg_temp.pv(v_b, $q$select log_app_event('filters_changed', null, null, '{"filters":{"state":"TX","game_type":"9-ball"},"source_screen":"billiards"}')::text$q$, true);
  got := got || '|' || (select (user_id = v_b and metadata->'filters'->>'state' = 'TX')::text from app_events order by id desc limit 1);
  r := r || pg_temp.chk('F3', 'filters_changed via log_app_event records with its filters payload', got, got = 'true|true');
  got := pg_temp.pv(v_b, format($q$select log_app_event('bogus_event')::text || ',' || log_app_event('app_opened', 'planet')::text || ',' || log_app_event('app_opened', null, null, '[1]')::text || ',' || log_app_event('app_opened', null, null, jsonb_build_object('x', %L))::text$q$, repeat('a', 3000)));
  r := r || pg_temp.chk('F4', 'bad event type / entity type / metadata shape / size → false, nothing stored', got, got = 'false,false,false,false');
  got := pg_temp.pv(v_b, format($q$select log_app_event('app_opened', null, null, '{}'::jsonb, %L::uuid)::text$q$, v_a));
  r := r || pg_temp.chk('F5', 'there is no way to pass a user id', got, got like 'err:function %log_app_event%does not exist%');
  got := (select pg_get_function_result('public.get_tournament_event_counts(integer[], text[], timestamptz)'::regprocedure));
  r := r || pg_temp.chk('F6', 'aggregate RPC returns only (entity_id, event_type, count) — no user_id / metadata / timestamps', got,
          got = 'TABLE(entity_id integer, event_type text, event_count bigint)');
  got := (select string_agg(pg_get_function_identity_arguments(oid), ',') from pg_proc where proname = '_app_event_rate_ok');
  r := r || pg_temp.chk('F7', 'rate check takes no arguments (cannot probe another user''s activity)', coalesce(got, '<none>'), got = '');

  -- tournament director
  if v_td is not null then
    -- old native dashboards: raw row counts over their own tournament ids (temporary bridge)
    got := pg_temp.pv(v_td, format($q$select count(*)::text from app_events where event_type = 'tournament_viewed' and entity_id = any(%L::int[])$q$, v_td_ids));
    r := r || pg_temp.chk('T1', 'TD: old-native raw count over own tournaments still works (bridge)', got, got = pg_temp.views(v_td_ids) and got <> '0');
    got := pg_temp.pv(v_td, format($q$select count(*)::text from app_events where entity_id = %s$q$, v_td_other));
    got := got || '|' || pg_temp.pv(v_td, format($q$select count(*)::text from app_events where event_type = 'tournament_viewed' and entity_id = any(%L::int[])$q$, v_td_ids || v_td_other));
    r := r || pg_temp.chk('T2', 'TD: raw read of an unauthorized tournament → 0 rows (alone, and mixed into own list)', got,
            got = '0|' || pg_temp.views(v_td_ids) and t_other_views > 0);
    got := pg_temp.pv(v_td, 'select count(*)::text from app_events where entity_id is null');
    got := got || '|' || pg_temp.pv(v_td, $q$select count(*)::text from app_events where event_type in ('app_opened', 'filters_changed')$q$);
    got := got || '|' || pg_temp.pv(v_td, format($q$select count(*)::text from app_events where not (entity_type = 'tournament' and entity_id = any(%L::int[]))$q$, v_td_ids));
    got := got || '|' || pg_temp.pv(v_td, 'select count(*)::text from app_events');
    r := r || pg_temp.chk('T3', 'TD: bridge exposes no entity_id-null / app_opened / filters_changed / non-own rows (null|global|other|total)', got,
            got = '0|0|0|' || (select count(*) from app_events where entity_type = 'tournament' and entity_id = any(v_td_ids)));
    got := pg_temp.pv(v_td, pg_temp.rpc_sum(v_td_ids, 'tournament_viewed'));
    got := got || '|' || pg_temp.pv(v_td, pg_temp.rpc_sum(array[v_td_other], 'tournament_viewed'));
    got := got || '|' || pg_temp.pv(v_td, pg_temp.rpc_sum(v_td_ids || v_td_other, 'tournament_viewed'));
    r := r || pg_temp.chk('T4', 'TD: aggregate RPC = own views; unauthorized tournament → 0; mixed in → ignored', got,
            got = pg_temp.views(v_td_ids) || '|0|' || pg_temp.views(v_td_ids) and t_other_views > 0);
  end if;

  -- bar / venue owner
  if v_bo is not null then
    -- old native dashboards: raw row counts over their own tournament ids (temporary bridge)
    got := pg_temp.pv(v_bo, format($q$select count(*)::text from app_events where event_type = 'tournament_viewed' and entity_id = any(%L::int[])$q$, v_bo_ids));
    r := r || pg_temp.chk('O1', 'bar owner: old-native raw count over own tournaments still works (bridge)', got, got = pg_temp.views(v_bo_ids) and got <> '0');
    got := pg_temp.pv(v_bo, format($q$select count(*)::text from app_events where entity_id = %s$q$, v_bo_other));
    got := got || '|' || pg_temp.pv(v_bo, format($q$select count(*)::text from app_events where event_type = 'tournament_viewed' and entity_id = any(%L::int[])$q$, v_bo_ids || v_bo_other));
    r := r || pg_temp.chk('O2', 'bar owner: raw read of an unauthorized tournament → 0 rows (alone, and mixed into own list)', got,
            got = '0|' || pg_temp.views(v_bo_ids) and t_other_views > 0);
    got := pg_temp.pv(v_bo, 'select count(*)::text from app_events where entity_id is null');
    got := got || '|' || pg_temp.pv(v_bo, $q$select count(*)::text from app_events where event_type in ('app_opened', 'filters_changed')$q$);
    got := got || '|' || pg_temp.pv(v_bo, format($q$select count(*)::text from app_events where not (entity_type = 'tournament' and entity_id = any(%L::int[]))$q$, v_bo_ids));
    got := got || '|' || pg_temp.pv(v_bo, 'select count(*)::text from app_events');
    r := r || pg_temp.chk('O3', 'bar owner: bridge exposes no entity_id-null / app_opened / filters_changed / non-own rows (null|global|other|total)', got,
            got = '0|0|0|' || (select count(*) from app_events where entity_type = 'tournament' and entity_id = any(v_bo_ids)));
    got := pg_temp.pv(v_bo, pg_temp.rpc_sum(v_bo_ids, 'tournament_viewed'));
    got := got || '|' || pg_temp.pv(v_bo, pg_temp.rpc_sum(array[v_bo_other], 'tournament_viewed'));
    got := got || '|' || pg_temp.pv(v_bo, pg_temp.rpc_sum(v_bo_ids || v_bo_other, 'tournament_viewed'));
    r := r || pg_temp.chk('O4', 'bar owner: aggregate RPC = own views; unauthorized tournament → 0; mixed in → ignored', got,
            got = pg_temp.views(v_bo_ids) || '|0|' || pg_temp.views(v_bo_ids) and t_other_views > 0);
  end if;

  -- admins
  got := pg_temp.pv(v_sa, 'select count(*)::text from app_events');
  r := r || pg_temp.chk('S1', 'super_admin reads all events (analytics dashboards)', got, got = (select count(*)::text from app_events));
  got := pg_temp.pv(v_sa, pg_temp.rpc_sum(array[v_td_other], 'tournament_viewed'));
  r := r || pg_temp.chk('S2', 'super_admin aggregate RPC covers any tournament', got, got = pg_temp.views(array[v_td_other]) and got <> '0');
  update profiles set role = 'compete_admin' where id = v_ca;           -- rolled back with everything
  got := pg_temp.pv(v_ca, 'select count(*)::text from app_events');
  r := r || pg_temp.chk('S3', 'compete_admin reads all events', got, got = (select count(*)::text from app_events));
  update profiles set role = 'basic_user' where id = v_ca;

  -- ── REGRESSION: every director and every active venue owner, the 5 tournament event types the
  --    dashboards count, per tournament, lifetime + 30-day window. Three numbers must agree:
  --    OLD = the pre-change dashboard query evaluated as postgres (event_type + entity_id IN ids),
  --    RAW = that same query run AS the user under the STEP 1A bridge (old native builds),
  --    RPC = get_tournament_event_counts AS the user (web + next native build).
  for rec in
    select p.id as uid, 'td' as kind, array(select t.id from tournaments t where t.director_id = p.id_auto) as ids
      from profiles p where exists (select 1 from tournaments t where t.director_id = p.id_auto)
    union all
    select p.id, 'bo', array(select t.id from tournaments t where t.venue_id in
                              (select vo.venue_id from venue_owners vo where vo.owner_id = p.id_auto and vo.archived_at is null))
      from profiles p where exists (select 1 from venue_owners vo where vo.owner_id = p.id_auto and vo.archived_at is null)
  loop
    n_actors := n_actors + 1;
    foreach v_since in array array[null, now() - interval '30 days']::timestamptz[] loop
      n_cmp := n_cmp + 1;
      select coalesce(jsonb_object_agg(k, c), '{}') into old_j from (
        select e.entity_id || ':' || e.event_type as k, count(*) as c from app_events e
         where e.event_type = any(types) and e.entity_id = any(rec.ids) and (v_since is null or e.created_at >= v_since)
         group by 1) z;
      got := pg_temp.pv(rec.uid, format($q$select coalesce(jsonb_object_agg(k, c), '{}')::text from (
               select e.entity_id || ':' || e.event_type as k, count(*) as c from app_events e
                where e.event_type = any(%L::text[]) and e.entity_id = any(%L::int[]) and (%L::timestamptz is null or e.created_at >= %L::timestamptz)
                group by 1) z$q$, types, rec.ids, v_since, v_since), true);
      raw_j := case when got like 'err:%' then jsonb_build_object('err', got) else got::jsonb end;
      got := pg_temp.pv(rec.uid, format($q$select coalesce(jsonb_object_agg(c.entity_id || ':' || c.event_type, c.event_count), '{}')::text
               from get_tournament_event_counts(%L::int[], %L::text[], %L::timestamptz) c$q$, rec.ids, types, v_since), true);
      new_j := case when got like 'err:%' then jsonb_build_object('err', got) else got::jsonb end;
      if raw_j is distinct from old_j or new_j is distinct from old_j then
        mism := mism || jsonb_build_object('kind', rec.kind, 'window', coalesce(v_since::text, 'lifetime'), 'old', old_j, 'raw', raw_j, 'rpc', new_j);
      end if;
    end loop;
  end loop;
  r := r || pg_temp.chk('R1', format('per-tournament numbers identical OLD = RAW(bridge) = RPC for %s directors/owners × 5 event types × 2 windows', n_actors),
          format('actors=%s comparisons=%s mismatches=%s', n_actors, n_cmp, mism), jsonb_array_length(mism) = 0 and n_actors > 0);

  -- ── RATE LIMIT (runs last in STEP 1A: it saturates buckets) ──────────────────────────────
  select count(*) into prior from app_events where user_id = v_b and created_at > now() - interval '1 minute';
  n_ok := 0;
  for i in 1..70 loop
    if pg_temp.pv(v_b, $q$select log_app_event('app_opened', null, null, '{"platform":"web"}')::text$q$, true) = 'true' then n_ok := n_ok + 1; end if;
  end loop;
  got := format('prior=%s accepted=%s/70', prior, n_ok);
  got := got || '|' || pg_temp.pv(v_b, format($q$insert into app_events (event_type, user_id) values ('app_opened', %L)$q$, v_b));
  got := got || '|' || pg_temp.pv(v_b, $q$insert into app_events (event_type, user_id) values ('app_opened', null)$q$);
  r := r || pg_temp.chk('RL1', 'per-user limit: 60/min via RPC, then dropped (false) — direct inserts (own or user_id=null) refused too', got,
          n_ok = greatest(0, 60 - prior) and got like '%|err:%row-level security%|err:%row-level security%');
  got := pg_temp.pv(v_ca, $q$select log_app_event('app_opened')::text$q$, true);
  r := r || pg_temp.chk('RL2', 'another signed-in user is unaffected', got, got = 'true');

  select count(*) into prior from app_events where user_id is null and created_at > now() - interval '1 minute';
  n_ok := 0;
  for i in 1..130 loop
    if pg_temp.pv(null, $q$select log_app_event('app_opened', null, null, '{"platform":"web"}')::text$q$, true) = 'true' then n_ok := n_ok + 1; end if;
  end loop;
  got := format('prior=%s accepted=%s/130', prior, n_ok);
  got := got || '|' || pg_temp.pv(null, $q$insert into app_events (event_type) values ('app_opened')$q$);
  r := r || pg_temp.chk('RL3', 'anonymous bucket: 120/min then dropped; direct anon insert refused too', got,
          n_ok = greatest(0, 120 - prior) and got like '%|err:%row-level security%');
  got := pg_temp.pv(v_ca, $q$select log_app_event('app_opened')::text$q$, true);
  r := r || pg_temp.chk('RL4', 'signed-in logging unaffected by a flooded anonymous bucket', got, got = 'true');

  -- reset the buckets for the later steps (all rows from this transaction; rolled back anyway)
  delete from app_events where created_at = now();

  -- ═══ STEP 1B: remove the director / owner raw-read bridge ═══════════════════════════════
  execute __STEP1B__;
  got := pg_temp.pv(v_td, 'select count(*)::text from app_events');
  got := got || '|' || pg_temp.pv(v_td, format($q$select count(*)::text from app_events where event_type = 'tournament_viewed' and entity_id = any(%L::int[])$q$, v_td_ids));
  got := got || '|' || pg_temp.pv(v_bo, 'select count(*)::text from app_events');
  got := got || '|' || pg_temp.pv(v_bo, format($q$select count(*)::text from app_events where event_type = 'tournament_viewed' and entity_id = any(%L::int[])$q$, v_bo_ids));
  r := r || pg_temp.chk('K1', 'STEP 1B: TD and bar owner read NO raw rows (total | own-tournament query, each)', got, got = '0|0|0|0');
  got := pg_temp.pv(v_td, pg_temp.rpc_sum(v_td_ids, 'tournament_viewed')) || '|' || pg_temp.pv(v_bo, pg_temp.rpc_sum(v_bo_ids, 'tournament_viewed'));
  r := r || pg_temp.chk('K2', 'STEP 1B: dashboards keep working via the aggregate RPC (TD | owner)', got,
          got = pg_temp.views(v_td_ids) || '|' || pg_temp.views(v_bo_ids) and got <> '0|0');
  got := pg_temp.pv(v_b, 'select count(*)::text from app_events') || '|' || pg_temp.pv(v_sa, 'select (count(*) > 0)::text from app_events');
  r := r || pg_temp.chk('K3', 'STEP 1B: basic user still 0 rows; admin still reads everything', got, got = '0|true');
  got := (select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies where tablename = 'app_events');
  r := r || pg_temp.chk('K4', 'STEP 1B: only the admin SELECT policy + the two restricted insert policies remain', got,
          got = 'Admins can read all events:SELECT,Anon can insert anonymous events:INSERT,Users can insert own events:INSERT');

  -- ═══ STEP 2 (after 1B) ═══════════════════════════════════════════════════════════════════════════
  execute __STEP2__;
  got := pg_temp.pv(null, $q$insert into app_events (event_type) values ('app_opened')$q$);
  got := got || '|' || pg_temp.pv(v_b, format($q$insert into app_events (event_type, user_id) values ('app_opened', %L)$q$, v_b));
  r := r || pg_temp.chk('L1', 'STEP 2: no direct client INSERT at all (anon or signed-in)', got, got like 'err:permission denied%|err:permission denied%');
  got := pg_temp.pv(null, $q$select log_app_event('app_opened', null, null, '{"platform":"ios"}')::text$q$)
      || '|' || pg_temp.pv(v_b, $q$select log_app_event('tournament_favorited', 'tournament', 1)::text$q$);
  r := r || pg_temp.chk('L2', 'STEP 2: log_app_event still records for anon and signed-in', got, got = 'true|true');
  got := pg_temp.pv(v_sa, 'select (count(*) > 0)::text from app_events');
  got := got || '|' || pg_temp.pv(v_td, pg_temp.rpc_sum(v_td_ids, 'tournament_viewed'));
  r := r || pg_temp.chk('L3', 'STEP 2: admin reads + TD aggregate unaffected', got, got = 'true|' || pg_temp.views(v_td_ids));

  -- ── untouched: referrals / referral_visits / giveaway wallet ────────────────────────────
  fp_other_after := pg_temp.fp_other();
  r := r || pg_temp.chk('X1', 'referral_visits, referrals, referral_codes, giveaway wallet + ledger (rows + policies) unchanged',
          fp_other_after, fp_other_after = fp_other_before);

  select count(*) filter (where (x->>'pass')::boolean), count(*) filter (where not (x->>'pass')::boolean)
    into v_pass, v_fail from jsonb_array_elements(r) x where x ? 'pass';
  raise exception 'VERIFY_RESULT:%', jsonb_build_object('pass', v_pass, 'fail', v_fail, 'results', r)::text;
end
$verify$;
