-- supabase/migrations/20260709200000_invite_captain_fargo.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- get_team_invite_by_token also returns the captain's Fargo so the join prompt
-- can show WHO you're teaming up with and their rating. Fargo prefers the TD-
-- confirmed snapshot, then the captain's verified profile Fargo, then their
-- self-reported hint. (RETURNS TABLE columns change → drop + recreate.)
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.get_team_invite_by_token(text);

create function public.get_team_invite_by_token(p_token text)
returns table (
  team_id         bigint,
  tournament_id   bigint,
  tournament_name text,
  captain_name    text,
  captain_fargo   int,
  team_status     text,
  is_valid        boolean,
  reason          text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id  bigint;
  v_tid      bigint;
  v_status   text;
  v_captain  bigint;
  v_tname    text;
  v_tstatus  text;
  v_tlive    text;
  v_cname    text;
  v_cfargo   int;
begin
  select tt.id, tt.tournament_id, tt.status, tt.captain_id
    into v_team_id, v_tid, v_status, v_captain
  from public.tournament_teams tt
  where tt.invite_token = p_token;

  if not found then
    return query select null::bigint, null::bigint, null::text, null::text, null::int, null::text,
                        false, 'This invite link is invalid.'::text;
    return;
  end if;

  select t.name, t.status, t.live_state
    into v_tname, v_tstatus, v_tlive
  from public.tournaments t where t.id = v_tid;

  select coalesce(nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.name, pr.user_name)
    into v_cname
  from public.profiles pr where pr.id_auto = v_captain;

  select coalesce(cm.fargo_at_registration, pr.fargo, cm.suggested_fargo)
    into v_cfargo
  from public.tournament_team_members cm
  left join public.profiles pr on pr.id_auto = cm.player_id
  where cm.team_id = v_team_id and cm.role = 'captain'
  limit 1;

  team_id         := v_team_id;
  tournament_id   := v_tid;
  tournament_name := coalesce(v_tname, 'this tournament');
  captain_name    := coalesce(v_cname, 'A player');
  captain_fargo   := v_cfargo;
  team_status     := v_status;

  if v_tname is null then
    is_valid := false; reason := 'This tournament could not be found.';
  elsif v_tstatus = 'completed' or v_tlive = 'finished' then
    is_valid := false; reason := 'This tournament has ended.';
  elsif v_status = 'registered' then
    is_valid := false; reason := 'This team is already full.';
  else
    is_valid := true; reason := null::text;
  end if;

  return next;
end;
$$;

revoke all on function public.get_team_invite_by_token(text) from public;
grant execute on function public.get_team_invite_by_token(text) to anon, authenticated;
