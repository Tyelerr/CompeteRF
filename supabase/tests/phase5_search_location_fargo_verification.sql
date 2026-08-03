-- phase5_search_location_fargo_verification.sql
-- Verifies 20260815120000_registration_search_location_fargo_status.sql. Read-only.
-- Each SELECT should return a 'PASS …' string.

-- 1) search return type includes the new columns with expected types.
select case
         when pg_get_function_result('public.search_players_for_registration(bigint,text,int)'::regprocedure)
              ilike '%fargo_status text%'
          and pg_get_function_result('public.search_players_for_registration(bigint,text,int)'::regprocedure)
              ilike '%home_city text%'
          and pg_get_function_result('public.search_players_for_registration(bigint,text,int)'::regprocedure)
              ilike '%home_state text%'
           then 'PASS 1: search returns fargo_status + home_city + home_state'
         else 'FAIL 1: search return missing new columns'
       end as result;

-- 2) recents return type includes the new columns.
select case
         when pg_get_function_result('public.get_recent_players_for_registration(bigint,int)'::regprocedure)
              ilike '%fargo_status text%'
          and pg_get_function_result('public.get_recent_players_for_registration(bigint,int)'::regprocedure)
              ilike '%home_city text%'
          and pg_get_function_result('public.get_recent_players_for_registration(bigint,int)'::regprocedure)
              ilike '%home_state text%'
           then 'PASS 2: recents returns fargo_status + home_city + home_state'
         else 'FAIL 2: recents return missing new columns'
       end as result;

-- 3) COHERENT SOURCE: fargo + fargo_status are selected via the SAME profile_id CASE,
--    and are NOT independently coalesced (no source mixing).
select case
         when pg_get_functiondef('public.search_players_for_registration(bigint,text,int)'::regprocedure)
              ilike '%case when pl.profile_id is not null then pr.fargo%else pl.fargo%'
          and pg_get_functiondef('public.search_players_for_registration(bigint,text,int)'::regprocedure)
              ilike '%case when pl.profile_id is not null then pr.fargo_status%else pl.fargo_status%'
          and pg_get_functiondef('public.search_players_for_registration(bigint,text,int)'::regprocedure)
              not ilike '%coalesce(pr.fargo%'
           then 'PASS 3: fargo + status share one CASE source (no coalesce mixing)'
         else 'FAIL 3: fargo/status not coherently sourced'
       end as result;

-- 4) location is profiles-only (pr.home_city / pr.home_state; NULL for pending).
select case
         when pg_get_functiondef('public.search_players_for_registration(bigint,text,int)'::regprocedure)
              ilike '%pr.home_city%'
          and pg_get_functiondef('public.search_players_for_registration(bigint,text,int)'::regprocedure)
              ilike '%pr.home_state%'
           then 'PASS 4: location sourced from profiles only'
         else 'FAIL 4: location source unexpected'
       end as result;

-- 5) Grants unchanged: authenticated may EXECUTE both; anon may not.
select case
         when has_function_privilege('authenticated','public.search_players_for_registration(bigint,text,int)','EXECUTE')
          and not has_function_privilege('anon','public.search_players_for_registration(bigint,text,int)','EXECUTE')
          and has_function_privilege('authenticated','public.get_recent_players_for_registration(bigint,int)','EXECUTE')
          and not has_function_privilege('anon','public.get_recent_players_for_registration(bigint,int)','EXECUTE')
           then 'PASS 5: authenticated=EXECUTE, anon=none (both)'
         else 'FAIL 5: grant mismatch'
       end as result;

-- 6) Both still SECURITY DEFINER + pinned search_path.
select string_agg(p.proname || '=' ||
         case when p.prosecdef then 'definer' else 'INVOKER!' end || '/' ||
         case when array_to_string(p.proconfig,';') like '%search_path%' then 'sp' else 'NOSP!' end, ' | ')
       as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('search_players_for_registration','get_recent_players_for_registration');
-- Expect both definer/sp.
