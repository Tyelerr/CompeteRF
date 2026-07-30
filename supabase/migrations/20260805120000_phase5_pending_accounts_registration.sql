-- 20260805120000_phase5_pending_accounts_registration.sql
-- Phase 5 of the Players / Pending Accounts migration.
-- See PENDING_ACCOUNTS_MIGRATION.md (§C, §E, §E.0, §J) and PHASE5_REVIEW.md.
--
-- Delivers the DB layer for the unified "Add Player / Add Team" registration flow:
-- unified ACTIVE + PENDING player search, background pending-player find-or-create
-- with DB-owned email normalization + dedup, registration keyed on the stable
-- players.id UUID (history survives activation), team build (incl. pending
-- captains/partners), a non-blocking invitation subsystem, and a self-healing,
-- verified-email-only account claim.
--
-- SAFETY / STYLE (see PHASE5_REVIEW.md §Static review):
--   • All statements are transactional DDL/PLPGSQL — the whole file applies atomically.
--   • Every function is SECURITY DEFINER with a pinned `search_path = public, pg_temp`.
--   • Tables `players` / `player_invitations` stay RLS-locked with NO client grants;
--     the ONLY access is through these definer RPCs (least privilege).
--   • Structural changes only RELAX constraints or ADD a nullable column — no row is
--     rewritten; the change is reversible pre-data (see the rollback script).
--   • Every query reference is schema/table qualified (no ambiguous columns).
--
-- Authorization (documented per role in can_manage_tournament below): compete/super
-- admin, the assigned tournament director, and bar owners / venue directors of the
-- tournament's venue (active assignment) — a bar owner is NOT required to also be the
-- director. Invitation status reads use is_staff().

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. STRUCTURAL
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1a. tournament_players: a pending registration is identified ONLY by player_uuid
--     (player_id/id_auto NULL — no auth account) and is NOT a guest. Relax the
--     identity check to accept the uuid basis.
alter table public.tournament_players
  drop constraint if exists tournament_players_identity_chk;
alter table public.tournament_players
  add constraint tournament_players_identity_chk
  check (player_id is not null or player_uuid is not null or guest_name is not null);

-- 1b. tournament_teams: a pending captain has no id_auto, so captain_id must be
--     nullable; the source-of-truth competitive identity is captain_player_id (Phase 3).
--     managed_by_profile_id records the authenticated actor (the TD) who administers a
--     team whose captain cannot (a pending captain). Every team must still carry a
--     captain identity via ONE of the two columns.
alter table public.tournament_teams
  alter column captain_id drop not null;

alter table public.tournament_teams
  add column if not exists managed_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.tournament_teams
  drop constraint if exists tournament_teams_captain_identity_chk;
alter table public.tournament_teams
  add constraint tournament_teams_captain_identity_chk
  check (captain_id is not null or captain_player_id is not null);

comment on column public.tournament_teams.managed_by_profile_id is
  'Phase 5: authenticated actor (TD/admin) who administers this team. Required when the captain is a PENDING player (captain_player_id set, captain_id NULL). NULL for legacy self-captained teams.';
comment on column public.tournament_teams.captain_player_id is
  'Phase 5: SOURCE OF TRUTH for the captain''s competitive identity -> players(id). captain_id (id_auto) is a legacy compatibility mirror only, dropped in Phase 7. A pending captain has captain_player_id with captain_id NULL; an active captain dual-writes both. When a pending captain later claims their account, players.profile_id is set and THIS column is unchanged, so no team migration is needed.';

-- 1c. player_invitations: add a revoked state (append-only model keeps sent/accepted/
--     expired/revoked distinguishable). Widen the "one live invite" guarantee to also
--     exclude revoked rows.
alter table public.player_invitations
  add column if not exists revoked_at timestamptz;

drop index if exists public.player_invitations_one_live_uidx;
create unique index player_invitations_one_live_uidx
  on public.player_invitations (player_id)
  where accepted_at is null and superseded_at is null and revoked_at is null;

