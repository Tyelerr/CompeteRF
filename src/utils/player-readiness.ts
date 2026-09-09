// src/utils/player-readiness.ts
// ONE shared "is the field ready?" summary for the Players setup step, used by EVERY
// format (chip, single/double elim, scotch/team). Each format maps its own authoritative
// roster into ReadinessRow[] (chip via chipEntryLifecycle, elimination via deriveLifecycle)
// so the modal can never disagree with the Players screen's own counts.
//
// Blocking vs informational:
//   • The ONLY warning condition is notReady > 0.
//   • Entry-fee-unpaid, no-shows, waiting-for-partner are shown to inform the TD.
//   • Optional side-pot participation is informational ONLY — it never makes a player
//     "not ready" and never triggers the modal.

import { LifecycleStatus } from "./registration-lifecycle";

export interface ReadinessRow {
  status: LifecycleStatus; // authoritative lifecycle status (ready/registered/prereg/waiting/no_show/removed)
  paid: boolean; // entry fee collected
  entryFeeRequired: boolean; // does this tournament charge an entry fee
  inAnySidePot?: boolean; // optional/informational
}

export interface PlayerReadinessSummary {
  entityLabel: string; // "Players" | "Teams"
  entitySingular: string; // "Player" | "Team"
  total: number; // playable entities (excludes Removed/cancelled)
  ready: number;
  notReady: number;
  unpaid: number; // entry fees unpaid (informational)
  noShows: number; // informational
  waitingForPartner: number; // team formats (informational)
  sidePotNotEntered: number | null; // informational; null when the format has no side pots
}

export const buildReadinessSummary = (
  rows: ReadinessRow[],
  isTeam: boolean,
  hasSidePots: boolean,
): PlayerReadinessSummary => {
  // "Removed"/cancelled entries are gone — not part of the playable field.
  const playable = rows.filter((r) => r.status !== "removed");
  const ready = playable.filter((r) => r.status === "ready").length;
  const noShows = playable.filter((r) => r.status === "no_show").length;
  const waitingForPartner = playable.filter((r) => r.status === "waiting").length;
  const total = playable.length;
  const notReady = total - ready;
  const unpaid = playable.filter(
    (r) => r.status !== "ready" && r.entryFeeRequired && !r.paid,
  ).length;
  const sidePotNotEntered = hasSidePots
    ? playable.filter((r) => r.inAnySidePot === false).length
    : null;

  return {
    entityLabel: isTeam ? "Teams" : "Players",
    entitySingular: isTeam ? "Team" : "Player",
    total,
    ready,
    notReady,
    unpaid,
    noShows,
    waitingForPartner,
    sidePotNotEntered,
  };
};

// The ONLY blocking-ish condition (it doesn't hard-block; it just warns).
export const needsReadinessWarning = (s: PlayerReadinessSummary): boolean =>
  s.notReady > 0;
