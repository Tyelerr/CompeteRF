-- Phase G (Fix 1) — FORWARD Chip SINGLES participant sync (audit items 36/38, recurrence
-- prevention). The one-time G4 backfill (20260910140000) repaired HISTORICAL completed
-- singles; this RPC prevents the gap from recurring by creating the missing
-- tournament_players participation rows at COMPLETION for any singles chip entry that has a
-- reliable identity but no participation row yet (the TD "Add Player" path writes only
-- chip_entries). Called by the client finish flow; also safe to run manually to repair a
-- completed tournament.
--
-- DESIGN (identical reconstruction rules to the G4 backfill, applied to ONE tournament):
--   * SCOPE: only a COMPLETED chip tournament (status='completed' OR live_state='finished')
--     whose chip_config.format='singles'. Live tournaments and teams/scotch-doubles are
--     untouched (teams keep their tournament_teams/_members model).
--   * Reliable identity required: p1_player_id (→ player_uuid) and/or p1_profile_id
--     (→ player_id). Name-only entries are SKIPPED (never fabricated).
--   * status = 'checked_in' (there is NO 'eliminated' status; elimination is eliminated_at).
--   * paid_entry ← entry paid; paid_side_pots ← chip membership (text[]→jsonb);
--     fargo_rating ← chip Fargo snapshot; fargo_at_registration ← the SAME immutable chip
--     Fargo snapshot (e.p1_fargo); eliminated_at ← chip_entries.eliminated_at (or NULL).
--   * Honors BOTH partial unique indexes ((tournament_id,player_id) and
--     (tournament_id,player_uuid)). An entry already represented by EITHER key — or that
--     would conflict with an existing row on either key — is SKIPPED (NOT EXISTS) and NEVER
--     overwritten. Existing participation rows (e.g. self-registrations, already kept
--     current by setPayment/setFargo) are left intact, so the fargo_at_registration snapshot
--     is never silently rewritten.
--
-- IDEMPOTENT + retry/double-tap safe: the INSERT..SELECT..WHERE NOT EXISTS creates nothing
-- new on a second run. SECURITY DEFINER + can_manage_tournament gate (the authoritative
-- management check — admin/director/venue owner/venue director). Returns the number of rows
-- created (0 on a no-op / already-synced tournament).
--
-- ROLLBACK: supabase/rollback/20260910160000_chip_sync_completed_participants_rollback.sql

create or replace function public.chip_sync_completed_participants(
  p_tournament_id bigint
)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_inserted integer := 0;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to sync participants for this tournament';
  end if;

  with ins as (
    insert into public.tournament_players (
      tournament_id, player_uuid, player_id, status,
      paid_entry, paid_side_pots, fargo_rating, fargo_at_registration, eliminated_at
    )
    select
      e.tournament_id,
      e.p1_player_id,
      e.p1_profile_id,
      'checked_in',
      coalesce(e.paid, false),
      to_jsonb(coalesce(e.paid_side_pots, '{}'::text[])),
      e.p1_fargo,
      e.p1_fargo,
      e.eliminated_at
    from public.chip_entries e
    join public.chip_config cc on cc.tournament_id = e.tournament_id
    join public.tournaments  t on t.id = e.tournament_id
    where e.tournament_id = p_tournament_id
      and (t.status = 'completed' or t.live_state = 'finished')
      and cc.format = 'singles'
      and e.p2_player_id is null
      and e.p2_profile_id is null
      and (e.p2_name is null or e.p2_name = '')
      and (e.p1_player_id is not null or e.p1_profile_id is not null)
      and not exists (
        select 1 from public.tournament_players tp
        where tp.tournament_id = e.tournament_id
          and (
            (e.p1_player_id  is not null and tp.player_uuid = e.p1_player_id)
            or (e.p1_profile_id is not null and tp.player_id  = e.p1_profile_id)
          )
      )
    returning 1
  )
  select count(*) into v_inserted from ins;

  return v_inserted;
end;
$$;

revoke all on function public.chip_sync_completed_participants(bigint) from public, anon;
grant execute on function public.chip_sync_completed_participants(bigint) to authenticated;

comment on function public.chip_sync_completed_participants(bigint) is
  'Phase G Fix 1: forward/idempotent sync of COMPLETED chip SINGLES entries into tournament_players (prevents the TD-add participation gap from recurring). Manager-gated (can_manage_tournament). Mirrors the G4 backfill rules for one tournament: reliable identity only, status=checked_in, paid/side-pots/fargo/fargo_at_registration from the chip snapshot, eliminated_at copied, both unique indexes honored, existing rows never overwritten. Returns rows created.';

-- VERIFICATION (run manually after applying):
-- (a) function exists:
--   select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname = 'chip_sync_completed_participants';
-- (b) dry-run how many rows a given completed tournament would create (should match the
--     RPC's return value; 0 once synced):
--   select count(*) from public.chip_entries e
--   join public.chip_config cc on cc.tournament_id = e.tournament_id
--   join public.tournaments  t on t.id = e.tournament_id
--   where e.tournament_id = <TID>
--     and (t.status='completed' or t.live_state='finished') and cc.format='singles'
--     and e.p2_player_id is null and e.p2_profile_id is null and (e.p2_name is null or e.p2_name='')
--     and (e.p1_player_id is not null or e.p1_profile_id is not null)
--     and not exists (select 1 from public.tournament_players tp where tp.tournament_id=e.tournament_id
--       and ((e.p1_player_id is not null and tp.player_uuid=e.p1_player_id)
--         or (e.p1_profile_id is not null and tp.player_id=e.p1_profile_id)));
