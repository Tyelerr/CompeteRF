-- supabase/migrations/20260709150000_team_invite_returns_target.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- invite_team_partner now RETURNS the invited account's id_auto (or null for a
-- non-account contact) so the client can send that specific player a push +
-- inbox notification. Email lookups can only be resolved server-side, so the
-- client relies on this return value rather than resolving the target itself.
-- Body is otherwise identical to 20260709140000_team_partner_selfentry.sql.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.invite_team_partner(bigint, text, text);

create function public.invite_team_partner(
  p_team_id bigint,
  p_method  text,
  p_value   text
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caller bigint; v_tid bigint; v_captain bigint; v_locked boolean; v_target bigint;
begin
  v_caller := public._team_caller();
  select tournament_id, captain_id, locked into v_tid, v_captain, v_locked
  from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can invite a partner'; end if;
  if v_locked then raise exception 'This team is locked — ask the director to unlock it to change the partner'; end if;

  if p_method = 'username' then
    select id_auto into v_target from public.profiles where lower(user_name) = lower(p_value);
  elsif p_method = 'email' then
    select id_auto into v_target from public.profiles where lower(email) = lower(p_value);
  else
    v_target := null; -- phone / other → non-account pending invite
  end if;

  if v_target is not null then
    if v_target = v_caller then raise exception 'You cannot invite yourself'; end if;
    if exists (
      select 1 from public.tournament_team_members m
      where m.tournament_id = v_tid and m.player_id = v_target and m.invite_status <> 'declined'
    ) then
      raise exception 'That player is already on a team for this tournament';
    end if;
  end if;

  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, invite_method, invite_value, is_verified)
  values (p_team_id, v_tid, v_target, 'member', 'pending', p_method, p_value, false);

  perform public._recompute_team_status(p_team_id);

  return v_target;
end; $$;

revoke all on function public.invite_team_partner(bigint, text, text) from public, anon;
grant execute on function public.invite_team_partner(bigint, text, text) to authenticated;
