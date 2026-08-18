-- 20260808120000_phase5_team_roster_pending_rollback.sql
-- Standalone DOWN for 20260808120000_phase5_team_roster_pending.sql.
-- Restores the exact pre-Phase-5 definition (20260713180000) — no player_uuid,
-- profiles-only member resolution. Safe: the app tolerates the missing column
-- (pending members simply revert to nameless). Wrap in a transaction.

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
