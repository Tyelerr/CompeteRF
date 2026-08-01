-- 20260813120000_phase5_search_id_auto.sql
-- Phase 5 follow-up (Singles chip): both registration lookups must return id_auto so
-- the chip Add Player flow can write chip_entries.p1_profile_id (= profiles.id_auto)
-- for ACTIVE players — preserving all existing id_auto-keyed logic (dedup, spectator
-- matching, chip_results) — while using players.id (player_id) as the stable identity.
-- Recents must return id_auto too, so an active player added from Recents behaves
-- identically to one found via Search. id_auto is NULL for PENDING players.
--
-- Additive: one new column on each function; every existing column keeps its meaning.
-- Adding a column changes the return type, so both are DROP + CREATE (bodies otherwise
-- identical to 20260809). Same SECURITY DEFINER, pinned search_path, and grants. The
-- verified pending-player lifecycle RPCs are NOT touched.

-- ── Search ──────────────────────────────────────────────────────────────────────
drop function if exists public.search_players_for_registration(bigint, text, int);

create function public.search_players_for_registration(
  p_tournament_id bigint,
  p_query         text,
  p_limit         int default 20
)
  returns table (
    player_id       uuid,     -- players.id (stable identity)
    id_auto         bigint,   -- NEW: profiles.id_auto (NULL for PENDING players)
    account_status  text,
    display_name    text,
    first_name      text,
    last_name       text,
    email_masked    text,
    username        text,
    avatar_url      text,
    fargo           int,
    is_registered   boolean,  -- already on this tournament as a tournament_players row
    on_team         boolean,  -- already on a non-declined team here
    team_name       text
  )
  language plpgsql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_q    text := btrim(coalesce(p_query, ''));
  v_like text;
  v_lim  int  := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to search players for this tournament';
  end if;
  if length(v_q) < 2 then
    return;
  end if;
  v_like := '%' || v_q || '%';

  return query
  select
    pl.id,
    pr.id_auto,
    pl.account_status,
    pl.display_name,
    coalesce(pl.first_name, pr.first_name),
    coalesce(pl.last_name,  pr.last_name),
    public.mask_email(pl.email),
    pr.user_name,
    pr.avatar_url,
    pr.fargo,
    exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = p_tournament_id
        and tp.player_uuid = pl.id
        and tp.status <> 'cancelled'
    ),
    (tm.tid is not null),
    tm.tname
  from public.players pl
  left join public.profiles pr on pr.id = pl.profile_id
  left join lateral (
    select tt.id as tid, tt.name as tname
    from public.tournament_team_members m
    join public.tournament_teams tt on tt.id = m.team_id
    where m.tournament_id = p_tournament_id
      and m.player_uuid = pl.id
      and m.invite_status <> 'declined'
    limit 1
  ) tm on true
  where pl.account_status in ('ACTIVE', 'PENDING')
    and (
      pl.display_name       ilike v_like
      or pl.first_name      ilike v_like
      or pl.last_name       ilike v_like
      or (coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')) ilike v_like
      or pl.email_normalized like  lower(v_q) || '%'
      or pr.user_name        ilike v_like
      or pl.id::text          =    lower(v_q)
      or pr.id_auto::text     =    v_q
    )
  order by (pl.account_status = 'ACTIVE') desc, pl.display_name asc
  limit v_lim;
end;
$$;

revoke all on function public.search_players_for_registration(bigint, text, int) from public, anon;
grant execute on function public.search_players_for_registration(bigint, text, int) to authenticated;

comment on function public.search_players_for_registration(bigint, text, int) is
  'Phase 5: unified ACTIVE+PENDING search. Returns players.id (player_id) + id_auto (NULL for pending), masked email, and is_registered / on_team / team_name flags. Manager-gated. Lifecycle RPCs unchanged.';

-- ── Recent players ──────────────────────────────────────────────────────────────
drop function if exists public.get_recent_players_for_registration(bigint, int);

create function public.get_recent_players_for_registration(
  p_tournament_id bigint,
  p_limit         int default 10
)
  returns table (
    player_id       uuid,
    id_auto         bigint,   -- NEW: profiles.id_auto (NULL for PENDING players)
    account_status  text,
    display_name    text,
    first_name      text,
    last_name       text,
    email_masked    text,
    username        text,
    avatar_url      text,
    fargo           int,
    is_registered   boolean,
    on_team         boolean,
    team_name       text
  )
  language plpgsql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_caller   bigint;
  v_is_admin boolean;
  v_lim      int := least(greatest(coalesce(p_limit, 10), 1), 25);
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to view recent players for this tournament';
  end if;
  select id_auto, role in ('compete_admin', 'super_admin')
    into v_caller, v_is_admin
  from public.profiles where id = auth.uid();

  return query
  with recent as (
    select distinct on (tp.player_uuid)
           tp.player_uuid as pid, tp.registered_at as reg_at
    from public.tournament_players tp
    join public.tournaments t on t.id = tp.tournament_id
    where tp.player_uuid is not null
      and (v_is_admin or public.can_manage_tournament(t.id))
      and not exists (
        select 1 from public.tournament_players x
        where x.tournament_id = p_tournament_id
          and x.player_uuid = tp.player_uuid
          and x.status <> 'cancelled'
      )
      and not exists (
        select 1 from public.tournament_team_members m
        where m.tournament_id = p_tournament_id
          and m.player_uuid = tp.player_uuid
          and m.invite_status <> 'declined'
      )
    order by tp.player_uuid, tp.registered_at desc
  )
  select
    pl.id, pr.id_auto, pl.account_status, pl.display_name,
    coalesce(pl.first_name, pr.first_name),
    coalesce(pl.last_name,  pr.last_name),
    public.mask_email(pl.email), pr.user_name, pr.avatar_url, pr.fargo,
    false, false, null::text
  from recent r
  join public.players pl on pl.id = r.pid
  left join public.profiles pr on pr.id = pl.profile_id
  where pl.account_status in ('ACTIVE', 'PENDING')
  order by r.reg_at desc
  limit v_lim;
end;
$$;

revoke all on function public.get_recent_players_for_registration(bigint, int) from public, anon;
grant execute on function public.get_recent_players_for_registration(bigint, int) to authenticated;

comment on function public.get_recent_players_for_registration(bigint, int) is
  'Phase 5: recent players the caller registered, excluding anyone already on this tournament (as a player OR team member). Returns players.id (player_id) + id_auto (NULL for pending). Masked email, no phone. on_team/team_name always false/null here (parity with search).';
