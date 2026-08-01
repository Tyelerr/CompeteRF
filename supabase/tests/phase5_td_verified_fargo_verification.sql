-- phase5_td_verified_fargo_verification.sql
-- Verifies 20260814120000_td_add_verifies_fargo.sql. Catalog checks are read-only;
-- the behavioral block is wrapped in BEGIN/ROLLBACK (no data persists). Each SELECT
-- should return a 'PASS ...' string.

-- 1) players Fargo columns: types + defaults.
select case
         when count(*) filter (where column_name = 'fargo' and data_type = 'integer') = 1
          and count(*) filter (where column_name = 'fargo_status' and data_type = 'text'
                               and column_default like '''unverified''%' and is_nullable = 'NO') = 1
          and count(*) filter (where column_name = 'fargo_verified_by' and data_type = 'bigint') = 1
          and count(*) filter (where column_name = 'fargo_last_verified_at'
                               and data_type = 'timestamp with time zone') = 1
           then 'PASS 1: players Fargo columns + types/defaults'
         else 'FAIL 1: players Fargo columns wrong'
       end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'players'
  and column_name in ('fargo', 'fargo_status', 'fargo_verified_by', 'fargo_last_verified_at');

-- 2) status check constraint present.
select case when exists (select 1 from pg_constraint where conname = 'players_fargo_status_chk')
         then 'PASS 2: players_fargo_status_chk exists' else 'FAIL 2: constraint missing' end;

-- 3) Functions exist + SECURITY DEFINER + pinned search_path.
select string_agg(p.proname || '=' ||
         case when p.prosecdef then 'definer' else 'INVOKER!' end || '/' ||
         case when array_to_string(p.proconfig,';') like '%search_path%' then 'sp' else 'NOSP!' end, ' | ')
       as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('_promote_verified_fargo','td_verify_player_fargo',
                    'td_create_team_by_uuid','td_add_team_member_by_uuid','_ensure_player_for_user');
-- Expect all = definer/sp.

-- 4) Grants: _promote_verified_fargo NOT callable by clients; td_verify_player_fargo
--    authenticated-only (never anon); internal claim core stays internal.
select case
         when not has_function_privilege('authenticated','public._promote_verified_fargo(uuid,int)','EXECUTE')
          and not has_function_privilege('anon','public._promote_verified_fargo(uuid,int)','EXECUTE')
          and has_function_privilege('authenticated','public.td_verify_player_fargo(bigint,uuid,int)','EXECUTE')
          and not has_function_privilege('anon','public.td_verify_player_fargo(bigint,uuid,int)','EXECUTE')
          and not has_function_privilege('authenticated','public._ensure_player_for_user(uuid)','EXECUTE')
           then 'PASS 4: grants restricted correctly'
         else 'FAIL 4: grant mismatch'
       end as result;

-- 5) Gating + wiring present in the bodies (static).
select case
         when pg_get_functiondef('public.td_verify_player_fargo(bigint,uuid,int)'::regprocedure) ilike '%can_manage_tournament%'
          and pg_get_functiondef('public.td_create_team_by_uuid(bigint,uuid,int)'::regprocedure) ilike '%_promote_verified_fargo%'
          and pg_get_functiondef('public.td_create_team_by_uuid(bigint,uuid,int)'::regprocedure) ilike '%fargo_at_registration%'
          and pg_get_functiondef('public.td_add_team_member_by_uuid(bigint,uuid,int)'::regprocedure) ilike '%_promote_verified_fargo%'
          and pg_get_functiondef('public._ensure_player_for_user(uuid)'::regprocedure) ilike '%fargo_last_verified_at%'
           then 'PASS 5: gating + promotion + snapshot wired'
         else 'FAIL 5: wiring missing'
       end as result;

-- 6) Behavioral (rolled back): routing (pending), blank ignored, account_status unchanged.
begin;
  insert into public.players (display_name, email, account_status)
  values ('Verify Test Pending', 'verify_test_pending_tmp@example.com', 'PENDING')
  returning id as pend_id \gset

  select public._promote_verified_fargo(:'pend_id'::uuid, 500);
  select case when fargo = 500 and fargo_status = 'verified' and account_status = 'PENDING'
           then 'PASS 6a: pending routed to players.fargo, verified, account_status unchanged'
           else 'FAIL 6a: ' || coalesce(fargo::text,'null') || '/' || fargo_status || '/' || account_status
         end as result
  from public.players where id = :'pend_id'::uuid;

  select public._promote_verified_fargo(:'pend_id'::uuid, null);   -- blank
  select case when fargo = 500 then 'PASS 6b: blank Fargo ignored (unchanged)'
              else 'FAIL 6b: blank changed the value' end as result
  from public.players where id = :'pend_id'::uuid;
rollback;

-- NOTE: the no-overwrite-newer + idempotent claim promotion and the manager-gate
-- REJECTION path exercise auth.uid()/claim triggers and a real managed tournament —
-- verify those on-device (see the device checklist), or in a rolled-back block that
-- sets request.jwt.claims to a manager and a confirmed auth.users row.
