-- supabase/migrations/20260709190000_team_td_actions.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- TD-side team actions:
--   • confirm_team_member_fargo — the team analog of approve_registration_with_
--     fargo (20260709120000): the director confirms a team member's Fargo, which
--     becomes that member's VERIFIED profile Fargo + a frozen per-event snapshot
--     on the member row.
--   • unlock_team — director/admin unlocks a locked team so the captain can swap
--     the partner again.
-- Both run SECURITY DEFINER and verify the caller is the tournament's director
-- (or an admin), since they write another user's profile / a locked team.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.confirm_team_member_fargo(
  p_member_id bigint,
  p_fargo     int
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid bigint; v_pid bigint; v_caller bigint; v_role text;
begin
  select m.tournament_id, m.player_id into v_tid, v_pid
  from public.tournament_team_members m where m.id = p_member_id;
  if v_tid is null then raise exception 'Team member not found'; end if;

  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid
      and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to confirm Fargo for this tournament';
  end if;

  -- Confirmed Fargo becomes the member's verified profile Fargo (accounts only).
  if v_pid is not null then
    update public.profiles
    set fargo = p_fargo,
        fargo_status = 'verified',
        fargo_last_verified_at = now(),
        fargo_verified_by = v_caller
    where id_auto = v_pid;
  end if;

  -- Freeze the per-event snapshot on the member row.
  update public.tournament_team_members
  set fargo_at_registration = p_fargo,
      suggested_fargo = p_fargo,
      updated_at = now()
  where id = p_member_id;
end; $$;

create or replace function public.unlock_team(p_team_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid bigint; v_caller bigint; v_role text;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;

  select id_auto, role into v_caller, v_role from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.tournaments t
    where t.id = v_tid
      and (t.director_id = v_caller or v_role in ('compete_admin', 'super_admin'))
  ) then
    raise exception 'Not authorized to unlock teams for this tournament';
  end if;

  update public.tournament_teams set locked = false, updated_at = now() where id = p_team_id;
end; $$;

revoke all on function public.confirm_team_member_fargo(bigint, int) from public, anon;
grant execute on function public.confirm_team_member_fargo(bigint, int) to authenticated;
revoke all on function public.unlock_team(bigint) from public, anon;
grant execute on function public.unlock_team(bigint) to authenticated;
