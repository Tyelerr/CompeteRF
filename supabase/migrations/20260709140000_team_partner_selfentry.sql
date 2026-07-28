-- supabase/migrations/20260709140000_team_partner_selfentry.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Partners self-report. The captain no longer types the partner's name/Fargo;
-- they only invite a contact. The invited PARTNER enters their own Fargo when
-- they accept (their name comes from their account). Non-account contacts become
-- a plain pending invite (they'll self-enter via an invite link in a later slice
-- — outbound delivery is not wired yet).
--
-- Changes vs 20260709130000_tournament_teams.sql:
--   • invite_team_partner drops p_temp_name / p_temp_fargo; a no-account contact
--     is now a PENDING invite (not a captain-authored temp partner).
--   • respond_to_team_invite gains p_fargo — the partner's own Fargo hint, stored
--     as suggested_fargo (the TD still confirms it, per the Fargo verification flow).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── invite_team_partner (captain provides only the contact) ───────────────────
drop function if exists public.invite_team_partner(bigint, text, text, text, int);

create function public.invite_team_partner(
  p_team_id bigint,
  p_method  text,
  p_value   text
) returns void
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

  -- one partner slot: clear any existing non-captain member first
  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, invite_method, invite_value, is_verified)
  values (p_team_id, v_tid, v_target, 'member', 'pending', p_method, p_value, false);

  perform public._recompute_team_status(p_team_id);
end; $$;

-- ── respond_to_team_invite (partner enters their own Fargo on accept) ──────────
drop function if exists public.respond_to_team_invite(bigint, boolean);

create function public.respond_to_team_invite(
  p_team_id bigint,
  p_accept  boolean,
  p_fargo   int
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caller bigint; v_tid bigint; v_mid bigint;
begin
  v_caller := public._team_caller();
  select id, tournament_id into v_mid, v_tid
  from public.tournament_team_members
  where team_id = p_team_id and player_id = v_caller and role = 'member';
  if v_mid is null then raise exception 'No invite found for you on this team'; end if;

  if p_accept then
    if exists (
      select 1 from public.tournament_team_members m
      where m.tournament_id = v_tid and m.player_id = v_caller
        and m.invite_status = 'accepted' and m.team_id <> p_team_id
    ) then
      raise exception 'You are already on another team for this tournament';
    end if;
    update public.tournament_team_members
      set invite_status = 'accepted', is_verified = true, suggested_fargo = p_fargo, updated_at = now()
      where id = v_mid;
    update public.tournament_teams set locked = true, updated_at = now() where id = p_team_id;
  else
    update public.tournament_team_members
      set invite_status = 'declined', updated_at = now()
      where id = v_mid;
  end if;

  perform public._recompute_team_status(p_team_id);
end; $$;

-- ── Grants ────────────────────────────────────────────────────────────────────
revoke all on function public.invite_team_partner(bigint, text, text) from public, anon;
grant execute on function public.invite_team_partner(bigint, text, text) to authenticated;
revoke all on function public.respond_to_team_invite(bigint, boolean, int) from public, anon;
grant execute on function public.respond_to_team_invite(bigint, boolean, int) to authenticated;
