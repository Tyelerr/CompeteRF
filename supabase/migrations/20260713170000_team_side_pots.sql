-- supabase/migrations/20260713170000_team_side_pots.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Side pots for team (chip / scotch-doubles) tournaments, matching how single &
-- double elimination handle them. In elim, each player's pot membership lives on
-- tournament_players.paid_side_pots (a text[] of pot names). Teams aren't in
-- tournament_players, so the equivalent lives on the team:
--   • tournament_teams.paid_side_pots — the side-pot names this TEAM bought into.
--   • set_team_side_pots(team_id, names[]) — TD/admin sets a team's pots.
-- The roster RPC returns team_paid_side_pots so the chip manager + Prize Pool tab
-- can show entries and count each pot's pool (entrants × amount), exactly like
-- the elim flow (which counts tournament_players.paid_side_pots).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tournament_teams
  add column if not exists paid_side_pots text[] not null default '{}';

create or replace function public.set_team_side_pots(p_team_id bigint, p_pots text[])
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid bigint; v_caller bigint; v_role text;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to set side pots for this tournament';
  end if;
  update public.tournament_teams
    set paid_side_pots = coalesce(p_pots, '{}'), updated_at = now()
    where id = p_team_id;
end; $$;

revoke all on function public.set_team_side_pots(bigint, text[]) from public, anon;
grant execute on function public.set_team_side_pots(bigint, text[]) to authenticated;

-- Roster returns the team's side pots (RETURNS TABLE change → drop + recreate).
drop function if exists public.get_tournament_team_roster(bigint);

create function public.get_tournament_team_roster(p_tid bigint)
returns table (
  team_id             bigint,
  team_status         text,
  team_locked         boolean,
  team_approved       boolean,
  team_name           text,
  team_chip_override  int,
  team_paid_side_pots text[],
  team_size           int,
  member_id           bigint,
  role                text,
  invite_status       text,
  player_id           bigint,
  member_name         text,
  member_fargo        int,
  fargo_verified      boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    select
      tt.id, tt.status, tt.locked, tt.approved, tt.name, tt.chip_override,
      tt.paid_side_pots, tt.team_size,
      m.id, m.role, m.invite_status, m.player_id,
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
end; $$;

grant execute on function public.get_tournament_team_roster(bigint) to anon, authenticated;
