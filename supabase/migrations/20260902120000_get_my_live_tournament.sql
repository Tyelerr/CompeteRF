-- supabase/migrations/20260902120000_get_my_live_tournament.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE scalable, current-user-scoped lookup for the Profile → Tournament View
-- switch: "Is the authenticated user participating in a tournament whose
-- live_state = 'in_progress'?"
--
-- Identity is resolved SERVER-SIDE from auth.uid() → profiles.id_auto; the client
-- never passes a user id, so it can't inspect anyone else's live tournaments.
--
-- Coverage (every roster path that can represent a REAL user):
--   • tournament_players.player_id            (elimination + self-reg chip singles)
--   • tournament_team_members.player_id       (scotch-doubles / team, accepted only)
--   • chip_entries.p1_profile_id              (TD-added chip player 1)
--   • chip_entries.p2_profile_id              (TD-added chip doubles partner)
--
-- SECURITY DEFINER lets this read chip_entries (director-scoped RLS) WITHOUT
-- loosening that RLS globally — the function only ever exposes the caller's own
-- participation, filtered by their id_auto. `set search_path = public` hardens it.
--
-- Scale: each roster branch filters by the caller's indexed id (see indexes
-- below), then joins only those tournament rows and keeps live_state='in_progress'.
-- It never scans all tournaments or all participants; cost is bounded by how many
-- events ONE user has joined, regardless of platform size.
--
-- Returns a JSONB array (0..N) shaped like the client's PlayerTournament, deduped
-- by tournament id and ordered most-recently-STARTED first (deterministic primary
-- = element 0). Excludes non-active participants (cancelled/no_show/removed/
-- withdrawn) and completed/archived events. NOTE: eliminated players are NOT
-- excluded — an eliminated entrant still sees the live Tournament View (with the
-- existing "eliminated but event still live" note).
-- ─────────────────────────────────────────────────────────────────────────────

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
      and coalesce(t.status, '') not in ('completed', 'archived')
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

-- Only signed-in users; anon callers get [] anyway (auth.uid() is null → no rows).
revoke all on function public.get_my_live_tournament() from public;
grant execute on function public.get_my_live_tournament() to authenticated;

-- ── Indexes that materially serve the per-user branches above ──────────────────
-- tournament_team_members.player_id is already indexed (tt_members_player), so it
-- is intentionally not re-created here.
--
-- tournament_players predates the tracked migrations, so an index may already lead
-- with player_id under a different name. Create ours ONLY if no existing index
-- already leads with player_id — avoids a redundant duplicate index.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
    where n.nspname = 'public'
      and c.relname = 'tournament_players'
      and a.attname = 'player_id'
  ) then
    create index tournament_players_player_id_idx
      on public.tournament_players (player_id);
  end if;
end $$;

-- p1_profile_id / p2_profile_id were added (20260707120000) with no index, so a
-- plain guarded create is sufficient (partial: only rows linked to a real user).
create index if not exists chip_entries_p1_profile_idx
  on public.chip_entries (p1_profile_id) where p1_profile_id is not null;
create index if not exists chip_entries_p2_profile_idx
  on public.chip_entries (p2_profile_id) where p2_profile_id is not null;
