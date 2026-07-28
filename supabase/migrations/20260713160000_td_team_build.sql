-- supabase/migrations/20260713160000_td_team_build.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Let the TD build teams from the chip Players screen with REAL, verifiable
-- members (so "Add Player / Select Partner" creates a tournament_team_members
-- row that can be verified + persists, instead of a local-only edit that showed
-- "No Fargo"). Members are added accepted + unverified with a suggested Fargo;
-- the TD then taps Verify to confirm it.
--   • td_create_team  — new team with the chosen player as captain.
--   • td_add_team_member — add/replace the partner on an existing team.
-- Both enforce one-team-per-tournament for the added player.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.td_create_team(
  p_tournament_id bigint,
  p_captain_player_id bigint,
  p_fargo int
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caller bigint; v_role text; v_team bigint;
begin
  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to add teams for this tournament';
  end if;
  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = p_tournament_id and m.player_id = p_captain_player_id and m.invite_status <> 'declined'
  ) then
    raise exception 'That player is already on a team for this tournament';
  end if;

  insert into public.tournament_teams (tournament_id, captain_id, status)
  values (p_tournament_id, p_captain_player_id, 'pending_partner')
  returning id into v_team;

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (v_team, p_tournament_id, p_captain_player_id, 'captain', 'accepted', false, p_fargo);

  return v_team;
end; $$;

create or replace function public.td_add_team_member(
  p_team_id bigint,
  p_player_id bigint,
  p_fargo int
) returns void
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
    raise exception 'Not authorized to edit teams for this tournament';
  end if;
  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = v_tid and m.player_id = p_player_id and m.invite_status <> 'declined'
  ) then
    raise exception 'That player is already on a team for this tournament';
  end if;

  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';
  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (p_team_id, v_tid, p_player_id, 'member', 'accepted', false, p_fargo);

  update public.tournament_teams set approved = false, locked = true, updated_at = now() where id = p_team_id;
  perform public._recompute_team_status(p_team_id);
end; $$;

revoke all on function public.td_create_team(bigint, bigint, int) from public, anon;
grant execute on function public.td_create_team(bigint, bigint, int) to authenticated;
revoke all on function public.td_add_team_member(bigint, bigint, int) from public, anon;
grant execute on function public.td_add_team_member(bigint, bigint, int) to authenticated;
