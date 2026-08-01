-- phase5_search_id_auto_verification.sql
-- Read-only checks that 20260813120000_phase5_search_id_auto.sql landed correctly.
-- Safe to run in the SQL editor: it only inspects the catalog (no data writes).
-- Expected results are noted inline; each SELECT should return the "PASS ..." text.

-- 1) search_players_for_registration RETURN TYPE now includes id_auto (bigint).
select case
         when pg_get_function_result(p.oid) ilike '%id_auto bigint%'
           then 'PASS 1: search returns id_auto bigint'
         else 'FAIL 1: search missing id_auto -> ' || pg_get_function_result(p.oid)
       end as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'search_players_for_registration';

-- 2) get_recent_players_for_registration RETURN TYPE now includes id_auto (bigint).
select case
         when pg_get_function_result(p.oid) ilike '%id_auto bigint%'
           then 'PASS 2: recents returns id_auto bigint'
         else 'FAIL 2: recents missing id_auto -> ' || pg_get_function_result(p.oid)
       end as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_recent_players_for_registration';

-- 3) Grants: authenticated may EXECUTE both; anon may NOT.
select case
         when has_function_privilege('authenticated',
                'public.search_players_for_registration(bigint, text, int)', 'EXECUTE')
          and has_function_privilege('authenticated',
                'public.get_recent_players_for_registration(bigint, int)', 'EXECUTE')
          and not has_function_privilege('anon',
                'public.search_players_for_registration(bigint, text, int)', 'EXECUTE')
          and not has_function_privilege('anon',
                'public.get_recent_players_for_registration(bigint, int)', 'EXECUTE')
           then 'PASS 3: authenticated=EXECUTE, anon=none (both fns)'
         else 'FAIL 3: grant mismatch'
       end as result;

-- 4) Both are still SECURITY DEFINER with a pinned search_path.
select string_agg(
         p.proname || ': ' ||
         case when p.prosecdef then 'definer' else 'INVOKER!' end || ', ' ||
         coalesce(array_to_string(p.proconfig, ';'), 'NO search_path!'),
         ' | '
       ) as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('search_players_for_registration', 'get_recent_players_for_registration');
-- Expect: both "definer" and "search_path=public, pg_temp".

-- 5) The verified lifecycle RPCs were NOT touched (still present, definer).
select case when count(*) = 4
         then 'PASS 5: lifecycle RPCs intact (create/update/get/claim)'
         else 'FAIL 5: expected 4 lifecycle RPCs, found ' || count(*)
       end as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_pending_player', 'update_pending_player',
    'get_pending_player', 'claim_pending_player'
  );
