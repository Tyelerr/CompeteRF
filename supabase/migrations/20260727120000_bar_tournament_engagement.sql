-- Batched engagement counts for the Bar Owner Tournament Manager.
--
-- The manager previously ran an N+1: for EACH tournament it fired a separate
-- "views" count query (tournament_analytics) and a "favorites" count query.
-- With many tournaments that is a lot of round-trips and DB work on every load.
--
-- This function returns both counts for a whole set of tournament ids in ONE
-- call. It is READ-ONLY and purely additive — applying it changes no data and
-- breaks nothing. The app tries this function and automatically falls back to
-- the old per-tournament counts if it is absent, so applying it is optional but
-- makes the Tournament Manager's first load much faster and lighter on the DB.

create or replace function public.bar_tournament_engagement(p_tournament_ids bigint[])
returns table (tournament_id bigint, views_count bigint, favorites_count bigint)
language sql
stable
as $$
  select
    t.id as tournament_id,
    coalesce(v.cnt, 0) as views_count,
    coalesce(f.cnt, 0) as favorites_count
  from unnest(p_tournament_ids) as t(id)
  left join (
    select a.tournament_id, count(*) as cnt
    from public.tournament_analytics a
    where a.event_type = 'view'
      and a.tournament_id = any(p_tournament_ids)
    group by a.tournament_id
  ) v on v.tournament_id = t.id
  left join (
    select fa.tournament_id, count(*) as cnt
    from public.favorites fa
    where fa.tournament_id = any(p_tournament_ids)
    group by fa.tournament_id
  ) f on f.tournament_id = t.id;
$$;

grant execute on function public.bar_tournament_engagement(bigint[]) to authenticated;