comment on column public.player_invitations.revoked_at is
  'Phase 5: set when staff revokes the live invite (terminal). Combined with accepted_at/superseded_at, keeps at most one LIVE token per player.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. AUTHORIZATION + UTILITY HELPERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- can_manage_tournament — the gate for all pending-account/registration/team RPCs.
-- A caller qualifies via ANY of (documented, one branch each):
--   (a) role compete_admin / super_admin              → global management
--   (b) tournaments.director_id = caller.id_auto       → the assigned tournament director
--   (c) venue_owners row for the tournament's venue    → bar owner who OWNS the venue
--   (d) venue_directors row for the tournament's venue → manager assigned to the venue
-- (c)/(d) require an ACTIVE assignment (archived_at IS NULL) and do NOT require the
-- caller to also be the tournament's director_id.
create or replace function public.can_manage_tournament(p_tournament_id bigint)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  with me as (select id_auto, role from public.profiles where id = auth.uid())
  select exists (
    select 1
    from public.tournaments t
    cross join me
    where t.id = p_tournament_id
      and (
        me.role in ('compete_admin', 'super_admin')                                    -- (a)
        or t.director_id = me.id_auto                                                  -- (b)
        or exists (                                                                    -- (c)
          select 1 from public.venue_owners vo
          where vo.venue_id = t.venue_id and vo.owner_id = me.id_auto and vo.archived_at is null
        )
        or exists (                                                                    -- (d)
          select 1 from public.venue_directors vd
          where vd.venue_id = t.venue_id and vd.director_id = me.id_auto and vd.archived_at is null
        )
      )
  );
$$;

revoke all on function public.can_manage_tournament(bigint) from public, anon;
grant execute on function public.can_manage_tournament(bigint) to authenticated;

comment on function public.can_manage_tournament(bigint) is
  'Phase 5: caller may manage the tournament via admin role, assigned director_id, or ACTIVE venue ownership/direction of the tournament venue. Gate for pending-account + registration + team RPCs.';

-- is_staff — coarse role gate for cross-tournament, low-sensitivity reads
-- (e.g. invitation status). NOT used where per-tournament authority is required.
create or replace function public.is_staff()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('tournament_director', 'bar_owner', 'compete_admin', 'super_admin'),
    false);
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- mask_email — privacy for search output. Exact matching still happens on the
-- server against players.email_normalized; only DISPLAY is masked. Pure/immutable,
-- reads no tables, called only from within definer RPCs (no client grant).
create or replace function public.mask_email(p_email text)
  returns text
  language sql
  immutable
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else left(split_part(p_email, '@', 1), 1) || '***@'
      || left(split_part(p_email, '@', 2), 1) || '***.'
      || reverse(split_part(reverse(split_part(p_email, '@', 2)), '.', 1))
  end;
$$;

comment on function public.mask_email(text) is
  'Phase 5: display-only email mask (j***@g***.com). Exact matching uses players.email_normalized; raw emails are never returned by search RPCs.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. UNIFIED PLAYER SEARCH (ACTIVE + PENDING) — masked output, no phone
-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 2 backfilled one ACTIVE player per profile, so one scan of `players` covers
-- both statuses; profiles is LEFT JOINed to enrich ACTIVE players. Returns a MASKED
-- email and NO phone number. Gated to the tournament manager (results reveal that a
-- given person exists as a pending contact).
create or replace function public.search_players_for_registration(
  p_tournament_id bigint,
  p_query         text,
  p_limit         int default 20
)
  returns table (
    player_id       uuid,
    account_status  text,
    display_name    text,
    first_name      text,
    last_name       text,
    email_masked    text,
    username        text,
    avatar_url      text,
    fargo           int,
    is_registered   boolean
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
    return;  -- caller shows Recent Players until 2+ chars are typed
  end if;
  v_like := '%' || v_q || '%';

  return query
  select
    pl.id,
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
    )
  from public.players pl
  left join public.profiles pr on pr.id = pl.profile_id
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
  'Phase 5: unified ACTIVE+PENDING player search for the Add Player/Team modal. Matches name/username/email-prefix/players.id/id_auto. Returns MASKED email, no phone. Gated to the tournament manager. is_registered flags players already on this tournament.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. RECENT PLAYERS (before the TD types) — masked output, no phone
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.get_recent_players_for_registration(
  p_tournament_id bigint,
  p_limit         int default 10
)
  returns table (
    player_id       uuid,
    account_status  text,
    display_name    text,
    first_name      text,
    last_name       text,
    email_masked    text,
    username        text,
    avatar_url      text,
    fargo           int,
    is_registered   boolean
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
    order by tp.player_uuid, tp.registered_at desc
  )
  select
    pl.id, pl.account_status, pl.display_name,
    coalesce(pl.first_name, pr.first_name),
    coalesce(pl.last_name,  pr.last_name),
    public.mask_email(pl.email), pr.user_name, pr.avatar_url, pr.fargo,
    false
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
  'Phase 5: recent players the caller has registered across tournaments they manage, excluding those already on this tournament. Masked email, no phone. Powers the modal Recent Players section.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. FIND-OR-CREATE A PENDING PLAYER — structured outcome, never overwrites
