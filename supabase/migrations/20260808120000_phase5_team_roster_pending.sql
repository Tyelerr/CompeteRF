-- 20260808120000_phase5_team_roster_pending.sql
-- Phase 5 follow-up (Scotch Doubles): let get_tournament_team_roster resolve PENDING
-- team members. Today it joins members -> profiles via id_auto only, so a pending
-- member (player_uuid set, id_auto NULL) has no name. Add a LEFT JOIN to players by
-- player_uuid and fold the pending name into member_name; also return player_uuid.
--
-- Adding a column changes the return type, so this DROPs and re-creates the function
-- (same body otherwise). The function stays SECURITY DEFINER with a pinned search_path
-- and the SAME public grant it has today (the roster is a public/spectator read). Only
-- NAMES + Fargo are exposed for pending members — never email or phone (consistent with
-- how active player names are already public here).

drop function if exists public.get_tournament_team_roster(bigint);

create function public.get_tournament_team_roster(p_tid bigint)
returns table (
  team_id             bigint,
  team_status         text,
  team_locked         boolean,
  team_approved       boolean,
  team_checked_in     boolean,
  team_paid           boolean,
  team_name           text,
  team_chip_override  int,
  team_paid_side_pots text[],
  team_size           int,
  member_id           bigint,
  role                text,
  invite_status       text,
  player_id           bigint,
  player_uuid         uuid,          -- NEW: stable identity (pending or active member)
  member_name         text,
  member_fargo        int,
  fargo_verified      boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    select
      tt.id, tt.status, tt.locked, tt.approved, tt.checked_in, tt.paid, tt.name,
      tt.chip_override, tt.paid_side_pots, tt.team_size,
      m.id, m.role, m.invite_status, m.player_id,
      m.player_uuid,
      coalesce(
        -- active member (via profile)
        nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
        pr.name, pr.user_name,
        -- pending member (via players) — NEW
        nullif(trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')), ''),
        pl.display_name,
        m.temp_name
      ) as member_name,
      coalesce(m.fargo_at_registration, pr.fargo, m.suggested_fargo) as member_fargo,
      (m.fargo_at_registration is not null) as fargo_verified
    from public.tournament_teams tt
    join public.tournament_team_members m on m.team_id = tt.id
    left join public.profiles pr on pr.id_auto = m.player_id
    left join public.players  pl on pl.id      = m.player_uuid   -- NEW
    where tt.tournament_id = p_tid
      and m.invite_status <> 'declined';
end; $$;

grant execute on function public.get_tournament_team_roster(bigint) to anon, authenticated;

comment on function public.get_tournament_team_roster(bigint) is
  'Phase 5: team roster with PENDING members resolved via players(player_uuid). Returns player_uuid + a name/Fargo that falls back from profile -> players -> temp_name. Public read (names/Fargo only; no email/phone).';
