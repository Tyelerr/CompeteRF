-- supabase/tests/authz_prod_verification.sql
--
-- ROLLBACK-ONLY production verification for the Phase 1 authz hardening (M1 + M2).
-- NOT a migration. One single DO statement, so it is atomic no matter how it is submitted:
--   1. proves each hole exists on the REAL prod policies (every probe rolled back),
--   2. applies M1 + M2 INSIDE the statement (EXECUTE of the migration files),
--   3. replays the adversarial + legitimate-flow cases as REAL accounts (auth.uid() via
--      request.jwt.claims, current_user via SET LOCAL ROLE authenticated/anon),
--   4. ALWAYS ends with RAISE EXCEPTION carrying the JSON results → everything (DDL + rows) rolls back.
-- The two EXECUTE placeholders below are substituted with the migration files (as dollar-quoted
-- literals) by the runner.
-- Side-effect notes: no live_* columns are touched (auto-assign pg_net trigger never fires); no
-- notifications/pg_net/cron are invoked; rolled-back inserts can only advance id sequences.
-- Pair with a before/after fingerprint of the touched tables + schema to prove nothing persisted.

do $verify$
declare
  r        jsonb := '[]'::jsonb;
  -- actors (real accounts, looked up by stable facts)
  v_sa     uuid;  v_sa_id   bigint;                       -- super_admin who is NOT the only one
  v_own    uuid;  v_own_id  bigint;  v_own_v  integer;    -- bar owner A + their venue
  v_own2   uuid;  v_own2_id bigint;  v_own2_v integer;    -- bar owner B + their venue
  v_td     uuid;  v_td_id   bigint;                       -- TD directing owner B's venue
  v_bu     uuid;  v_bu_id   bigint;                       -- basic users with no ties
  v_bu2    uuid;  v_bu2_id  bigint;
  v_manual uuid;  v_manual_id bigint;                     -- TD role with no ties (manual grant)
  v_free   integer;                                       -- venue with no owners/directors
  v_t      bigint;                                        -- a tournament the TD directs at venue B
  v_drift  jsonb;
  v_pass   int := 0;
  v_fail   int := 0;
