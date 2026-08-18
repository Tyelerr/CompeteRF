-- 20260817130000_set_team_fargo_override.sql
-- TD-only write path for a doubles TEAM's Fargo-cap override (tournament_teams columns
-- added in 20260817120000). Mirrors set_team_paid / set_team_checked_in: SECURITY
-- DEFINER, manager-gated, sets overridden_by = auth.uid() + overridden_at = now() itself.
-- p_override=false clears the whole override snapshot.

create or replace function public.set_team_fargo_override(
  p_team_id  bigint,
  p_override boolean,
  p_cap      integer,
  p_rating   integer,
  p_reason   text,
  p_notes    text
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

  if p_override then
    update public.tournament_teams set
      fargo_cap_override       = true,
      fargo_cap_at_override    = p_cap,
      player_fargo_at_override = p_rating,
      fargo_cap_override_reason= p_reason,
      fargo_cap_override_notes = p_notes,
      overridden_by            = auth.uid(),
      overridden_at            = now(),
      updated_at               = now()
    where id = p_team_id;
  else
    update public.tournament_teams set
      fargo_cap_override       = false,
      fargo_cap_at_override    = null,
      player_fargo_at_override = null,
      fargo_cap_override_reason= null,
      fargo_cap_override_notes = null,
      overridden_by            = null,
      overridden_at            = null,
      updated_at               = now()
    where id = p_team_id;
  end if;
end; $$;

revoke all on function public.set_team_fargo_override(bigint, boolean, integer, integer, text, text) from public, anon;
grant execute on function public.set_team_fargo_override(bigint, boolean, integer, integer, text, text) to authenticated;
