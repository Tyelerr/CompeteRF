-- supabase/migrations/20260709210000_team_roster_rpc.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- get_tournament_team_roster — the chip manager needs each team's members to
-- render doubles teams in the Players list, but tournament_team_members rows are
-- RLS-restricted (they hold invite contact info), so a direct embed returns an
-- empty members[] for the viewer and the team silently drops. This SECURITY
-- DEFINER function returns ONLY the safe roster fields (name / Fargo / ids /
-- status — never invite_value) to the tournament's director or an admin.
-- One row per non-declined member; the client groups by team_id.
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
declare v_caller bigint; v_role text;
begin
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();

  -- Only the tournament's director or an admin gets the full roster.
  if not exists (
    select 1 from public.tournaments t
    where t.id = p_tid
      and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    return;
  end if;

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

revoke all on function public.get_tournament_team_roster(bigint) from public, anon;
grant execute on function public.get_tournament_team_roster(bigint) to authenticated;