begin
  -- ── helpers (temp; vanish with the rollback) ──────────────────────────────────────────────
  -- probe(uid, sql): run sql as that user (uid null = anon); its own effects are ALWAYS rolled
  -- back; returns 'ok:<rows>' or 'err:<message>'.
  execute $h$
    create function pg_temp.probe(p_uid uuid, p_sql text, p_keep boolean default false) returns text
    language plpgsql as $f$
    declare n bigint; msg text;
    begin
      begin
        perform set_config('request.jwt.claims',
          case when p_uid is null then '{"role":"anon"}' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
        perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
        perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
        execute p_sql;
        get diagnostics n = row_count;
        perform set_config('role', 'postgres', true);
        if not p_keep then
          raise exception 'PROBE_ROLLBACK:%', n;          -- undo the probe's own effects
        end if;
        return 'ok:' || n;
      exception when others then
        msg := sqlerrm;
        if msg like 'PROBE_ROLLBACK:%' then
          return 'ok:' || substr(msg, 16);
        end if;
        return 'err:' || msg;
      end;
    end $f$;
  $h$;

  -- SQL builders with every NOT NULL column prod requires (so a denial can only be authorization)
  execute $h$
    create function pg_temp.tsql(p_venue integer, p_director bigint) returns text language sql as $f$
      select format('insert into tournaments (venue_id, director_id, name, game_type, tournament_format, tournament_date, start_time, status, is_hidden) values (%s, %s, %L, %L, %L, current_date + 30, %L, %L, true)',
                    p_venue, p_director, 'authz-verify', '8-ball', 'double-elimination', '19:00', 'active')
    $f$;
    create function pg_temp.tmplsql(p_venue integer, p_director bigint) returns text language sql as $f$
      select format('insert into tournament_templates (venue_id, director_id, name, game_type, tournament_format, start_time, recurrence_type, recurrence_day, series_start_date, status) values (%s, %s, %L, %L, %L, %L, %L, %L, current_date + 30, %L)',
                    p_venue, p_director, 'authz-verify', '8-ball', 'double-elimination', '19:00', 'weekly', 'monday', 'paused')
    $f$;
  $h$;

  -- ── actors ───────────────────────────────────────────────────────────────────────────────
  select id, id_auto into v_sa, v_sa_id from profiles
   where role = 'super_admin' and status = 'active' and not is_disabled order by id_auto desc limit 1;
  select p.id, p.id_auto, vo.venue_id into v_own2, v_own2_id, v_own2_v
    from profiles p join venue_owners vo on vo.owner_id = p.id_auto and vo.archived_at is null
   where p.role = 'bar_owner'
     and exists (select 1 from venue_directors vd join profiles t on t.id_auto = vd.director_id
                 where vd.venue_id = vo.venue_id and vd.archived_at is null and t.role = 'tournament_director')
   order by p.id_auto limit 1;
  select p.id, p.id_auto, vo.venue_id into v_own, v_own_id, v_own_v
    from profiles p join venue_owners vo on vo.owner_id = p.id_auto and vo.archived_at is null
   where p.role = 'bar_owner' and p.id_auto <> v_own2_id order by p.id_auto limit 1;
  select t.id, t.id_auto into v_td, v_td_id
    from venue_directors vd join profiles t on t.id_auto = vd.director_id
   where vd.venue_id = v_own2_v and vd.archived_at is null and t.role = 'tournament_director' limit 1;
  select id into v_t from tournaments where director_id = v_td_id and venue_id = v_own2_v order by id desc limit 1;
  select id, id_auto into v_bu, v_bu_id from profiles p
   where role = 'basic_user' and status = 'active' and not is_disabled
     and not exists (select 1 from venue_owners where owner_id = p.id_auto)
     and not exists (select 1 from venue_directors where director_id = p.id_auto)
     and not exists (select 1 from tournaments where director_id = p.id_auto)
   order by id_auto limit 1;
  select id, id_auto into v_bu2, v_bu2_id from profiles p
   where role = 'basic_user' and status = 'active' and not is_disabled and id_auto <> v_bu_id
     and not exists (select 1 from venue_owners where owner_id = p.id_auto)
     and not exists (select 1 from venue_directors where director_id = p.id_auto)
     and not exists (select 1 from tournaments where director_id = p.id_auto)
   order by id_auto limit 1;
  select id, id_auto into v_manual, v_manual_id from profiles p
   where role = 'tournament_director'
     and not exists (select 1 from venue_owners where owner_id = p.id_auto)
     and not exists (select 1 from venue_directors where director_id = p.id_auto)
     and not exists (select 1 from tournaments where director_id = p.id_auto and status = 'active')
   order by id_auto limit 1;
  select v.id into v_free from venues v
   where not exists (select 1 from venue_owners where venue_id = v.id)
     and not exists (select 1 from venue_directors where venue_id = v.id)
   order by v.id limit 1;

  if v_sa is null or v_own is null or v_own2 is null or v_td is null or v_t is null or v_bu is null
     or v_bu2 is null or v_free is null then
    raise exception 'VERIFY_SETUP_FAILED %', jsonb_build_object('sa', v_sa, 'own', v_own, 'own2', v_own2,
      'td', v_td, 't', v_t, 'bu', v_bu, 'bu2', v_bu2, 'free', v_free);
  end if;

  -- ═════════════════════════════════════════════════════════════════════════════════════════
  -- BEFORE: holes on the live prod policies (expect 'ok'); every probe rolled back
  -- ═════════════════════════════════════════════════════════════════════════════════════════
  r := r || jsonb_build_array(
    jsonb_build_object('phase','before','case','basic_user self-promote to super_admin','expect','hole',
      'got', pg_temp.probe(v_bu, format('update profiles set role = %L where id = %L', 'super_admin', v_bu))),
    jsonb_build_object('phase','before','case','bar_owner edits unrelated profile role','expect','hole',
      'got', pg_temp.probe(v_own, format('update profiles set role = %L where id = %L', 'super_admin', v_bu2))),
    jsonb_build_object('phase','before','case','basic_user claims unowned venue ownership','expect','hole',
      'got', pg_temp.probe(v_bu, format('insert into venue_owners (venue_id, owner_id) values (%s, %s)', v_free, v_bu_id))),
    jsonb_build_object('phase','before','case','basic_user attaches as director of another owner''s venue','expect','hole',
      'got', pg_temp.probe(v_bu, format('insert into venue_directors (venue_id, director_id) values (%s, %s)', v_own_v, v_bu_id))),
    jsonb_build_object('phase','before','case','TD creates tournament at unrelated venue','expect','hole',
      'got', pg_temp.probe(v_td, pg_temp.tsql(v_own_v, v_td_id))),
    jsonb_build_object('phase','before','case','basic_user inserts template at unrelated venue','expect','hole',
      'got', pg_temp.probe(v_bu, pg_temp.tmplsql(v_free, v_bu_id))),
    jsonb_build_object('phase','before','case','conversation creator spoof','expect','hole',
      'got', pg_temp.probe(v_bu, format('select public.create_conversation_with_participants(%L, %L, %L, null, false, %L, %L)', v_bu2, 'authz-verify', 'general', v_td, 'x'))),
    jsonb_build_object('phase','before','case','anon can execute generate_recurring_tournaments','expect','hole',
      'got', case when has_function_privilege('anon', 'public.generate_recurring_tournaments()', 'execute') then 'ok:1' else 'err:no privilege' end)
  );

  -- ═════════════════════════════════════════════════════════════════════════════════════════
  -- APPLY M1 + M2 (inside this statement → rolled back with everything else)
  -- ═════════════════════════════════════════════════════════════════════════════════════════
  execute __M1__;
  execute __M2__;

  -- ═════════════════════════════════════════════════════════════════════════════════════════
  -- AFTER: adversarial (expect 'deny') and legitimate (expect 'ok')
  -- ═════════════════════════════════════════════════════════════════════════════════════════
  r := r || jsonb_build_array(
    -- profiles
    jsonb_build_object('phase','after','case','basic_user self-promote super_admin','expect','deny',
      'got', pg_temp.probe(v_bu, format('update profiles set role = %L where id = %L', 'super_admin', v_bu))),
    jsonb_build_object('phase','after','case','basic_user self-promote bar_owner','expect','deny',
      'got', pg_temp.probe(v_bu, format('update profiles set role = %L where id = %L', 'bar_owner', v_bu))),
    jsonb_build_object('phase','after','case','basic_user changes own status','expect','deny',
      'got', pg_temp.probe(v_bu, format('update profiles set status = %L where id = %L', 'suspended', v_bu))),
    jsonb_build_object('phase','after','case','basic_user changes own is_disabled','expect','deny',
      'got', pg_temp.probe(v_bu, format('update profiles set is_disabled = true where id = %L', v_bu))),
    jsonb_build_object('phase','after','case','basic_user edits own allowed fields (useEditProfile + last_active)','expect','ok',
      'got', pg_temp.probe(v_bu, format('update profiles set name = name, first_name = first_name, last_name = last_name, home_state = home_state, avatar_url = avatar_url, favorite_player = favorite_player, preferred_game = preferred_game, last_active_at = now(), updated_at = now() where id = %L', v_bu))),
    jsonb_build_object('phase','after','case','anon updates profiles','expect','deny',
      'got', pg_temp.probe(null, format('update profiles set role = %L where id = %L', 'super_admin', v_bu))),
    jsonb_build_object('phase','after','case','bar_owner edits unrelated profile role','expect','deny',
      'got', pg_temp.probe(v_own, format('update profiles set role = %L where id = %L', 'super_admin', v_bu2))),
    jsonb_build_object('phase','after','case','bar_owner edits unrelated profile name','expect','deny',
      'got', pg_temp.probe(v_own, format('update profiles set name = %L where id = %L', 'authz-verify', v_bu2))),
    -- venue_owners / venue_directors
    jsonb_build_object('phase','after','case','basic_user claims unowned venue ownership','expect','deny',
      'got', pg_temp.probe(v_bu, format('insert into venue_owners (venue_id, owner_id) values (%s, %s)', v_free, v_bu_id))),
    jsonb_build_object('phase','after','case','basic_user claims owned venue ownership','expect','deny',
      'got', pg_temp.probe(v_bu, format('insert into venue_owners (venue_id, owner_id) values (%s, %s)', v_own_v, v_bu_id))),
    jsonb_build_object('phase','after','case','owner A claims co-ownership of owner B venue','expect','deny',
      'got', pg_temp.probe(v_own, format('insert into venue_owners (venue_id, owner_id) values (%s, %s)', v_own2_v, v_own_id))),
    jsonb_build_object('phase','after','case','basic_user attaches as director of another venue','expect','deny',
      'got', pg_temp.probe(v_bu, format('insert into venue_directors (venue_id, director_id) values (%s, %s)', v_own_v, v_bu_id))),
    jsonb_build_object('phase','after','case','TD attaches self to unrelated venue','expect','deny',
      'got', pg_temp.probe(v_td, format('insert into venue_directors (venue_id, director_id) values (%s, %s)', v_own_v, v_td_id))),
    jsonb_build_object('phase','after','case','TD re-targets own director row to unrelated venue','expect','deny',
      'got', pg_temp.probe(v_td, format('update venue_directors set venue_id = %s where venue_id = %s and director_id = %s', v_own_v, v_own2_v, v_td_id))),
    jsonb_build_object('phase','after','case','owner B archives + restores own TD (useEditVenue/useMyDirectors)','expect','ok',
      'got', pg_temp.probe(v_own2, format('update venue_directors set archived_at = now(), archived_by = %s where venue_id = %s and director_id = %s; update venue_directors set archived_at = null, archived_by = null where venue_id = %s and director_id = %s', v_own2_id, v_own2_v, v_td_id, v_own2_v, v_td_id))),
    jsonb_build_object('phase','after','case','owner B adds basic user as director + recompute → TD (useEditVenue/add-director)','expect','ok',
      'got', pg_temp.probe(v_own2, format('insert into venue_directors (venue_id, director_id, assigned_by) values (%s, %s, %s); select public.recompute_user_role(%s) where public.recompute_user_role(%s) = %L', v_own2_v, v_bu_id, v_own2_id, v_bu_id, v_bu_id, 'tournament_director'))),
    jsonb_build_object('phase','after','case','owner B upserts director (useVenueTeam/reassign upsert)','expect','ok',
      'got', pg_temp.probe(v_own2, format('insert into venue_directors (venue_id, director_id, assigned_by) values (%s, %s, %s) on conflict (venue_id, director_id) do update set assigned_by = excluded.assigned_by', v_own2_v, v_td_id, v_own2_id))),
    jsonb_build_object('phase','after','case','owner B adds co-owner, recompute → bar_owner, then remove_venue_team_member → basic_user','expect','ok',
      'got', pg_temp.probe(v_own2, format($s$
         insert into venue_owners (venue_id, owner_id, assigned_by) values (%1$s, %2$s, %3$s);
         select 1 where public.recompute_user_role(%2$s) = 'bar_owner';
         select 1 where public.remove_venue_team_member('owner', (select id from venue_owners where venue_id = %1$s and owner_id = %2$s)) = 'basic_user'
      $s$, v_own2_v, v_bu2_id, v_own2_id))),
    jsonb_build_object('phase','after','case','owner A cannot remove owner B''s director via RPC','expect','deny',
      'got', pg_temp.probe(v_own, format('select public.remove_venue_team_member(%L, (select id from venue_directors where venue_id = %s and director_id = %s))', 'director', v_own2_v, v_td_id))),
    jsonb_build_object('phase','after','case','bar owner recomputes an unrelated (manual) TD','expect','deny',
      'got', case when v_manual is null then 'err:skipped (no manual TD)' else pg_temp.probe(v_own, format('select public.recompute_user_role(%s)', v_manual_id)) end),
    jsonb_build_object('phase','after','case','basic_user recomputes another user','expect','deny',
      'got', pg_temp.probe(v_bu, format('select public.recompute_user_role(%s)', v_td_id))),
    jsonb_build_object('phase','after','case','user recomputes self (allowed, no change)','expect','ok',
      'got', pg_temp.probe(v_td, format('select 1 where public.recompute_user_role(%s) = %L', v_td_id, 'tournament_director'))),
    -- tournaments
    jsonb_build_object('phase','after','case','TD creates tournament at unrelated owned venue','expect','deny',
      'got', pg_temp.probe(v_td, pg_temp.tsql(v_own_v, v_td_id))),
    jsonb_build_object('phase','after','case','TD creates tournament at unowned venue','expect','deny',
      'got', pg_temp.probe(v_td, pg_temp.tsql(v_free, v_td_id))),
    jsonb_build_object('phase','after','case','basic_user creates tournament anywhere','expect','deny',
      'got', pg_temp.probe(v_bu, pg_temp.tsql(v_own2_v, v_bu_id))),
    jsonb_build_object('phase','after','case','TD creates at assigned venue as self (submit)','expect','ok',
      'got', pg_temp.probe(v_td, pg_temp.tsql(v_own2_v, v_td_id))),
    jsonb_build_object('phase','after','case','owner creates at own venue as self (draft)','expect','ok',
      'got', pg_temp.probe(v_own2, pg_temp.tsql(v_own2_v, v_own2_id))),
    jsonb_build_object('phase','after','case','TD creates at assigned venue on someone else''s behalf','expect','deny',
      'got', pg_temp.probe(v_td, pg_temp.tsql(v_own2_v, v_bu_id))),
    jsonb_build_object('phase','after','case','TD moves own tournament to unrelated venue','expect','deny',
      'got', pg_temp.probe(v_td, format('update tournaments set venue_id = %s where id = %s', v_own_v, v_t))),
    jsonb_build_object('phase','after','case','TD edits own tournament (non-venue fields)','expect','ok',
      'got', pg_temp.probe(v_td, format('update tournaments set description = coalesce(description, %L) where id = %s', '', v_t))),
    jsonb_build_object('phase','after','case','owner B reassigns director at own venue (bar-tournament-manager)','expect','ok',
      'got', pg_temp.probe(v_own2, format('update tournaments set director_id = %s where id = %s', v_own2_id, v_t))),
    jsonb_build_object('phase','after','case','owner A reassigns director at owner B venue','expect','deny',
      'got', pg_temp.probe(v_own, format('update tournaments set director_id = %s where id = %s', v_own_id, v_t))),
    jsonb_build_object('phase','after','case','TD hands own tournament to another user','expect','deny',
      'got', pg_temp.probe(v_td, format('update tournaments set director_id = %s where id = %s', v_bu_id, v_t))),
    jsonb_build_object('phase','after','case','admin creates at any venue for any director (bulk import)','expect','ok',
      'got', pg_temp.probe(v_sa, pg_temp.tsql(v_free, v_td_id))),
    -- templates + generator
    jsonb_build_object('phase','after','case','basic_user template at unrelated venue','expect','deny',
      'got', pg_temp.probe(v_bu, pg_temp.tmplsql(v_free, v_bu_id))),
    jsonb_build_object('phase','after','case','TD template at unrelated venue','expect','deny',
      'got', pg_temp.probe(v_td, pg_temp.tmplsql(v_own_v, v_td_id))),
    jsonb_build_object('phase','after','case','TD template at assigned venue, then retarget it to unrelated venue','expect','deny',
      'got', pg_temp.probe(v_td, format($s$
         with t as (insert into tournament_templates (venue_id, director_id, name, game_type, tournament_format, start_time, recurrence_type, recurrence_day, series_start_date, status) values (%1$s, %2$s, 'authz-verify', '8-ball', 'double-elimination', '19:00', 'weekly', 'monday', current_date + 30, 'paused') returning id)
         update tournament_templates set venue_id = %3$s where id = (select id from t)
      $s$, v_own2_v, v_td_id, v_own_v))),
    jsonb_build_object('phase','after','case','TD template at assigned venue (recurring submit)','expect','ok',
      'got', pg_temp.probe(v_td, pg_temp.tmplsql(v_own2_v, v_td_id))),
    jsonb_build_object('phase','after','case','generate_recurring_tournaments EXECUTE revoked from anon+authenticated','expect','ok',
      'got', case when not has_function_privilege('anon', 'public.generate_recurring_tournaments()', 'execute')
                   and not has_function_privilege('authenticated', 'public.generate_recurring_tournaments()', 'execute')
                   and has_function_privilege('postgres', 'public.generate_recurring_tournaments()', 'execute')
                  then 'ok:1' else 'err:still granted' end),
    jsonb_build_object('phase','after','case','authenticated calls generate_recurring_tournaments','expect','deny',
      'got', pg_temp.probe(v_bu, 'select public.generate_recurring_tournaments()')),
    -- conversations
    jsonb_build_object('phase','after','case','conversation creator spoof','expect','deny',
      'got', pg_temp.probe(v_bu, format('select public.create_conversation_with_participants(%L, %L, %L, null, false, %L, %L)', v_bu2, 'authz-verify', 'general', v_td, 'x'))),
    jsonb_build_object('phase','after','case','support conversation spoofed as admin','expect','deny',
      'got', pg_temp.probe(v_bu, format('select public.create_conversation_with_participants(%L, %L, %L, null, true, null, %L)', v_sa, 'authz-verify', 'general', 'x'))),
    jsonb_build_object('phase','after','case','anon calls conversation RPC','expect','deny',
      'got', pg_temp.probe(null, format('select public.create_conversation_with_participants(%L, %L, %L, null, false, %L, %L)', v_bu, 'authz-verify', 'general', v_td, 'x'))),
    jsonb_build_object('phase','after','case','player → TD conversation as self (compose-message)','expect','ok',
      'got', pg_temp.probe(v_bu, format('select public.create_conversation_with_participants(%L, %L, %L, null, false, %L, %L)', v_bu, 'authz-verify', 'general', v_td, 'x'))),
    jsonb_build_object('phase','after','case','review reply as self (review.service)','expect','ok',
      'got', pg_temp.probe(v_td, format('select public.create_conversation_with_participants(%L, %L, %L, %s, false, %L, %L)', v_td, 'authz-verify', 'review', v_t, v_bu, 'x'))),
    -- admin RPCs
    jsonb_build_object('phase','after','case','bar owner calls admin_update_user','expect','deny',
      'got', pg_temp.probe(v_own, format('select public.admin_update_user(%L, null, null, null, %L, null)', v_bu, 'super_admin'))),
    jsonb_build_object('phase','after','case','super_admin changes own role','expect','deny',
      'got', pg_temp.probe(v_sa, format('select public.admin_update_user(%L, null, null, null, %L, null)', v_sa, 'basic_user'))),
    jsonb_build_object('phase','after','case','super_admin edits a user role/status (edit-user)','expect','ok',
      'got', pg_temp.probe(v_sa, format('select 1 where (public.admin_update_user(%L, null, null, null, %L, %L))->>%L = %L', v_bu, 'tournament_director', 'suspended', 'role', 'tournament_director'))),
    jsonb_build_object('phase','after','case','super_admin disables + soft-deletes a user','expect','ok',
      'got', pg_temp.probe(v_sa, format('select public.admin_set_user_disabled(%L, true); select public.admin_soft_delete_user(%L)', v_bu2, v_bu2))),
    jsonb_build_object('phase','after','case','basic_user calls admin_set_user_disabled','expect','deny',
      'got', pg_temp.probe(v_bu, format('select public.admin_set_user_disabled(%L, true)', v_bu2))),
    -- create_venue
    jsonb_build_object('phase','after','case','basic_user create_venue','expect','deny',
      'got', pg_temp.probe(v_bu, format('select public.create_venue(%L::jsonb, %L::bigint[])', '{"venue":"authz-verify","address":"a","city":"c","state":"MI","zip_code":"1"}', '{}'))),
    jsonb_build_object('phase','after','case','bar owner create_venue (+ director) → owner row + TD promotion','expect','ok',
      -- two statements: a statement cannot see rows written by a function it calls (same snapshot)
      'got', pg_temp.probe(v_own, format($s$
         select public.create_venue('{"venue":"authz-verify","address":"a","city":"c","state":"MI","zip_code":"1"}'::jsonb, array[%1$s]::bigint[]);
         select 1 from venues v
          where v.venue = 'authz-verify'
            and exists (select 1 from venue_owners vo where vo.venue_id = v.id and vo.owner_id = %2$s and vo.is_primary)
            and exists (select 1 from venue_directors vd where vd.venue_id = v.id and vd.director_id = %1$s)
            and (select role from profiles where id_auto = %1$s) = 'tournament_director'
      $s$, v_bu_id, v_own_id))),
    -- regressions
    jsonb_build_object('phase','after','case','get_auth_session still works for a user','expect','ok',
      'got', pg_temp.probe(v_td, 'select 1 where (public.get_auth_session())->''profile'' is not null')),
    jsonb_build_object('phase','after','case','M3 deferred: profile SELECT surface unchanged (anon reads active rows)','expect','ok',
      'got', pg_temp.probe(null, 'select id from profiles where status = ''active'' limit 1'))
  );

  -- Informational: users whose stored role differs from the derived role (recompute would change
  -- them IF triggered for them; no automatic sweep exists).
  select coalesce(jsonb_agg(jsonb_build_object('id_auto', id_auto, 'role', role, 'derived', derived)), '[]')
    into v_drift
    from (select p.id_auto, p.role,
            case when exists (select 1 from venue_owners where owner_id = p.id_auto and archived_at is null) then 'bar_owner'
                 when exists (select 1 from venue_directors where director_id = p.id_auto and archived_at is null)
                   or exists (select 1 from tournaments where director_id = p.id_auto and status = 'active') then 'tournament_director'
                 else 'basic_user' end derived
            from profiles p where p.role not in ('super_admin', 'compete_admin')) d
   where d.role <> d.derived;

  -- ── score ────────────────────────────────────────────────────────────────────────────────
  select count(*) filter (where
           (e->>'expect' = 'hole' and e->>'got' like 'ok:%' and e->>'got' <> 'ok:0')
        or (e->>'expect' = 'ok'   and e->>'got' like 'ok:%' and e->>'got' <> 'ok:0')
        or (e->>'expect' = 'deny' and (e->>'got' like 'err:%' or e->>'got' = 'ok:0'))),
         count(*) filter (where not (
           (e->>'expect' = 'hole' and e->>'got' like 'ok:%' and e->>'got' <> 'ok:0')
        or (e->>'expect' = 'ok'   and e->>'got' like 'ok:%' and e->>'got' <> 'ok:0')
        or (e->>'expect' = 'deny' and (e->>'got' like 'err:%' or e->>'got' = 'ok:0'))))
    into v_pass, v_fail
    from jsonb_array_elements(r) e;

  -- ALWAYS abort → full rollback of M1, M2 and every row touched above.
  raise exception 'AUTHZ_VERIFY_RESULT %', jsonb_build_object(
    'pass', v_pass, 'fail', v_fail, 'role_drift', v_drift, 'results', r)::text;
end
$verify$;
