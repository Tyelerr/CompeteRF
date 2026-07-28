-- supabase/migrations/20260709120000_fargo_verification.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Fargo verification flow. A player's Fargo becomes an attribute of their
-- verified ACCOUNT, confirmed by a tournament director at approval time (never
-- typed by the player during registration). Each tournament also keeps an
-- immutable snapshot of the Fargo used for that specific event.
--
--   profiles.fargo                  – the player's current verified Fargo
--   profiles.fargo_status           – 'unverified' | 'verified'
--   profiles.fargo_last_verified_at – when a TD last confirmed it
--   profiles.fargo_verified_by      – id_auto of the TD who confirmed it
--   tournament_players.fargo_at_registration – frozen snapshot for THIS event
--
-- Approval is done through a SECURITY DEFINER RPC so a TD can write the Fargo
-- onto another user's profile (normal RLS only lets a user edit their own row).
-- The RPC verifies the caller is the tournament's director (or an admin).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists fargo                  int,
  add column if not exists fargo_status           text not null default 'unverified',
  add column if not exists fargo_last_verified_at timestamptz,
  add column if not exists fargo_verified_by       bigint;

alter table public.tournament_players
  add column if not exists fargo_at_registration int;

-- TD confirms/updates a player's Fargo and approves their registration in one
-- atomic step. Steps mirror the product spec:
--   1. save confirmed Fargo to the player's profile
--   2. fargo_status = 'verified'
--   3. fargo_last_verified_at = now()
--   4. fargo_verified_by = caller
--   5. copy the confirmed Fargo into tournament_players.fargo_at_registration
--   6. set the registration status to 'approved'
create or replace function public.approve_registration_with_fargo(
  p_registration_id bigint,
  p_fargo           int
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tid    bigint;
  v_pid    bigint;
  v_caller bigint;
  v_role   text;
begin
  select tournament_id, player_id
    into v_tid, v_pid
  from public.tournament_players
  where id = p_registration_id;

  if v_tid is null then
    raise exception 'Registration % not found', p_registration_id;
  end if;

  select id_auto, role
    into v_caller, v_role
  from public.profiles
  where id = auth.uid();

  if not exists (
    select 1
    from public.tournaments t
    where t.id = v_tid
      and (
        t.director_id = v_caller
        or v_role in ('compete_admin', 'super_admin')
      )
  ) then
    raise exception 'Not authorized to approve registrations for this tournament';
  end if;

  -- 1–4: the confirmed Fargo becomes the player's verified profile Fargo.
  -- Skipped for guest registrations (no linked account).
  if v_pid is not null then
    update public.profiles
    set fargo                  = p_fargo,
        fargo_status           = 'verified',
        fargo_last_verified_at = now(),
        fargo_verified_by      = v_caller
    where id_auto = v_pid;
  end if;

  -- 5–6: freeze the snapshot for this event and mark the registration approved.
  update public.tournament_players
  set fargo_at_registration = p_fargo,
      fargo_rating          = p_fargo,
      status                = 'approved',
      updated_at            = now()
  where id = p_registration_id;
end;
$$;

revoke all on function public.approve_registration_with_fargo(bigint, int) from public, anon;
grant execute on function public.approve_registration_with_fargo(bigint, int) to authenticated;
