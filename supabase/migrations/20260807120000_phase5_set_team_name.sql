-- 20260807120000_phase5_set_team_name.sql
-- Phase 5 follow-up: let a tournament manager set/clear a team's display name from
-- the Team Review step of the unified Add Team flow. tournament_teams writes are
-- RPC-only (no client UPDATE policy), so this is the write path for the name.
-- ADDITIVE: one new function; no table/column/policy change.

create or replace function public.set_team_name(p_team_id bigint, p_name text)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare v_tid bigint;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  if not public.can_manage_tournament(v_tid) then
    raise exception 'Not authorized to edit this team';
  end if;
  update public.tournament_teams
     set name = nullif(btrim(coalesce(p_name, '')), ''), updated_at = now()
   where id = p_team_id;
end;
$$;

revoke all on function public.set_team_name(bigint, text) from public, anon;
grant execute on function public.set_team_name(bigint, text) to authenticated;

comment on function public.set_team_name(bigint, text) is
  'Phase 5: manager-gated setter for tournament_teams.name (blank -> NULL). The write path for the Team Review name field.';
