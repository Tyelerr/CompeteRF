-- 20260804120000_phase4c_rollback.sql  — STANDALONE ROLLBACK for Phase 4C.
-- NOT a migration. This file lives OUTSIDE supabase/migrations/ so `supabase db push`
-- never runs it. Supabase does NOT execute paired down-migrations; to roll back you
-- MUST run this deliberately (SQL Editor / psql), OR copy it into a NEW forward
-- migration named e.g. 20260805120000_phase4c_rollback.sql and push that.
--
-- It restores the EXACT pre-4C definitions (accept-either OR-branches removed):
-- the 3 tournament_players policies, ttm_read, submit_match_state, and the 6 team RPCs.
-- Safe at any time — the legacy id_auto branch was never removed, columns stay populated.

-- ── tournament_players policies (original: competitor branch = id_auto only) ──
alter policy "Player self-register or TD adds players" on public.tournament_players
with check (((player_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM public.tournaments t WHERE ((t.id = tournament_players.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));

alter policy "Player updates own or TD updates any" on public.tournament_players
using (((player_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM public.tournaments t WHERE ((t.id = tournament_players.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));

alter policy "Player deletes own or TD deletes any" on public.tournament_players
using (((player_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM public.tournaments t WHERE ((t.id = tournament_players.tournament_id) AND (t.director_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'compete_admin'::text])))))));

-- ── ttm_read (original) ──
alter policy ttm_read on public.tournament_team_members
using (((player_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM public.tournament_teams t WHERE ((t.id = tournament_team_members.team_id) AND (t.captain_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1 FROM public.tournaments tt WHERE ((tt.id = tournament_team_members.tournament_id) AND ((tt.director_id = ( SELECT profiles.id_auto FROM public.profiles WHERE (profiles.id = auth.uid()))) OR (( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = ANY (ARRAY['compete_admin'::text, 'super_admin'::text]))))))));

-- ── submit_match_state (original) ──
create or replace function public.submit_match_state(p_tournament_id bigint, p_match_id text, p_patch jsonb) returns jsonb
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_uid      bigint;
  v_is_td    boolean;
  v_allowed  boolean;
  v_ls       jsonb;
  v_existing jsonb;
  v_clean    jsonb;
begin
  select p.id_auto into v_uid
  from public.profiles p
  where p.id = auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id and t.director_id = v_uid
  )
  into v_is_td;

  select
    v_is_td
    or exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = p_tournament_id
        and tp.player_id = v_uid
        and tp.status not in ('cancelled', 'no_show')
    )
  into v_allowed;

  if not v_allowed then
    raise exception 'Not allowed to score this tournament' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_clean
  from jsonb_each(p_patch)
  where key in (
    'status', 'winner', 'p1Score', 'p2Score', 'startedAt', 'completedAt', 'result'
  );

  select coalesce(t.live_settings, '{}'::jsonb)
  into v_ls
  from public.tournaments t
  where t.id = p_tournament_id
  for update;

  if v_ls is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  v_ls := jsonb_set(v_ls, '{matchState}', coalesce(v_ls -> 'matchState', '{}'::jsonb), true);
  v_existing := coalesce(v_ls #> array['matchState', p_match_id], '{}'::jsonb);

  if not v_is_td and (v_existing ->> 'status') = 'completed' then
    raise exception 'Match is final and locked' using errcode = '42501';
  end if;

  v_ls := jsonb_set(v_ls, array['matchState', p_match_id], v_existing || v_clean, true);

  update public.tournaments
  set live_settings = v_ls,
      updated_at = now()
  where id = p_tournament_id;

  return v_ls;
end;
$$;

-- ── team RPCs (originals) ──
create or replace function public.create_team(p_tournament_id bigint, p_captain_fargo integer) returns bigint
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare v_caller bigint; v_team bigint;
begin
  v_caller := public._team_caller();
  if v_caller is null then raise exception 'You must be signed in to register a team'; end if;

  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = p_tournament_id
      and m.player_id = v_caller
      and m.invite_status <> 'declined'
  ) then
    raise exception 'You are already on a team for this tournament';
  end if;

  insert into public.tournament_teams (tournament_id, captain_id, status)
  values (p_tournament_id, v_caller, 'pending_partner')
  returning id into v_team;

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (v_team, p_tournament_id, v_caller, 'captain', 'accepted', true, p_captain_fargo);

  return v_team;
end; $$;

create or replace function public.cancel_team(p_team_id bigint) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare v_caller bigint; v_captain bigint;
begin
  v_caller := public._team_caller();
  select captain_id into v_captain from public.tournament_teams where id = p_team_id;
  if v_captain is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can cancel the team'; end if;
  delete from public.tournament_teams where id = p_team_id;
end; $$;

create or replace function public.cancel_team_partner(p_team_id bigint) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare v_caller bigint; v_captain bigint; v_locked boolean;
begin
  v_caller := public._team_caller();
  select captain_id, locked into v_captain, v_locked from public.tournament_teams where id = p_team_id;
  if v_captain is null then raise exception 'Team not found'; end if;
  if v_captain <> v_caller then raise exception 'Only the captain can change the partner'; end if;
  if v_locked then raise exception 'This team is locked — ask the director to unlock it'; end if;
  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';
  perform public._recompute_team_status(p_team_id);
end; $$;

create or replace function public.invite_team_partner(p_team_id bigint, p_method text, p_value text) returns bigint
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
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

create or replace function public.respond_to_team_invite(p_team_id bigint, p_accept boolean, p_fargo integer) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
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

create or replace function public.join_team_by_token(p_token text, p_fargo integer) returns bigint
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
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

  delete from public.tournament_team_members where team_id = v_team_id and role <> 'captain';
  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, role, invite_status, is_verified, suggested_fargo)
  values (v_team_id, v_tid, v_caller, 'member', 'accepted', true, p_fargo);

  update public.tournament_teams set locked = true, updated_at = now() where id = v_team_id;
  perform public._recompute_team_status(v_team_id);

  return v_team_id;
end;
$$;
