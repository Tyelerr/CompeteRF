// src/models/services/chip.engine.ts
// Pure core logic for the Chip Tournament format — a live winner-stays chip queue
// (NOT a bracket). Every function takes a ChipState and returns a NEW ChipState;
// inputs are never mutated. UI/persistence live elsewhere. See CHIP_TOURNAMENT.md.
//
// Rules implemented here:
//  • Winner stays; loser loses one chip. Chips left → back of queue; zero → out.
//  • Table-specific anti-repeat: the just-beaten player is skipped for the NEXT
//    challenger on that same table only.
//  • Manual reshuffle = full reset (random tables + queue, ignore streaks/anti-repeat).
//  • Last entry standing wins.

import {
  ChipDashboard,
  ChipEntry,
  ChipEvent,
  ChipEventType,
  ChipFormat,
  ChipMatch,
  ChipState,
  ChipTable,
  ChipTier,
} from "../types/chip.types";

// ── ids / clone ──────────────────────────────────────────────────────────────
let idSeq = 0;
export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

// The chip blob is plain JSON, so a structural clone keeps these functions pure
// without sharing references back into React state.
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const shuffle = <T>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ── small helpers ─────────────────────────────────────────────────────────────
export const teamName = (e: ChipEntry): string =>
  e.p2Name && e.p2Name.trim()
    ? `${e.p1Name.trim()} / ${e.p2Name.trim()}`
    : e.p1Name.trim() || "—";

export const teamFargoOf = (
  e: Pick<ChipEntry, "p1Fargo" | "p2Fargo">,
  format: ChipFormat,
): number | null => {
  if (format === "scotch_doubles") {
    if (e.p1Fargo == null && e.p2Fargo == null) return null;
    return (e.p1Fargo ?? 0) + (e.p2Fargo ?? 0);
  }
  return e.p1Fargo ?? null;
};

// Chips for a (team) Fargo from the customizable tier table. Tiers are matched by
// [minFargo, maxFargo]; an unrated entry falls to the lowest tier (most chips).
export const chipsForFargo = (
  tiers: ChipTier[],
  fargo: number | null,
): number => {
  if (!tiers.length) return 0;
  const sorted = [...tiers].sort((a, b) => b.minFargo - a.minFargo);
  if (fargo == null) return sorted[sorted.length - 1].chips; // unrated = lowest tier
  for (const t of sorted) {
    const underMax = t.maxFargo == null || fargo <= t.maxFargo;
    if (fargo >= t.minFargo && underMax) return t.chips;
  }
  return sorted[sorted.length - 1].chips;
};

const entryById = (s: ChipState, id: string | null | undefined) =>
  s.entries.find((e) => e.id === id) ?? null;

const pushEvent = (
  s: ChipState,
  type: ChipEventType,
  text: string,
  by?: number | null,
  payload?: Record<string, unknown>,
): void => {
  const ev: ChipEvent = { id: newId("ev"), type, text, at: new Date().toISOString(), by: by ?? null, payload };
  s.events.unshift(ev); // newest first
};

const aliveEntries = (s: ChipState): ChipEntry[] =>
  s.entries.filter((e) => e.status !== "eliminated");

// ── factory ──────────────────────────────────────────────────────────────────
export const emptyChipState = (format: ChipFormat): ChipState => ({
  settings: {
    format,
    tiers: [],
    buyBacksAllowed: false,
  },
  entries: [],
  tables: [],
  matches: [],
  queue: [],
  events: [],
  reshuffleCount: 0,
});

// ── seating ──────────────────────────────────────────────────────────────────
// Pull the front-most queued entry that is NOT the table's just-beaten player
// (table-specific anti-repeat). Returns the entry id and removes it from queue.
const takeChallenger = (s: ChipState, table: ChipTable): string | null => {
  const blocked = table.lastLoserId ?? null;
  let idx = s.queue.findIndex((id) => id !== blocked);
  if (idx === -1) {
    // Only the blocked player is available — leave the table open rather than force
    // an immediate rematch (the holder waits for someone else to requeue).
    if (s.queue.length === 0) return null;
    return null;
  }
  const [id] = s.queue.splice(idx, 1);
  return id;
};

