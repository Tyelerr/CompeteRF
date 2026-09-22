// src/utils/schedule.reorder.ts
// TD manual reordering of the projected elimination schedule (Queue → Scheduled
// Matches). Pure. Produces the next `live_settings.queueOrder` (the existing
// manual-order persistence) from the CURRENT projected `scheduled` list — it never
// touches eligibility, tables, or match state.
//
// Moves change PRIORITY only and stay inside the Phase 1 rules:
//   • Ready and Waiting are separate tiers — a move never crosses the boundary
//     (a waiting match can't be lifted above a ready one, nor a ready one sunk
//     below a waiting one).
//   • A waiting match can't pass its own undecided feeder (the swap is refused;
//     projectSchedule would ignore it anyway).
//   • A conditional GF2 that may never be played stays pinned last.
// Writing the whole displayed order (with the move applied) as queueOrder makes
// Manual mode reproduce exactly what the TD sees: the list is already
// dependency-valid, so the projection keeps it as-is.

import { ProjectedMatch } from "./schedule.projection";
import { QueuePin } from "../models/types/tournament-settings.types";

export type ScheduleMove = "up" | "down" | "top" | "bottom";

export interface ScheduleMoveAvailability {
  up: boolean;
  down: boolean;
  top: boolean;
  bottom: boolean;
}

const pinnedLast = (pm: ProjectedMatch): boolean => pm.conditional === "possible";

// Can `above` and `below` (adjacent, `above` first) trade places?
const canSwap = (above: ProjectedMatch, below: ProjectedMatch): boolean =>
  above.eligibility.ready === below.eligibility.ready &&
  !pinnedLast(above) &&
  !pinnedLast(below) &&
  !below.eligibility.blockedBy.includes(above.matchId);

export const scheduleMoveAvailability = (
  scheduled: ProjectedMatch[],
  index: number,
): ScheduleMoveAvailability => {
  const cur = scheduled[index];
  const prev = scheduled[index - 1];
  const next = scheduled[index + 1];
  const up = !!cur && !!prev && canSwap(prev, cur);
  const down = !!cur && !!next && canSwap(cur, next);
  // Top/Bottom move as far as the tier allows; the projection then settles the
  // match right after its feeders / right before its dependents.
  return { up, down, top: up, bottom: down };
};

// ── Why a move is unavailable (UI explanation only) ───────────────────────────
// Legality always comes from scheduleMoveAvailability above; these reasons are
// only computed for moves it already refused, so they can never make a move legal
// or illegal.
export type MoveBlockedReason =
  | "conditional" // GF2 reset that may never be played — pinned last
  | "dependsOnAbove" // the row above is one of this match's feeders
  | "dependentBelow" // the row below is waiting on this match
  | "highest" // top of its tier (or of the list)
  | "lowest"; // bottom of its tier (or above the pinned reset)

export const MOVE_BLOCKED_TEXT: Record<MoveBlockedReason, string> = {
  conditional: "This conditional match stays at the end until it is required.",
  dependsOnAbove: "Can't move above a match this one depends on.",
  dependentBelow: "Can't move below a match that depends on this one.",
  highest: "Already at the highest available position.",
  lowest: "Already at the lowest available position.",
};

export interface ScheduleMoveState {
  can: ScheduleMoveAvailability;
  // null when the move is allowed
  reason: Record<ScheduleMove, MoveBlockedReason | null>;
}

export const scheduleMoveState = (
  scheduled: ProjectedMatch[],
  index: number,
): ScheduleMoveState => {
  const can = scheduleMoveAvailability(scheduled, index);
  const cur = scheduled[index];
  const prev = scheduled[index - 1];
  const next = scheduled[index + 1];
  const upReason = (): MoveBlockedReason => {
    if (cur && pinnedLast(cur)) return "conditional";
    if (cur && prev && cur.eligibility.blockedBy.includes(prev.matchId)) return "dependsOnAbove";
    return "highest";
  };
  const downReason = (): MoveBlockedReason => {
    if (cur && pinnedLast(cur)) return "conditional";
    if (cur && next && next.eligibility.blockedBy.includes(cur.matchId)) return "dependentBelow";
    return "lowest";
  };
  const up = can.up ? null : upReason();
  const down = can.down ? null : downReason();
  return { can, reason: { up, down, top: can.top ? null : up, bottom: can.bottom ? null : down } };
};

// The new queueOrder for a move, or null when the move isn't allowed.
export const reorderScheduled = (
  scheduled: ProjectedMatch[],
  matchId: string,
  move: ScheduleMove,
): string[] | null => {
  const i = scheduled.findIndex((pm) => pm.matchId === matchId);
  if (i < 0) return null;
  const can = scheduleMoveAvailability(scheduled, i);
  if (!can[move]) return null;

  const ids = scheduled.map((pm) => pm.matchId);
  const cur = scheduled[i];
  if (move === "up" || move === "down") {
    const j = move === "up" ? i - 1 : i + 1;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return ids;
  }

  // Tier bounds (pinned GF2 excluded from the waiting tier's movable range).
  const sameTier = (pm: ProjectedMatch) =>
    pm.eligibility.ready === cur.eligibility.ready && !pinnedLast(pm);
  const first = scheduled.findIndex(sameTier);
  let last = -1;
  scheduled.forEach((pm, k) => {
    if (sameTier(pm)) last = k;
  });
  ids.splice(i, 1);
  ids.splice(move === "top" ? first : last, 0, cur.matchId);
  return ids;
};

// "Move & Keep {mode}": the same move expressed as a relative pin over the mode's order
// (up → before the row above; down → after the row below; top/bottom → tier edge). Legality is
// exactly scheduleMoveAvailability's — a move that is refused in Manual is refused here too.
export const pinForMove = (
  scheduled: ProjectedMatch[],
  matchId: string,
  move: ScheduleMove,
): QueuePin | null => {
  const i = scheduled.findIndex((pm) => pm.matchId === matchId);
  if (i < 0 || !scheduleMoveAvailability(scheduled, i)[move]) return null;
  if (move === "up") return { matchId, place: "before", anchorId: scheduled[i - 1].matchId };
  if (move === "down") return { matchId, place: "after", anchorId: scheduled[i + 1].matchId };
  return { matchId, place: move };
};
