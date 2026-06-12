// src/utils/queue.utils.ts
// Pure logic for Queue Manager: detect ready matches, derive wait time + bracket
// location, order the queue per the selected auto-assign mode, and plan table
// assignments. No React, no Supabase.
//
// Tournament-flow intent: in double elimination we don't run the bracket
// top-to-bottom. The Balanced mode always plays the LOWEST outstanding round
// first and interleaves winner/loser sides, so neither side gets rounds ahead of
// the other — matching how a TD actually opens loser-bracket matches as the
// winner bracket frees up players.

import {
  AutoAssignMode,
  GeneratedBracket,
  MatchLiveState,
} from "../models/types/tournament-settings.types";
import { TournamentTable } from "../models/types/tournament-table.types";
import { LiveMatch } from "./match.utils";

export const AUTO_ASSIGN_MODES: { value: AutoAssignMode; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "winnersFirst", label: "Winners First" },
  { value: "losersFirst", label: "Losers First" },
  { value: "longestWait", label: "Longest Waiting" },
  { value: "manual", label: "Manual" },
];

export interface QueueEntry {
  match: LiveMatch;
  readyAt: number | null; // epoch ms the match became playable
  waitMs: number;
  location: string; // chip text: "Winners R2", "Losers R1", "Hotseat", "Finals"
}

export interface AssignmentPlan {
  matchId: string;
  tableId: number;
}

// A match the TD can act on right now: both players known, not started, no table.
export const isReady = (m: LiveMatch): boolean =>
  m.status === "scheduled" && !m.pending && !m.bye && !m.empty && m.tableId == null;

export const bracketLocation = (m: LiveMatch): string => {
  if (m.side === "grand") return m.id === "GF2" ? "Finals (Reset)" : "Finals";
  if (m.label && m.label.toLowerCase().includes("hotseat")) return "Hotseat";
  return m.side === "winners" ? `Winners R${m.round}` : `Losers R${m.round}`;
};

// When each match became playable = max(completedAt of its feeder matches), or
// the draw time for round-1 (seed) slots. Null = a feeder isn't done yet (the
// match isn't ready). Built from the bracket graph + live match state.
export const computeReadyAtMap = (
  bracket: GeneratedBracket | null,
  matchState: Record<string, MatchLiveState>,
): Record<string, number | null> => {
  const map: Record<string, number | null> = {};
  if (!bracket?.graph) return map;
  const drawnAt = bracket.generatedAt ? Date.parse(bracket.generatedAt) : 0;
  const completedAt = (id: string): number | null => {
    const c = matchState[id]?.completedAt;
    return c ? Date.parse(c) : null;
  };

  for (const node of bracket.graph) {
    const times: number[] = [];
    let feederPending = false;
    for (const slot of [node.slot1, node.slot2]) {
      if (slot.kind === "empty") continue;
      if (slot.kind === "seed") {
        times.push(drawnAt);
      } else {
        const t = completedAt(slot.matchId);
        if (t == null) feederPending = true;
        else times.push(t);
      }
    }
    map[node.id] = feederPending ? null : times.length ? Math.max(...times) : drawnAt;
  }
  return map;
};

export const buildQueueEntries = (
  matches: LiveMatch[],
  readyAtMap: Record<string, number | null>,
  now: number,
): QueueEntry[] =>
  matches.filter(isReady).map((m) => {
    const readyAt = readyAtMap[m.id] ?? null;
    return {
      match: m,
      readyAt,
      waitMs: readyAt != null ? Math.max(0, now - readyAt) : 0,
      location: bracketLocation(m),
    };
  });

// ── Ordering ──────────────────────────────────────────────────────────────────
const byRoundThenWait = (a: QueueEntry, b: QueueEntry): number =>
  a.match.round - b.match.round || b.waitMs - a.waitMs;

// Balanced: grand finals first, then always the lowest outstanding round,
// interleaving winners/losers (loser side wins a dead-even tie so it keeps
// moving). This stops either side getting rounds ahead.
const balancedOrder = (
  grand: QueueEntry[],
  winners: QueueEntry[],
  losers: QueueEntry[],
): QueueEntry[] => {
  const out = [...grand];
  const w = [...winners];
  const l = [...losers];
  while (w.length || l.length) {
    if (!l.length) {
      out.push(w.shift() as QueueEntry);
      continue;
    }
    if (!w.length) {
      out.push(l.shift() as QueueEntry);
      continue;
    }
    const a = w[0];
    const b = l[0];
    let pickWinner: boolean;
    if (a.match.round !== b.match.round) pickWinner = a.match.round < b.match.round;
    else if (a.waitMs !== b.waitMs) pickWinner = a.waitMs >= b.waitMs;
    else pickWinner = false; // dead even → keep the loser side moving
    out.push(pickWinner ? (w.shift() as QueueEntry) : (l.shift() as QueueEntry));
  }
  return out;
};

const manualOrder = (
  entries: QueueEntry[],
  order: string[],
): QueueEntry[] => {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...entries].sort((a, b) => {
    const ra = rank.has(a.match.id) ? (rank.get(a.match.id) as number) : Infinity;
    const rb = rank.has(b.match.id) ? (rank.get(b.match.id) as number) : Infinity;
    // Items not in the manual order fall to the bottom by longest wait.
    return ra - rb || b.waitMs - a.waitMs;
  });
};

export const orderQueue = (
  entries: QueueEntry[],
  mode: AutoAssignMode,
  queueOrderIds: string[],
): QueueEntry[] => {
  const grand = entries.filter((e) => e.match.side === "grand").sort(byRoundThenWait);
  const winners = entries
    .filter((e) => e.match.side === "winners")
    .sort(byRoundThenWait);
  const losers = entries.filter((e) => e.match.side === "losers").sort(byRoundThenWait);

  switch (mode) {
    case "winnersFirst":
      return [...grand, ...winners, ...losers];
    case "losersFirst":
      return [...grand, ...losers, ...winners];
    case "longestWait":
      return [...entries].sort((a, b) => b.waitMs - a.waitMs);
    case "manual":
      return manualOrder(entries, queueOrderIds);
    case "balanced":
    default:
      return balancedOrder(grand, winners, losers);
  }
};

// Tables the TD can assign onto: not unavailable and not already hosting a match.
export const freeTables = (
  tables: TournamentTable[],
  occupancy: Record<number, unknown>,
): TournamentTable[] =>
  tables
    .filter((t) => t.status !== "unavailable" && !occupancy[t.id])
    .sort((a, b) => a.table_number - b.table_number);

// Pair the front of the ordered queue with free tables (lowest table number
// first). Only fills currently-free tables; never touches a playing match.
export const planAutoAssign = (
  ordered: QueueEntry[],
  available: TournamentTable[],
): AssignmentPlan[] => {
  const n = Math.min(ordered.length, available.length);
  const plan: AssignmentPlan[] = [];
  for (let i = 0; i < n; i++) {
    plan.push({ matchId: ordered[i].match.id, tableId: available[i].id });
  }
  return plan;
};

// "Waiting 18m" / "Waiting 1h 5m"
export const formatWait = (ms: number): string => {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