const takeAny = (s: ChipState): string | null =>
  s.queue.length ? (s.queue.shift() as string) : null;

const startMatch = (
  s: ChipState,
  table: ChipTable,
  aId: string,
  bId: string,
): void => {
  const m: ChipMatch = {
    id: newId("m"),
    tableId: table.id,
    aId,
    bId,
    startedAt: new Date().toISOString(),
    status: "in_progress",
  };
  s.matches.push(m);
  table.matchId = m.id;
  table.status = "in_use";
  table.holderId = null;
  for (const id of [aId, bId]) {
    const e = entryById(s, id);
    if (e) {
      e.status = "playing";
      e.tableId = table.id;
    }
  }
};

// Seat every fillable table: a table holding a winner gets one challenger (anti-
// repeat aware); a fully-open table gets two fresh players from the queue.
const seatAllTables = (s: ChipState): void => {
  let progressed = true;
  // Loop until no table can be seated (a freed challenger may enable another).
  while (progressed) {
    progressed = false;
    for (const table of s.tables) {
      if (table.matchId) continue; // already playing
      if (table.holderId) {
        const challenger = takeChallenger(s, table);
        if (challenger) {
          startMatch(s, table, table.holderId, challenger);
          progressed = true;
        }
      } else {
        if (s.queue.length >= 2) {
          const a = takeAny(s)!;
          const b = takeAny(s)!;
          table.lastLoserId = null; // fresh seat, no anti-repeat carry-over
          startMatch(s, table, a, b);
          progressed = true;
        }
      }
    }
  }
};

// ── start ────────────────────────────────────────────────────────────────────
// Assign chips from the tier table, shuffle the checked-in entries onto tables,
// queue the rest, and open the first matches.
export const startChipTournament = (input: ChipState): ChipState => {
  const s = clone(input);
  const playing = s.entries.filter((e) => e.checkedIn);
  for (const e of playing) {
    const tf = teamFargoOf(e, s.settings.format);
    e.teamFargo = tf;
    e.startChips = chipsForFargo(s.settings.tiers, tf);
    e.chips = e.startChips;
    e.wins = 0;
    e.losses = 0;
    e.streak = 0;
    e.bestStreak = 0;
    e.eliminations = 0;
    e.status = "queued";
    e.tableId = null;
    e.eliminatedAt = null;
  }
  for (const t of s.tables) {
    t.status = "open";
    t.matchId = null;
    t.holderId = null;
    t.lastLoserId = null;
  }
  s.matches = [];
  s.queue = shuffle(playing).map((e) => e.id);
  s.startedAt = new Date().toISOString();
  s.finishedAt = null;
  s.winnerId = null;
  seatAllTables(s);
  pushEvent(s, "manual", `Tournament started · ${playing.length} entries`);
  return s;
};

