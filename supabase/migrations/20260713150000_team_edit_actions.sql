-- supabase/migrations/20260713150000_team_edit_actions.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Edit Team actions for the TD:
--   • set_team_chips  — a manual chip-count override (null = auto from the chart).
--   • td_remove_team_member — remove a player from a team. Removing the partner
--     drops the team back to "needs a partner"; removing the captain removes the
--     whole team. Un-approves + unlocks so it can be reworked.
-- The roster RPC also returns the chip override so the card can show it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tournament_teams
  add column if not exists chip_override int;

create or replace function public.set_team_chips(p_team_id bigint, p_chips int)
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
    raise exception 'Not authorized to set chips for this tournament';
  end if;
  update public.tournament_teams set chip_override = p_chips, updated_at = now() where id = p_team_id;
end; $$;

create or replace function public.td_remove_team_member(p_member_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid bigint; v_team bigint; v_mrole text; v_caller bigint; v_role text;
begin
  select tournament_id, team_id, role into v_tid, v_team, v_mrole
  from public.tournament_team_members where id = p_member_id;
  if v_tid is null then raise exception 'Team member not found'; end if;
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to edit teams for this tournament';
  end if;

  delete from public.tournament_team_members where id = p_member_id;
  if v_mrole = 'captain' then
    delete from public.tournament_teams where id = v_team; -- captain gone → team gone
  else
    update public.tournament_teams set approved = false, locked = false, updated_at = now() where id = v_team;
    perform public._recompute_team_status(v_team);
  end if;
end; $$;

revoke all on function public.set_team_chips(bigint, int) from public, anon;
grant execute on function public.set_team_chips(bigint, int) to authenticated;
revoke all on function public.td_remove_team_member(bigint) from public, anon;
grant execute on function public.td_remove_team_member(bigint) to authenticated;

-- Roster returns the chip override (RETURNS TABLE change → drop + recreate).
drop function if exists public.get_tournament_team_roster(bigint);

create function public.get_tournament_team_roster(p_tid bigint)
returns table (
  team_id        bigint,
  team_status    text,
  team_locked    boolean,
  team_approved  boolean,
  team_name      text,
  team_chip_override int,
  team_size      int,
  member_id      bigint,
  role           text,
  invite_status  text,
  player_id      bigint,
  member_name    text,
  member_fargo   int,
  fargo_verified boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    select
      tt.id, tt.status, tt.locked, tt.approved, tt.name, tt.chip_override, tt.team_size,
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