-- ═══════════════════════════════════════════════════════════════════════════════
-- Search-before-create by NORMALIZED email. Returns a structured outcome so the UI
-- can distinguish create vs reuse:
--   CREATED_PENDING  — a new pending identity was created
--   MATCHED_PENDING  — an existing pending identity was reused (NOT modified)
--   MATCHED_ACTIVE   — the email belongs to an existing ACTIVE player (reused)
-- A DISABLED match is rejected (flag for admin). On reuse, name/phone are left
-- untouched — correcting an existing pending profile is a separate, authorized op.
create or replace function public.create_pending_player(
  p_tournament_id bigint,
  p_first_name    text,
  p_last_name     text,
  p_email         text,
  p_phone         text default null
)
  returns table (
    player_id      uuid,
    outcome        text,
    account_status text,
    display_name   text,
    email_masked   text
  )
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_norm  text := lower(btrim(coalesce(p_email, '')));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_ex    public.players%rowtype;
  v_new   uuid;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to create players for this tournament';
  end if;
  if v_first = '' or v_last = '' then
    raise exception 'First and last name are required';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email is required';
  end if;

  -- Find-or-reuse by normalized email (partial unique index guarantees at most one).
  select * into v_ex from public.players where email_normalized = v_norm;
  if found then
    if v_ex.account_status = 'DISABLED' then
      raise exception 'An account with this email is disabled; contact an admin'
        using errcode = 'check_violation';
    end if;
    return query select
      v_ex.id,
      case when v_ex.account_status = 'ACTIVE' then 'MATCHED_ACTIVE' else 'MATCHED_PENDING' end,
      v_ex.account_status,
      v_ex.display_name,
      public.mask_email(v_ex.email);
    return;
  end if;

  -- Create a fresh PENDING player. email_normalized is a generated column; never set it.
  begin
    insert into public.players
      (display_name, first_name, last_name, email, phone_e164, account_status, created_by_profile_id)
    values
      (v_first || ' ' || v_last, v_first, v_last, v_email, v_phone, 'PENDING', auth.uid())
    returning id into v_new;
  exception when unique_violation then
    -- Lost a race: reuse whoever landed first (never a second identity).
    select * into v_ex from public.players where email_normalized = v_norm;
    if v_ex.account_status = 'DISABLED' then
      raise exception 'An account with this email is disabled; contact an admin'
        using errcode = 'check_violation';
    end if;
    return query select
      v_ex.id,
      case when v_ex.account_status = 'ACTIVE' then 'MATCHED_ACTIVE' else 'MATCHED_PENDING' end,
      v_ex.account_status, v_ex.display_name, public.mask_email(v_ex.email);
    return;
  end;

  return query select v_new, 'CREATED_PENDING'::text, 'PENDING'::text,
                      v_first || ' ' || v_last, public.mask_email(v_email);
end;
$$;

revoke all on function public.create_pending_player(bigint, text, text, text, text) from public, anon;
grant execute on function public.create_pending_player(bigint, text, text, text, text) to authenticated;