// ── record a winner ──────────────────────────────────────────────────────────
export const recordWinner = (
  input: ChipState,
  matchId: string,
  winnerId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const match = s.matches.find((m) => m.id === matchId);
  if (!match || match.status !== "in_progress") return input;
  const loserId = match.aId === winnerId ? match.bId : match.aId;
  const winner = entryById(s, winnerId);
  const loser = entryById(s, loserId);
  const table = s.tables.find((t) => t.id === match.tableId);
  if (!winner || !loser || !table) return input;

  match.winnerId = winnerId;
  match.loserId = loserId;
  match.endedAt = new Date().toISOString();
  match.status = "finished";

  winner.wins += 1;
  winner.streak += 1;
  winner.bestStreak = Math.max(winner.bestStreak, winner.streak);

  loser.losses += 1;
  loser.streak = 0;
  loser.chips = Math.max(0, loser.chips - 1);

  pushEvent(s, "match_result", `${teamName(winner)} beat ${teamName(loser)} (${table.label})`, by, { matchId });
  pushEvent(s, "chip_loss", `${teamName(loser)} lost a chip → ${loser.chips} left`, by);

  // Winner stays on the table; loser is requeued or eliminated.
  table.matchId = null;
  table.holderId = winnerId;
  table.status = "open";
  table.lastLoserId = loserId; // anti-repeat: skip the loser next on THIS table
  winner.tableId = table.id;

  if (loser.chips <= 0) {
    loser.status = "eliminated";
    loser.eliminatedAt = new Date().toISOString();
    loser.tableId = null;
    winner.eliminations += 1;
    pushEvent(s, "elimination", `${teamName(winner)} eliminated ${teamName(loser)}`, by);
  } else {
    loser.status = "queued";
    loser.tableId = null;
    s.queue.push(loserId); // back of the queue
  }

  seatAllTables(s);

  // Win condition: one entry left standing.
  const alive = aliveEntries(s);
  if (alive.length === 1) {
    s.winnerId = alive[0].id;
    s.finishedAt = new Date().toISOString();
    for (const t of s.tables) {
      t.matchId = null;
      t.holderId = null;
      t.status = "open";
    }
    alive[0].status = "queued";
    pushEvent(s, "manual", `${teamName(alive[0])} wins the tournament! 🏆`, by);
  }
  return s;
};

// ── forfeit (counts as a loss for the forfeiting entry) ───────────────────────
export const forfeitMatch = (
  input: ChipState,
  matchId: string,
  forfeitingEntryId: string,
  by?: number | null,
): ChipState => {
  const match = input.matches.find((m) => m.id === matchId);
  if (!match) return input;
  const winnerId = match.aId === forfeitingEntryId ? match.bId : match.aId;
  const s = recordWinner(input, matchId, winnerId, by);
  // tag the most recent match_result as a forfeit for the timeline
  const fEntry = s.entries.find((e) => e.id === forfeitingEntryId);
  if (fEntry) pushEventInPlace(s, "forfeit", `${teamName(fEntry)} forfeited`, by);
  return s;
};

// recordWinner already cloned; this appends without another clone.
const pushEventInPlace = (
  s: ChipState,
  type: ChipEventType,
  text: string,
  by?: number | null,
): ChipState => {
  pushEvent(s, type, text, by);
  return s;
};

// ── manual chip adjustments ───────────────────────────────────────────────────
export const adjustChips = (
  input: ChipState,
  entryId: string,
  delta: number,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const e = entryById(s, entryId);
  if (!e) return input;
  e.chips = Math.max(0, e.chips + delta);
  pushEvent(s, "chip_adjust", `${teamName(e)} ${delta > 0 ? "+" : ""}${delta} chip → ${e.chips}`, by);
  if (e.chips <= 0 && e.status === "queued") {
    e.status = "eliminated";
    e.eliminatedAt = new Date().toISOString();
    s.queue = s.queue.filter((id) => id !== entryId);
    pushEvent(s, "elimination", `${teamName(e)} eliminated`, by);
  }
  return s;
};

// Buy a previously-eliminated player back into the tournament (TD action, only
// when buy-backs are allowed). They re-enter the back of the queue with fresh
// chips (defaults to their starting chips) and are no longer eliminated.
export const buyBackEntry = (
  input: ChipState,
  entryId: string,
  chips?: number,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const e = entryById(s, entryId);
  if (!e || e.status !== "eliminated") return input;
  e.chips = chips != null && chips > 0 ? chips : e.startChips || 1;
  e.status = "queued";
  e.eliminatedAt = null;
  e.streak = 0;
  if (!s.queue.includes(entryId)) s.queue.push(entryId);
  s.finishedAt = null;
  s.winnerId = null;
  pushEvent(s, "manual", `${teamName(e)} bought back in (${e.chips} chips)`, by);
  seatAllTables(s);
  return s;
};

