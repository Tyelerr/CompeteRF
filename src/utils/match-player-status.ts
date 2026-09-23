// src/utils/match-player-status.ts
// Turning match_player_status rows into what the UI shows. Pure.
//
// A row only counts for the assignment it was written against: same match AND same assignedAt
// (and same draw). That is what stops an old check-in from showing on a new table assignment —
// after Clear Table, a reassignment or a redraw, the current assignment simply has no row yet.
import { MatchPlayerGlyph, MatchPlayerStatus } from "../models/types/match-checkin.types";

const sameInstant = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && Date.parse(a) === Date.parse(b);

/** The row for one player on the match's CURRENT assignment, or null. */
export const statusForAssignment = (
  rows: MatchPlayerStatus[] | null | undefined,
  args: { matchId: string; registrationId: number | null | undefined; assignedAt: string | null | undefined },
): MatchPlayerStatus | null => {
  if (!rows?.length || args.registrationId == null || !args.assignedAt) return null;
  return (
    rows.find(
      (r) =>
        r.match_id === args.matchId &&
        Number(r.registration_id) === Number(args.registrationId) &&
        sameInstant(r.assigned_at, args.assignedAt),
    ) ?? null
  );
};

/**
 * ○ not checked in · ✓ checked in · ? raised an issue (issue wins — it needs attention).
 * Returns null when the match has no current assignment: an unassigned or finished match shows
 * no glyph at all.
 */
export const glyphFor = (
  rows: MatchPlayerStatus[] | null | undefined,
  args: {
    matchId: string;
    registrationId: number | null | undefined;
    assignedAt: string | null | undefined;
    status?: string | null;
  },
): MatchPlayerGlyph | null => {
  if (!args.assignedAt || args.registrationId == null) return null;
  if (args.status === "completed") return null;
  const row = statusForAssignment(rows, args);
  if (row?.issue_at && !row.resolved_at) return "issue";
  return row?.checked_in_at ? "checked_in" : "not_checked_in";
};

/** Index rows by match id, for a single pass over the TD's match list. */
export const byMatchId = (rows: MatchPlayerStatus[] | null | undefined): Record<string, MatchPlayerStatus[]> => {
  const out: Record<string, MatchPlayerStatus[]> = {};
  for (const r of rows ?? []) (out[r.match_id] ??= []).push(r);
  return out;
};
