-- supabase/migrations/20260709180000_join_team_by_token.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Link-based team joining. Invites are now shared as a link (Messages / share
-- sheet) rather than typed by contact, so the person who OPENS the link claims
-- the open partner slot. join_team_by_token validates the secure token and the
-- usual rules server-side (signed in, not the captain, team open + not full, and
-- not already on another team for this tournament), then fills the slot with the
-- caller and their own Fargo and locks the team.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.join_team_by_token(
  p_token text,
  p_fargo int
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  bigint;
  v_team_id bigint;
  v_tid     bigint;
  v_status  text;
  v_locked  boolean;
  v_captain bigint;
  v_size    int;
begin
  v_caller := public._team_caller();
  if v_caller is null then
    raise exception 'You must be signed in to join a team.';
  end if;

  select id, tournament_id, status, locked, captain_id, team_size
    into v_team_id, v_tid, v_status, v_locked, v_captain, v_size
  from public.tournament_teams
  where invite_token = p_token;

  if v_team_id is null then
    raise exception 'This invite link is invalid.';
  end if;
  if v_captain = v_caller then
    raise exception 'You are the captain of this team.';
  end if;
  if v_locked or v_status = 'registered' then
    raise exception 'This team is already full.';
  end if;
  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = v_tid and m.player_id = v_caller and m.invite_status <> 'declined'
  ) then
    raise exception 'You are already on a team for this tournament.';
  end if;
  if (
    select count(*) from public.tournament_team_members m
    where m.team_id = v_team_id and m.invite_status = 'accepted'
  ) >= v_size then
    raise exception 'This team is already full.';
  end if;

  -- Fill the open slot with the joining player (replaces any stale pending slot).
  delete from public.tournament_team_members where team_id = v_team_id and role <> 'captain';
  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (v_team_id, v_tid, v_caller, 'member', 'accepted', true, p_fargo);

  update public.tournament_teams set locked = true, updated_at = now() where id = v_team_id;
  perform public._recompute_team_status(v_team_id);

  return v_team_id;
end;
$$;

revoke all on function public.join_team_by_token(text, int) from public, anon;
grant execute on function public.join_team_by_token(text, int) to authenticated;
