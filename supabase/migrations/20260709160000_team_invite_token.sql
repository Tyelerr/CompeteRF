-- supabase/migrations/20260709160000_team_invite_token.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Secure invite tokens for shareable HTTPS invite links
-- (https://thecompeteapp.com/join/<tid>?invite=<token>). Each team gets an
-- unguessable token so a link can be validated server-side and grants access to
-- a SPECIFIC team invitation — not just "any team in this tournament".
--
-- get_team_invite_by_token is callable by anon so the public web landing page
-- can show the tournament/captain and a friendly message when the invite is
-- invalid / ended / already full — without exposing the teams tables.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tournament_teams
  add column if not exists invite_token text not null default gen_random_uuid()::text;

create unique index if not exists tournament_teams_invite_token_key
  on public.tournament_teams(invite_token);

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
  select id, tournament_id, status, captain_id
    into v_team_id, v_tid, v_status, v_captain
  from public.tournament_teams
  where invite_token = p_token;

  if not found then
    return query select null::bigint, null::bigint, null::text, null::text, null::text,
                        false, 'This invite link is invalid.'::text;
    return;
  end if;

  select name, status, live_state into v_tname, v_tstatus, v_tlive
  from public.tournaments where id = v_tid;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), name, user_name)
    into v_cname
  from public.profiles where id_auto = v_captain;

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

revoke all on function public.get_team_invite_by_token(text) from public;
grant execute on function public.get_team_invite_by_token(text) to anon, authenticated;
