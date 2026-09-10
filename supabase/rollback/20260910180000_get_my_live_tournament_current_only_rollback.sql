-- Rollback for 20260910180000_get_my_live_tournament_current_only.sql
-- Restores the 20260910170000 version (excludes completed/archived/cancelled by status, but
-- does NOT check archived_at). Reverting re-exposes the archived-LIVE-shows-as-current bug on
-- the RPC path; the client-side isTournamentCurrent predicate still guards it.

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
    where t.live_state = 'in_progress'
      and coalesce(t.status, '') not in ('completed', 'archived', 'cancelled')
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
