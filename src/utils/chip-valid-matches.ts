// src/utils/chip-valid-matches.ts
// THE authoritative "VALID FINISHED MATCH" for every Chip stat (pure, shared by the admin,
// spectator, player hub and engine dashboard).
//
// VALID FINISHED MATCH = exactly the matches that carry a tournament-wide Match # (see
// chip-match-numbers): a non-superseded result event (match_result, incl. Forfeit Match, or the
// mid-match Forfeit Tournament result) whose match is not live again, one per match. So it
// EXCLUDES: undone / restored-away results, voided matches (Clear Table / Remove Player /
// Return to Queue never log a result), legacy "finished" rows with no winner (the old Remove
// Table void), administrative table clears / removals, reset-waiting-timer rewrites, and any
// incomplete match.
//
// DURATION = match start (ChipMatch.startedAt — stamped at Start Match; an elapsed-preserving
// Restore re-derives it; "Reset Match Timer" deliberately restarts it) → the RESULT EVENT's time.
// Never the match record's endedAt ("Reset Waiting Timer" rewrites the holder's last win's
// endedAt). A match without a usable start has no duration (never invented).

import { ChipEvent, ChipMatch } from "../models/types/chip.types";
import { ChipMatchNumbering, numberChipMatches } from "./chip-match-numbers";

export interface ChipValidMatch {
  number: number; // tournament-wide Match #
  matchId: string | null;
  aId: string | null;
  bId: string | null;
  winnerId: string | null;
  loserId: string | null;
  tableId: string | null;
  completedAt: string;
  durationMs: number | null;
  forfeit: boolean;
}

// Valid finished matches, chronological (Match 1 first).
export const chipValidMatches = (
  chip: { events: ChipEvent[]; matches: ChipMatch[] },
  numbering: ChipMatchNumbering = numberChipMatches(chip),
): ChipValidMatch[] => {
  const byId = new Map(chip.matches.map((m) => [m.id, m]));
  return numbering.list.map((n) => {
    const m = n.matchId ? byId.get(n.matchId) : undefined;
    return {
      number: n.number,
      matchId: n.matchId,
      aId: m?.aId ?? n.winnerId,
      bId: m?.bId ?? n.loserId,
      winnerId: n.winnerId,
      loserId: n.loserId,
      tableId: n.tableId,
      completedAt: n.completedAt,
      durationMs: n.durationMs != null && n.durationMs > 0 ? n.durationMs : null,
      forfeit: n.forfeit,
    };
  });
};

export interface ChipMatchSummary {
  completed: number; // valid finished matches
  timed: number; // how many of them have a usable duration
  avgMatchMs: number | null;
  fastestMatchMs: number | null;
  longestMatchMs: number | null;
  tablesUsed: number; // distinct tables that hosted a valid finished match
  matchesPerTable: Map<string, number>;
  forfeits: number;
}

export const chipMatchSummary = (valid: ChipValidMatch[]): ChipMatchSummary => {
  const durations = valid.map((v) => v.durationMs).filter((d): d is number => d != null && d > 0);
  const perTable = new Map<string, number>();
  for (const v of valid) if (v.tableId) perTable.set(v.tableId, (perTable.get(v.tableId) ?? 0) + 1);
  return {
    completed: valid.length,
    timed: durations.length,
    avgMatchMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    fastestMatchMs: durations.length ? Math.min(...durations) : null,
    longestMatchMs: durations.length ? Math.max(...durations) : null,
    tablesUsed: perTable.size,
    matchesPerTable: perTable,
    forfeits: valid.filter((v) => v.forfeit).length,
  };
};

export interface ChipEntryMatch extends ChipValidMatch {
  opponentId: string | null;
  won: boolean;
}

// One entry's valid finished matches, NEWEST first.
export const chipEntryValidMatches = (valid: ChipValidMatch[], entryId: string): ChipEntryMatch[] =>
  valid
    .filter((v) => v.aId === entryId || v.bId === entryId)
    .map((v) => ({
      ...v,
      opponentId: v.aId === entryId ? v.bId : v.aId,
      won: v.winnerId === entryId,
    }))
    .reverse();

// Current streak from an entry's valid results (newest first) — every result counts (no cap).
export const chipCurrentStreak = (
  rowsNewestFirst: { won: boolean }[],
): { type: "win" | "loss" | "none"; count: number } => {
  if (!rowsNewestFirst.length) return { type: "none", count: 0 };
  const type = rowsNewestFirst[0].won ? "win" : "loss";
  let count = 0;
  for (const r of rowsNewestFirst) {
    if ((r.won ? "win" : "loss") !== type) break;
    count++;
  }
  return { type, count };
};
