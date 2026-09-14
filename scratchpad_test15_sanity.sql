-- TEST 15 — Chip tournament DATABASE SANITY CHECKS (READ-ONLY)
-- Run in the Supabase SQL editor. None of these mutate data.
-- Expected results are noted inline. Do NOT run cleanup SQL without reviewing output first.

-- 1. Duplicate tournament_players participation rows.
--    Honors the two partial unique indexes: (tournament_id, player_id) and (tournament_id, player_uuid).
--    EXPECT: 0 rows.
select 'dup_by_player_id' as check, tournament_id, player_id, count(*) as n
  from public.tournament_players
 where player_id is not null
 group by tournament_id, player_id
having count(*) > 1
union all
select 'dup_by_player_uuid', tournament_id, null, count(*)
  from public.tournament_players
 where player_uuid is not null
 group by tournament_id, player_uuid
having count(*) > 1;

-- 2. Duplicate queue IDs within a tournament's chip queue.
--    chip_entries is the engine row set; each entry should appear once in a tournament.
--    EXPECT: 0 rows.
select tournament_id, id as entry_id, count(*) as n
  from public.chip_entries
 group by tournament_id, id
having count(*) > 1;

-- 2b. Same entry appearing twice inside a single chip_config queue array (defensive).
--     EXPECT: 0 rows. (Adjust the jsonb path if your queue key differs.)
select cc.tournament_id, q.entry_id, count(*) as n
  from public.chip_config cc
  cross join lateral jsonb_array_elements_text(coalesce(cc.config->'queue', '[]'::jsonb)) as q(entry_id)
 group by cc.tournament_id, q.entry_id
having count(*) > 1;

-- 3. Completed chip tournaments missing chip_results.
--    EXPECT: 0 rows (every completed chip tournament must have durable results).
select t.id, t.name, t.status
  from public.tournaments t
 where t.format = 'chip'                  -- adjust if your chip discriminator column/value differs
   and t.status = 'completed'
   and not exists (
       select 1 from public.chip_results r where r.tournament_id = t.id
   );

-- 4. Backfill log count.  EXPECT: 27.
select count(*) as backfill_log_count
  from public.chip_participant_backfill_log;

-- 5. Still-eligible historical singles not yet backfilled.  EXPECT: 0.
--    (Re-run the dry-run "eligible" query from 20260910140000_chip_participant_backfill.sql;
--     it should now return 0 since backfilled=27 / still_eligible=0 was confirmed.)
--    Quick proxy: completed chip singles whose reliable-identity entrants have no tournament_players row.
--    Use the canonical eligible query from the migration comment block for the authoritative count.

-- 6. Confirm no TEAM chip tournaments received singles backfill rows.
--    EXPECT: 0 rows. (Any tournament_players row logged by the backfill whose tournament is a team/doubles format.)
select tp.tournament_id, t.team_type, count(*) as backfilled_rows
  from public.chip_participant_backfill_log b
  join public.tournament_players tp on tp.id = b.tournament_player_id   -- adjust FK column name if different
  join public.tournaments t on t.id = tp.tournament_id
 where coalesce(t.is_team, false) = true     -- adjust to your team discriminator
    or t.team_type is not null
 group by tp.tournament_id, t.team_type;

-- 7. fargo_at_registration sanity on backfilled rows: values present and in a reasonable range or null.
--    EXPECT: no absurd values (e.g. negative, or > 900 unless legitimately possible).
select min(fargo_at_registration) as min_f,
       max(fargo_at_registration) as max_f,
       count(*) filter (where fargo_at_registration is null) as null_count,
       count(*) as total
  from public.tournament_players tp
  join public.chip_participant_backfill_log b on b.tournament_player_id = tp.id;  -- adjust FK column

-- 8. payoutsPaid must no longer live in the public live_settings blob after G5.  EXPECT: 0.
select count(*) as tournaments_with_public_payoutsPaid
  from public.tournaments
 where live_settings ? 'payoutsPaid';
