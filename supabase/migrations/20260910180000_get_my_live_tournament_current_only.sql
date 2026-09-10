-- Make get_my_live_tournament return ONLY genuinely CURRENT/RUNNING tournaments, matching the
-- client's shared isTournamentCurrent predicate (src/utils/tournament-view.ts). live_state is
-- the authoritative lifecycle phase (only 'in_progress' runs); DELETE (status='cancelled') and
-- ARCHIVE (archived_at set) are overlays that flag an event removed WITHOUT resetting
-- live_state, so both are excluded here in ONE place — no more per-status one-offs.
--
-- Supersedes 20260910170000 (which added only 'cancelled'): archiving leaves status='active'
-- and live_state='in_progress' while setting archived_at, so an archived LIVE tournament still
-- slipped through. This adds `archived_at is null` and keeps the full terminal-status exclusion.
-- Safe to apply whether or not 20260910170000 was applied (both are create-or-replace).
--
-- ROLLBACK: supabase/rollback/20260910180000_get_my_live_tournament_current_only_rollback.sql

create or replace function public.get_my_live_tournament()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select id_auto from public.profiles where id = auth.uid()
  ),
  parts as (
    select tp.tournament_id, tp.status as pstatus, tp.eliminated_at
    from public.tournament_players tp
    join me on tp.player_id = me.id_auto

    union all
    select tm.tournament_id, 'accepted'::text, null::timestamptz
    from public.tournament_team_members tm
    join me on tm.player_id = me.id_auto
    where tm.invite_status = 'accepted'

    union all
    select ce.tournament_id, ce.status, null::timestamptz
    from public.chip_entries ce
    join me on (ce.p1_profile_id = me.id_auto or ce.p2_profile_id = me.id_auto)
  ),
  live as (
    select
      t.id,
      max(p.eliminated_at)                     as eliminated_at,
      t.name, t.game_type, t.tournament_format, t.tournament_date,
      t.start_time, t.status, t.live_state, t.gameplay_started_at, t.thumbnail,
      t.venue_id
    from parts p
    join public.tournaments t on t.id = p.tournament_id
    where t.live_state = 'in_progress'                                        -- only running
      and coalesce(t.status, '') not in ('completed', 'archived', 'cancelled') -- not terminal/deleted
      and t.archived_at is null                                              -- not archived (overlay)
      and coalesce(lower(p.pstatus), '') not in ('cancelled', 'no_show', 'removed', 'withdrawn')
    group by
      t.id, t.name, t.game_type, t.tournament_format, t.tournament_date,
      t.start_time, t.status, t.live_state, t.gameplay_started_at, t.thumbnail, t.venue_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'status', 'registered',
        'eliminated_at', l.eliminated_at,
        'tournament', jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'game_type', l.game_type,
          'tournament_format', l.tournament_format,
          'tournament_date', l.tournament_date,
          'start_time', l.start_time,
          'status', l.status,
          'live_state', l.live_state,
          'gameplay_started_at', l.gameplay_started_at,
          'thumbnail', l.thumbnail,
          'venues', (
            select jsonb_build_object('venue', v.venue, 'city', v.city, 'state', v.state)
            from public.venues v where v.id = l.venue_id
          )
        )
      )
      order by l.gameplay_started_at desc nulls last
    ),
    '[]'::jsonb
  )
  from live l;
$$;

revoke all on function public.get_my_live_tournament() from public;
grant execute on function public.get_my_live_tournament() to authenticated;

-- VERIFICATION (run manually after applying): none of these should appear for the caller —
--   • status='cancelled'  + live_state='in_progress'
--   • archived_at set      + live_state='in_progress'  (status still 'active')
--   • status='completed'   / live_state='finished'
--   select public.get_my_live_tournament();
