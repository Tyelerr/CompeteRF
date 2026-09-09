-- 20260818160000_sync_eliminations_manager_only.sql
-- Tighten sync_tournament_eliminations: eliminated_at now drives real behavior (Tournament
-- View labels, review eligibility, lifecycle, future analytics), so a NORMAL PARTICIPANT must
-- not be able to set/clear another player's elimination state. Authorization is narrowed to
-- authorized tournament management only (can_manage_tournament: admin / assigned director /
-- venue owner / venue director) — the same authority already allowed to operate the event.
-- The participant branch is removed; the client no longer calls this from the player hook, only
-- from the TD/operator manage screen.
--
-- Cross-tournament protection: every write is scoped to `tournament_id = p_tournament_id`, so
-- any registration id belonging to a different tournament simply matches no rows and cannot be
-- mutated. Idempotent (only sets where null) and self-correcting (clears anyone no longer in
-- the supplied set) — undo/reset/restore reconcile correctly on the next authorized call.

create or replace function public.sync_tournament_eliminations(
  p_tournament_id integer,
  p_eliminated_reg_ids integer[]
) returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  -- Authorized tournament management ONLY. Participants cannot reconcile the elimination set.
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'not authorized to reconcile eliminations for this tournament';
  end if;

  -- Stamp newly eliminated (scoped to THIS tournament; ids from any other tournament never
  -- match, so they cannot be touched). Only where not already set (idempotent).
  update public.tournament_players
     set eliminated_at = now()
   where tournament_id = p_tournament_id
     and id = any(p_eliminated_reg_ids)
     and eliminated_at is null;

  -- Clear anyone previously eliminated who is no longer in the set (score undo / correction /
  -- restore). Also scoped to this tournament only.
  update public.tournament_players
     set eliminated_at = null
   where tournament_id = p_tournament_id
     and eliminated_at is not null
     and not (id = any(coalesce(p_eliminated_reg_ids, array[]::integer[])));
end;
$$;

revoke all on function public.sync_tournament_eliminations(integer, integer[]) from public, anon;
grant execute on function public.sync_tournament_eliminations(integer, integer[]) to authenticated;

comment on function public.sync_tournament_eliminations(integer, integer[]) is
  'Reconcile tournament_players.eliminated_at from the client-computed bracket-engine elimination set. Authorized tournament MANAGEMENT only (can_manage_tournament) — normal participants cannot alter elimination state. Writes are scoped to p_tournament_id (no cross-tournament mutation). Idempotent + self-correcting.';
