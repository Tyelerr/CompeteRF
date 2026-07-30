-- 20260806120000_phase5_roster_read.sql
-- Phase 5 follow-up: roster name resolution for PENDING registrations.
-- See PHASE5_REVIEW.md §7.
--
-- WHY: `players` is intentionally RLS-locked (no client policies), so a PostgREST
-- embed of a pending player's name in the roster returns NULL. Active players still
-- resolve via the existing `profiles:player_id` embed, but a PENDING registration
-- (player_id/id_auto NULL, only player_uuid set) would render nameless. This adds a
-- single SECURITY DEFINER, tournament-manager-gated RPC that returns display info
-- (NAME/status/avatar/fargo — NO email, NO phone) for every uuid-registered player
-- in a tournament. Screens call it once per tournament and map results by player_uuid.
--
-- ADDITIVE: no table/column/policy change; one new function.

create or replace function public.get_registration_players_display(
  p_tournament_id bigint
)
  returns table (
    player_id      uuid,
    account_status text,
    display_name   text,
    first_name     text,
    last_name      text,
    username       text,
    avatar_url     text,
    fargo          int
  )
  language plpgsql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to view this roster';
  end if;

  return query
  select distinct
    pl.id,
    pl.account_status,
    pl.display_name,
    coalesce(pl.first_name, pr.first_name),
    coalesce(pl.last_name,  pr.last_name),
    pr.user_name,
    pr.avatar_url,
    pr.fargo
  from public.tournament_players tp
  join public.players pl on pl.id = tp.player_uuid
  left join public.profiles pr on pr.id = pl.profile_id
  where tp.tournament_id = p_tournament_id
    and tp.player_uuid is not null;
end;
$$;

revoke all on function public.get_registration_players_display(bigint) from public, anon;
grant execute on function public.get_registration_players_display(bigint) to authenticated;

comment on function public.get_registration_players_display(bigint) is
  'Phase 5: manager-gated display resolver (name/status/avatar/fargo — no email/phone) for every uuid-registered player in a tournament. Lets the roster show PENDING players despite the RLS-locked players table.';