comment on function public.create_pending_player(bigint, text, text, text, text) is
  'Phase 5: find-or-create a PENDING player by normalized email. Structured outcome CREATED_PENDING | MATCHED_PENDING | MATCHED_ACTIVE. Reuses (never duplicates or overwrites) an existing player; rejects DISABLED; race-safe. Does NOT send an invite (see issue_player_invitation). Gated to the tournament manager.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. REGISTER A PLAYER (SINGLES) BY players.id
-- ═══════════════════════════════════════════════════════════════════════════════
-- Writes tournament_players keyed on the stable UUID. ACTIVE players dual-write the
-- legacy id_auto (kept consistent by the Phase 4A trigger); PENDING players set only
-- player_uuid (allowed by §1a). Idempotent per (tournament, player).
create or replace function public.register_player_for_tournament(
  p_tournament_id bigint,
  p_player_id     uuid,
  p_fargo         int  default null,
  p_status        text default 'approved'
)
  returns bigint
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile_id uuid;
  v_status     text;
  v_id_auto    bigint;
  v_existing   bigint;
  v_reg_id     bigint;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to register players for this tournament';
  end if;

  select profile_id, account_status into v_profile_id, v_status
  from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;
  if v_status = 'DISABLED' then raise exception 'Cannot register a disabled player'; end if;

  if v_profile_id is not null then
    select id_auto into v_id_auto from public.profiles where id = v_profile_id;
  end if;

  select id into v_existing
  from public.tournament_players
  where tournament_id = p_tournament_id and player_uuid = p_player_id and status <> 'cancelled'
  limit 1;
  if v_existing is not null then
    return v_existing;  -- idempotent
  end if;

  insert into public.tournament_players
    (tournament_id, player_id, player_uuid, status, fargo_rating)
  values
    (p_tournament_id, v_id_auto, p_player_id, p_status, p_fargo)
  returning id into v_reg_id;

  return v_reg_id;
end;
$$;

revoke all on function public.register_player_for_tournament(bigint, uuid, int, text) from public, anon;
grant execute on function public.register_player_for_tournament(bigint, uuid, int, text) to authenticated;

comment on function public.register_player_for_tournament(bigint, uuid, int, text) is
  'Phase 5: TD registers an ACTIVE or PENDING player into a tournament by stable players.id. Dual-writes legacy id_auto for ACTIVE players. Idempotent per (tournament, player). Fargo is a per-event snapshot on tournament_players.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. TEAM BUILD BY players.id (pending captains + partners; waiting-for-teammate)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Waiting-for-teammate flow: td_create_team_by_uuid makes a team with ONLY the
-- captain, status 'pending_partner' (a captain-only team is NOT seated — seeding
-- reads status='registered'). The captain's suggested_fargo + the team's chip_override
-- are preserved when the partner is added later via td_add_team_member_by_uuid. The
-- same-player-twice guard (player_uuid already on a non-declined team member row)
-- also blocks adding the captain as their own partner.
create or replace function public.td_create_team_by_uuid(
  p_tournament_id     bigint,
  p_captain_player_id uuid,
  p_fargo             int
)
  returns bigint
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile_id uuid;
  v_status     text;
  v_id_auto    bigint;
  v_team       bigint;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to add teams for this tournament';
  end if;

  select profile_id, account_status into v_profile_id, v_status
  from public.players where id = p_captain_player_id;
  if not found then raise exception 'Player not found'; end if;
  if v_status = 'DISABLED' then raise exception 'Cannot add a disabled player'; end if;
  if v_profile_id is not null then
    select id_auto into v_id_auto from public.profiles where id = v_profile_id;
  end if;

  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = p_tournament_id
      and m.player_uuid = p_captain_player_id
      and m.invite_status <> 'declined'
  ) then
    raise exception 'That player is already on a team for this tournament';
  end if;

  insert into public.tournament_teams
    (tournament_id, captain_id, captain_player_id, managed_by_profile_id, status)
  values
    (p_tournament_id, v_id_auto, p_captain_player_id, auth.uid(), 'pending_partner')
  returning id into v_team;

  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, player_uuid, role, invite_status, is_verified, suggested_fargo)
  values
    (v_team, p_tournament_id, v_id_auto, p_captain_player_id, 'captain', 'accepted', false, p_fargo);

  return v_team;