// ── reshuffle (full reset) ────────────────────────────────────────────────────
// Assumes current matches have finished. Randomly rebuilds tables + queue and
// clears streaks/anti-repeat. Chips, records, and eliminations are preserved.
export const reshuffle = (input: ChipState, by?: number | null): ChipState => {
  const s = clone(input);
  const alive = aliveEntries(s);
  for (const e of alive) {
    e.status = "queued";
    e.tableId = null;
    e.streak = 0;
  }
  for (const t of s.tables) {
    t.status = "open";
    t.matchId = null;
    t.holderId = null;
    t.lastLoserId = null;
  }
  // Drop any lingering in-progress matches (should be none if matches finished).
  s.matches = s.matches.filter((m) => m.status !== "in_progress");
  s.queue = shuffle(alive).map((e) => e.id);
  s.reshuffleCount = (s.reshuffleCount ?? 0) + 1;
  pushEvent(s, "shuffle", `Reshuffle #${s.reshuffleCount} · ${alive.length} entries`, by);
  seatAllTables(s);
  return s;
};

// ── tables ────────────────────────────────────────────────────────────────────
export const addTable = (input: ChipState, by?: number | null): ChipState => {
  const s = clone(input);
  const label = `Table ${s.tables.length + 1}`;
  s.tables.push({ id: newId("t"), label, isStream: false, status: "open", matchId: null });
  pushEvent(s, "table_added", `Added ${label}`, by);
  if (s.startedAt && !s.finishedAt) seatAllTables(s);
  return s;
};

export const removeTable = (
  input: ChipState,
  tableId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const table = s.tables.find((t) => t.id === tableId);
  if (!table) return input;
  // Requeue anyone seated/holding at this table (their match, if any, is voided).
  const m = s.matches.find((mm) => mm.id === table.matchId && mm.status === "in_progress");
  const ids = new Set<string>();
  if (table.holderId) ids.add(table.holderId);
  if (m) {
    m.status = "finished";
    m.endedAt = new Date().toISOString();
    ids.add(m.aId);
    ids.add(m.bId);
  }
  for (const id of ids) {
    const e = entryById(s, id);
    if (e && e.status !== "eliminated") {
      e.status = "queued";
      e.tableId = null;
      if (!s.queue.includes(id)) s.queue.unshift(id);
    }
  }
  s.tables = s.tables.filter((t) => t.id !== tableId);
  pushEvent(s, "table_removed", `Removed ${table.label}`, by);
  if (s.startedAt && !s.finishedAt) seatAllTables(s);
  return s;
};

// ── derived snapshots (never persisted) ───────────────────────────────────────
export const dashboard = (s: ChipState): ChipDashboard => {
  const alive = aliveEntries(s);
  const eliminated = s.entries.filter((e) => e.status === "eliminated");
  const finished = s.matches.filter((m) => m.status !== "in_progress" && m.endedAt);
  const durations = finished
    .map((m) => (m.endedAt ? new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime() : 0))
    .filter((d) => d > 0);
  const byChips = [...alive].sort((a, b) => b.chips - a.chips);
  const byStreak = [...alive].sort((a, b) => b.streak - a.streak);
  const byElim = [...s.entries].sort((a, b) => b.eliminations - a.eliminations);
  return {
    playersRemaining: alive.length,
    eliminated: eliminated.length,
    queueCount: s.queue.length,
    activeTables: s.tables.filter((t) => t.matchId).length,
    matchesPlayed: finished.length,
    avgMatchMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    longestMatchMs: durations.length ? Math.max(...durations) : null,
    chipLeaderId: byChips[0]?.chips ? byChips[0].id : null,
    hotStreakId: byStreak[0]?.streak ? byStreak[0].id : null,
    eliminationLeaderId: byElim[0]?.eliminations ? byElim[0].id : null,
    lastChipIds: alive.filter((e) => e.chips === 1).map((e) => e.id),
    finalFour: alive.length === 4,
  };
};

// Elapsed milliseconds for a match (compute locally; never store per-second).
export const matchElapsedMs = (m: ChipMatch, now: number): number => {
  const start = new Date(m.startedAt).getTime();
  const end = m.endedAt ? new Date(m.endedAt).getTime() : now;
  return Math.max(0, end - start);
};

// A match running longer than this flags the table (and player rows) red.
export const LONG_MATCH_MS = 10 * 60 * 1000;
