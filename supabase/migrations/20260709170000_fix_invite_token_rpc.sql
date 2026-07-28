-- supabase/migrations/20260709170000_fix_invite_token_rpc.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: get_team_invite_by_token failed with "column reference tournament_id is
-- ambiguous" — the RETURNS TABLE out-params share names with the queried columns,
-- so the first SELECT's bare `tournament_id`/`status` were ambiguous. Qualify the
-- source columns with a table alias. (create or replace keeps the same signature.)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_team_invite_by_token(p_token text)
returns table (
  team_id         bigint,
  tournament_id   bigint,
  tournament_name text,
  captain_name    text,
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
begin
  select tt.id, tt.tournament_id, tt.status, tt.captain_id
    into v_team_id, v_tid, v_status, v_captain
  from public.tournament_teams tt
  where tt.invite_token = p_token;

  if not found then
    return query select null::bigint, null::bigint, null::text, null::text, null::text,
                        false, 'This invite link is invalid.'::text;
    return;
  end if;

  select t.name, t.status, t.live_state
    into v_tname, v_tstatus, v_tlive
  from public.tournaments t where t.id = v_tid;

  select coalesce(nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.name, pr.user_name)
    into v_cname
  from public.profiles pr where pr.id_auto = v_captain;

  team_id         := v_team_id;
  tournament_id   := v_tid;
  tournament_name := coalesce(v_tname, 'this tournament');
  captain_name    := coalesce(v_cname, 'A player');
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
