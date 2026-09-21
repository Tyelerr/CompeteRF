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
