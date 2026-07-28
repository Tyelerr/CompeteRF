-- supabase/migrations/20260713130000_team_approved.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- A team's "Approved" state is now distinct from Fargo verification: the TD
-- verifies each player's Fargo, THEN taps "Approve Team" (enabled only once both
-- are verified). Adds tournament_teams.approved + a setter, and the roster RPC
-- returns it so the chip Players cards can drive the workflow.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tournament_teams
  add column if not exists approved boolean not null default false;

create or replace function public.set_team_approved(p_team_id bigint, p_approved boolean)
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
    raise exception 'Not authorized to approve teams for this tournament';
  end if;
  update public.tournament_teams set approved = p_approved, updated_at = now() where id = p_team_id;
end; $$;

revoke all on function public.set_team_approved(bigint, boolean) from public, anon;
grant execute on function public.set_team_approved(bigint, boolean) to authenticated;

-- Roster now also returns team_approved (RETURNS TABLE change → drop + recreate).
drop function if exists public.get_tournament_team_roster(bigint);

create function public.get_tournament_team_roster(p_tid bigint)
returns table (
  team_id        bigint,
  team_status    text,
  team_locked    boolean,
  team_approved  boolean,
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
      tt.id, tt.status, tt.locked, tt.approved, tt.team_size,
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