end;
$$;

create or replace function public.td_add_team_member_by_uuid(
  p_team_id   bigint,
  p_player_id uuid,
  p_fargo     int
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_tid        bigint;
  v_profile_id uuid;
  v_status     text;
  v_id_auto    bigint;
begin
  select tournament_id into v_tid from public.tournament_teams where id = p_team_id;
  if v_tid is null then raise exception 'Team not found'; end if;
  if not public.can_manage_tournament(v_tid) then
    raise exception 'Not authorized to edit teams for this tournament';
  end if;

  select profile_id, account_status into v_profile_id, v_status
  from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;
  if v_status = 'DISABLED' then raise exception 'Cannot add a disabled player'; end if;
  if v_profile_id is not null then
    select id_auto into v_id_auto from public.profiles where id = v_profile_id;
  end if;

  -- Blocks the same player twice (incl. the captain adding themselves).
  if exists (
    select 1 from public.tournament_team_members m
    where m.tournament_id = v_tid
      and m.player_uuid = p_player_id
      and m.invite_status <> 'declined'
  ) then
    raise exception 'That player is already on a team for this tournament';
  end if;

  delete from public.tournament_team_members where team_id = p_team_id and role <> 'captain';
  insert into public.tournament_team_members
    (team_id, tournament_id, player_id, player_uuid, role, invite_status, is_verified, suggested_fargo)
  values
    (p_team_id, v_tid, v_id_auto, p_player_id, 'member', 'accepted', false, p_fargo);

  update public.tournament_teams set approved = false, locked = true, updated_at = now() where id = p_team_id;
  perform public._recompute_team_status(p_team_id);
end;
$$;

revoke all on function public.td_create_team_by_uuid(bigint, uuid, int) from public, anon;
grant execute on function public.td_create_team_by_uuid(bigint, uuid, int) to authenticated;
revoke all on function public.td_add_team_member_by_uuid(bigint, uuid, int) from public, anon;
grant execute on function public.td_add_team_member_by_uuid(bigint, uuid, int) to authenticated;

comment on function public.td_create_team_by_uuid(bigint, uuid, int) is
  'Phase 5: UUID-native td_create_team. Captain may be PENDING (captain_id NULL, captain_player_id set, managed_by_profile_id = caller). Creates a captain-only ''pending_partner'' team (waiting-for-teammate). Dual-writes id_auto for ACTIVE captains.';
comment on function public.td_add_team_member_by_uuid(bigint, uuid, int) is
  'Phase 5: UUID-native td_add_team_member. Adds/replaces the partner (ACTIVE or PENDING), preserves captain fargo + team chip_override, locks + un-approves, recomputes status. Rejects the same player twice.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. INVITATION SUBSYSTEM (token rules only — email delivery is a separate service)
-- ═══════════════════════════════════════════════════════════════════════════════
-- These RPCs manage secure, single-use, expiring tokens (only a SHA-256 hash is
-- stored; the raw token is returned ONCE for the edge function to embed in a link).
-- They are DECOUPLED from create_pending_player so a TD can create + register a
-- player even if invitations are disabled or email delivery fails. Resending never
-- creates a new player identity — it only supersedes the prior token for the SAME
-- players.id.
create or replace function public.issue_player_invitation(
  p_player_id     uuid,
  p_tournament_id bigint,
  p_ttl_hours     int default 168
)
  returns table (token text, expires_at timestamptz)
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_status text;
  v_norm   text;
  v_last   timestamptz;
  v_token  text;
  v_hash   text;
  v_exp    timestamptz := now() + make_interval(hours => greatest(coalesce(p_ttl_hours, 168), 1));
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to invite players for this tournament';
  end if;
  select account_status, email_normalized into v_status, v_norm
  from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;
  if v_status <> 'PENDING' then raise exception 'Only pending players can be invited'; end if;
  if v_norm is null then raise exception 'Player has no email to invite'; end if;

  -- Rate limit: 60s cooldown between sends for this player.
  select max(pi.sent_at) into v_last from public.player_invitations pi where pi.player_id = p_player_id;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    raise exception 'Please wait a moment before resending the invitation' using errcode = '55000';
  end if;

  -- Supersede the current live invite (if any), then issue a new one.
  update public.player_invitations
     set superseded_at = now()
   where player_id = p_player_id and accepted_at is null and superseded_at is null and revoked_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash  := encode(sha256(v_token::bytea), 'hex');

  insert into public.player_invitations
    (player_id, email_normalized, token_hash, expires_at, created_by_profile_id)
  values
    (p_player_id, v_norm, v_hash, v_exp, auth.uid());

  update public.players set invited_at = coalesce(invited_at, now()) where id = p_player_id;

  return query select v_token, v_exp;
end;
$$;

create or replace function public.revoke_player_invitation(
  p_player_id     uuid,
  p_tournament_id bigint
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to revoke invitations for this tournament';
  end if;
  update public.player_invitations
     set revoked_at = now()
   where player_id = p_player_id and accepted_at is null and superseded_at is null and revoked_at is null;
end;
$$;

create or replace function public.get_player_invitation_status(p_player_id uuid)
  returns table (state text, sent_at timestamptz, expires_at timestamptz)
  language plpgsql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;
  return query
  select
    case
      when pi.accepted_at   is not null then 'accepted'
      when pi.revoked_at    is not null then 'revoked'
      when pi.superseded_at is not null then 'superseded'
      when pi.expires_at    <  now()    then 'expired'
      else 'sent'
    end,
    pi.sent_at,
    pi.expires_at
  from public.player_invitations pi
  where pi.player_id = p_player_id
  order by pi.sent_at desc
  limit 1;
end;
$$;

revoke all on function public.issue_player_invitation(uuid, bigint, int) from public, anon;
grant execute on function public.issue_player_invitation(uuid, bigint, int) to authenticated;
revoke all on function public.revoke_player_invitation(uuid, bigint) from public, anon;
grant execute on function public.revoke_player_invitation(uuid, bigint) to authenticated;
revoke all on function public.get_player_invitation_status(uuid) from public, anon;
grant execute on function public.get_player_invitation_status(uuid) to authenticated;

comment on function public.issue_player_invitation(uuid, bigint, int) is
  'Phase 5: create/refresh a pending player''s invitation. Supersedes the prior live token, stores only a SHA-256 hash, returns the raw token ONCE for the email service. Rate-limited (60s). Never creates a player identity. Email delivery is a separate edge function.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. IDENTITY LIFECYCLE — provision on signup, self-healing verified-email claim
-- ═══════════════════════════════════════════════════════════════════════════════
-- _ensure_player_for_user is the single idempotent core, invoked from THREE places
-- so a user can never be left with a profile but no linked player (see PHASE5_REVIEW.md
-- §Signup/claim sequence):
--   (i)   AFTER INSERT on public.profiles   — normal signup gets an ACTIVE player at
--         once when no pending email match exists; claims immediately if the email is
--         already verified.
--   (ii)  AFTER UPDATE OF email_confirmed_at on auth.users — SERVER-SIDE auto-claim the
--         moment ownership is proven, with NO app or manual action (covers the case
--         where a pending identity held the email at signup).
--   (iii) claim_pending_player() RPC — fast-path the app calls on session hydration;
--         also a manual retry. All three converge on the same idempotent function.
-- A pending identity is NEVER claimed on name/phone/username — ONLY on a verified
-- (auth.users.email_confirmed_at) email match, and never one already owned by another.
create or replace function public._ensure_player_for_user(p_uid uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_player      uuid;
  v_owner       uuid;
  v_email       text;
  v_verified    timestamptz;
  v_norm        text;
  v_has_profile boolean := false;
  v_name        text;
  v_first       text;
  v_last        text;
  v_phone       text;
begin
  if p_uid is null then return null; end if;

  -- Already linked? (idempotent no-op)
  select id into v_player from public.players where profile_id = p_uid;
  if v_player is not null then return v_player; end if;

  -- Canonical, authoritative email + verification state from auth.
  select u.email, u.email_confirmed_at into v_email, v_verified
  from auth.users u where u.id = p_uid;
  if v_email is null then return null; end if;
  v_norm := lower(btrim(v_email));

  -- Profile details for creating a fresh player (may not exist yet).
  select true, pr.name, pr.first_name, pr.last_name, pr.phone_number
    into v_has_profile, v_name, v_first, v_last, v_phone
  from public.profiles pr where pr.id = p_uid;

  select pl.id, pl.profile_id into v_player, v_owner
  from public.players pl where pl.email_normalized = v_norm;

  if v_player is null then
    -- No existing identity: create a fresh ACTIVE player (needs the profile row).
    if not v_has_profile then return null; end if;
    insert into public.players
      (display_name, first_name, last_name, email, phone_e164, account_status, profile_id, activated_at)
    values
      (coalesce(nullif(v_name, ''), nullif(btrim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')), ''), v_email),
       v_first, v_last, v_email, v_phone, 'ACTIVE', p_uid, now())
    returning id into v_player;
    return v_player;
  end if;

  -- Existing identity found.
  if v_owner is not null then
    if v_owner = p_uid then return v_player; end if;
    return null;  -- owned by another account: never steal
  end if;

  -- Unlinked (PENDING). Claim ONLY with proven email ownership AND an existing profile.
  if v_verified is null then return null; end if;
  if not v_has_profile then return null; end if;

  update public.players
     set profile_id = p_uid, account_status = 'ACTIVE', activated_at = coalesce(activated_at, now())
   where id = v_player and profile_id is null;

  update public.player_invitations
     set accepted_at = now()
   where player_id = v_player and accepted_at is null and superseded_at is null and revoked_at is null;

  return v_player;
exception when unique_violation then
  -- Concurrent link/create landed first; return the now-linked player.
  select id into v_player from public.players where profile_id = p_uid;
  return v_player;
end;
$$;

revoke all on function public._ensure_player_for_user(uuid) from public, anon, authenticated;

comment on function public._ensure_player_for_user(uuid) is
  'Phase 5: idempotent core that guarantees a user has an ACTIVE linked player. Creates one for a fresh email; claims an existing PENDING identity ONLY when auth.users.email_confirmed_at is set; never steals a linked identity; never merges on name/phone. Internal only — invoked by the profiles + auth.users triggers and claim_pending_player().';

-- (i) profiles insert → ensure/claim
create or replace function public.tg_provision_player_for_profile()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  perform public._ensure_player_for_user(new.id);
  return new;
end;
$$;

create or replace trigger on_profile_created_provision_player
  after insert on public.profiles
  for each row execute function public.tg_provision_player_for_profile();

-- (ii) auth email confirmation → server-side auto-claim (fires ONLY on the transition)
create or replace function public.tg_claim_player_on_email_confirm()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  perform public._ensure_player_for_user(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_email_confirmed_claim_player on auth.users;
create trigger on_auth_email_confirmed_claim_player
  after update of email_confirmed_at on auth.users
  for each row
  when (new.email_confirmed_at is not null and old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.tg_claim_player_on_email_confirm();

-- (iii) explicit claim (app calls on session hydration; also a manual retry)
create or replace function public.claim_pending_player()
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      uuid := auth.uid();
  v_player   uuid;
  v_verified timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  v_player := public._ensure_player_for_user(v_uid);
  if v_player is not null then return v_player; end if;

  select email_confirmed_at into v_verified from auth.users where id = v_uid;
  if v_verified is null then
    raise exception 'Verify your email to finish setting up your player profile';
  end if;
  raise exception 'Unable to link a player profile for this account';
end;
$$;

revoke all on function public.claim_pending_player() from public, anon;
grant execute on function public.claim_pending_player() to authenticated;

comment on function public.claim_pending_player() is
  'Phase 5: links the caller''s verified-email player to their profile (status -> ACTIVE), preserving all history on the same players.id. Idempotent; safe to call on every session hydration. Requires auth.users.email_confirmed_at; refuses a player owned by another account.';
