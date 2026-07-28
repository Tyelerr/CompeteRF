-- supabase/migrations/20260713120000_team_roster_open.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- get_tournament_team_roster returned rows ONLY to the tournament's director /
-- admin, so when the chip manager was opened as any other account (a super_admin
-- who isn't the director, a co-manager, etc.) the roster came back empty and the
-- registered teams silently disappeared from the Players list. The function only
-- exposes safe fields (names / Fargo / ids / status — never invite contact info,
-- and tournament_teams is already public-read), so drop the director/admin gate
-- and let any signed-in user read the roster.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_tournament_team_roster(p_tid bigint)
returns table (
  team_id        bigint,
  team_status    text,
  team_locked    boolean,
  team_size      int,
  member_id      bigint,
  role           text,
  invite_status  text,
  player_id      bigint,
  member_name    text,
  member_fargo   int,
  fargo_verified boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    select
      tt.id,
      tt.status,
      tt.locked,
      tt.team_size,
      m.id,
      m.role,
      m.invite_status,
      m.player_id,
      coalesce(
        nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
        pr.name, pr.user_name, m.temp_name
      ) as member_name,
      coalesce(m.fargo_at_registration, pr.fargo, m.suggested_fargo) as member_fargo,
      (m.fargo_at_registration is not null) as fargo_verified
    from public.tournament_teams tt
    join public.tournament_team_members m on m.team_id = tt.id
    left join public.profiles pr on pr.id_auto = m.player_id
    where tt.tournament_id = p_tid
      and m.invite_status <> 'declined';
end;
$$;

grant execute on function public.get_tournament_team_roster(bigint) to anon, authenticated;
