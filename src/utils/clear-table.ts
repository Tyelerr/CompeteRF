// src/utils/clear-table.ts
// "Clear Table" — the TD takes a match OFF its table and back into the Ready queue.
//
// It ONLY removes the table assignment: no start, no completion, no score, winner, forfeit,
// withdraw or bracket change. The server `unassign` op does exactly that and stamps a server
// `clearedAt` (migration 20260926120000).
//
// Auto Assign interaction: without a marker, freeing the table triggers a server Auto Assign
// run that would put the SAME match straight back on the SAME table — Clear Table would undo
// itself. `clearedAt` gives the match a short hold: Auto Assign skips it for 2 minutes (and only
// it — every other Ready match may still take that table, and Auto Assign stays ON).
// After the hold the match is an ordinary Ready match again, picked up by the next trigger or
// the recovery sweep. A manual assign clears the mark immediately (server side).
//
// Match Order: automatic modes re-place the match by the selected mode (and any queue pins).
// Manual mode is authoritative order, so the cleared match is moved to the FRONT of the manual
// order in the SAME atomic write — "I cleared this table because I want this match to go on the
// next free one". It is a Ready match (its feeders are complete), so the front is always legal.
import { AutoAssignMode, ElimLiveOp, MatchLiveState } from "../models/types/tournament-settings.types";

/** How long Auto Assign leaves a just-cleared match alone: 2 minutes. */
export const CLEAR_TABLE_HOLD_MS = 120_000;

/** Is this match inside its post-clear Auto Assign hold? */
export const isClearHeld = (state: MatchLiveState | null | undefined, now: number): boolean => {
  const at = state?.clearedAt;
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && now - t >= 0 && now - t < CLEAR_TABLE_HOLD_MS;
};

/** Match ids currently held (used by the planner). */
export const clearHeldIds = (matchState: Record<string, MatchLiveState>, now: number): Set<string> => {
  const held = new Set<string>();
  for (const [id, st] of Object.entries(matchState ?? {})) if (isClearHeld(st, now)) held.add(id);
  return held;
};

/**
 * The ops one Clear Table sends (one atomic server call):
 *   automatic modes → [unassign]
 *   manual          → [unassign, set_queue(front of the manual order)]
 * Nothing here can start, complete or score a match, or change the mode / Auto Assign.
 */
export const buildClearTableOps = (args: {
  matchId: string;
  mode: AutoAssignMode;
  queueOrder: string[] | null | undefined;
}): ElimLiveOp[] => {
  const ops: ElimLiveOp[] = [{ op: "unassign", matchId: args.matchId }];
  if (args.mode === "manual") {
    const rest = (args.queueOrder ?? []).filter((id) => id !== args.matchId);
    ops.push({ op: "set_queue", queueOrder: [args.matchId, ...rest] });
  }
  return ops;
};

/** Confirmation copy. */
export const clearTableConfirm = (tableLabel: string, autoAssignEnabled: boolean): string =>
  `This will remove ${tableLabel} from this match and return the match to the Ready queue.` +
  (autoAssignEnabled ? " Auto Assign stays on and won't automatically reassign this match for 2 minutes." : "");
