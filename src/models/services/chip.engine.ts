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
  ChipEntrySnapshot,
  ChipEvent,
  ChipEventType,
  ChipFormat,
  ChipMatch,
  ChipMatchSnapshot,
  ChipRestorePoint,
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
// A team is eligible to be SEATED (pulled from the queue) during a shuffle round
// only if it's still on the round-remaining list. Outside a round, anyone queued
// is eligible. Marking "seated" = removing the id from roundRemaining.
const roundSeatable = (s: ChipState, id: string): boolean =>
  !s.shuffleRound || (s.roundRemaining?.includes(id) ?? false);
const roundSeat = (s: ChipState, id: string): void => {
  if (s.roundRemaining) s.roundRemaining = s.roundRemaining.filter((x) => x !== id);
};

// Pull the front-most queued entry that is NOT the table's just-beaten player
// (table-specific anti-repeat) and, in a round, is still on roundRemaining.
const takeChallenger = (s: ChipState, table: ChipTable): string | null => {
  const blocked = table.lastLoserId ?? null;
  const idx = s.queue.findIndex((id) => id !== blocked && roundSeatable(s, id));
  if (idx === -1) return null; // no eligible challenger → the holder waits
  const [id] = s.queue.splice(idx, 1);
  return id;
};

// Two fresh queued teams (round-aware: only round-remaining teams during a round).
const takePair = (s: ChipState): [string, string] | null => {
  const i1 = s.queue.findIndex((id) => roundSeatable(s, id));
  if (i1 === -1) return null;
  const a = s.queue.splice(i1, 1)[0];
  const i2 = s.queue.findIndex((id) => roundSeatable(s, id));
  if (i2 === -1) {
    s.queue.unshift(a); // need two — put the first back
    return null;
  }
  const b = s.queue.splice(i2, 1)[0];
  return [a, b];
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
    roundSeat(s, id); // this team has now had its turn this round
  }
};

// Seat every fillable table: a table holding a winner gets one challenger (anti-
// repeat aware); a fully-open table gets two fresh players from the queue. During
// a shuffle round only not-yet-played teams are seated, so every survivor gets
// exactly one turn before the round drains.
const seatAllTables = (s: ChipState): void => {
  // A pending reshuffle freezes seating — matches finish, nobody new is seated.
  if (s.reshufflePending) return;
  let progressed = true;
  // Loop until no table can be seated (a freed challenger may enable another).
  while (progressed) {
    progressed = false;
    for (const table of s.tables) {
      if (table.inactive || table.closing || table.locked) continue; // not receiving new matches
      if (table.matchId) continue; // already playing
      if (table.pendingChallengerId) continue; // assigned, awaiting Start Match
      if (table.holderId) {
        const challenger = takeChallenger(s, table);
        if (challenger) {
          if (s.shuffleRound) {
            // In a round, the winner-stays rotation runs automatically (no Start
            // Match gate) so teams cycle through and the last match finishes live.
            startMatch(s, table, table.holderId, challenger);
          } else {
            // Normal play: assign but wait for the TD to tap Start Match (0:00).
            table.pendingChallengerId = challenger;
            const ce = entryById(s, challenger);
            if (ce) {
              ce.status = "playing";
              ce.tableId = table.id;
            }
            roundSeat(s, challenger);
          }
          progressed = true;
        }
      } else {
        const pair = takePair(s);
        if (pair) {
          const [a, b] = pair;
          table.lastLoserId = null; // fresh seat, no anti-repeat carry-over
          startMatch(s, table, a, b);
          progressed = true;
        }
      }
    }
  }
};

// Release a table's pending (assigned-but-not-started) challenger back to the
// front of the queue — used when the table is cleared/closed/reshuffled.
const releasePending = (s: ChipState, t: ChipTable): void => {
  if (!t.pendingChallengerId) return;
  const e = entryById(s, t.pendingChallengerId);
  if (e && e.status !== "eliminated") {
    e.status = "queued";
    e.tableId = null;
    if (!s.queue.includes(e.id)) s.queue.unshift(e.id);
  }
  t.pendingChallengerId = null;
};

// Begin draining the board: send any waiting winner (and assigned-but-not-started
// challenger) back to the queue, freeze new seating, and let live matches finish.
// If nothing is in progress it jumps straight to "ready to shuffle". Used both to
// start a cycle (Begin Shuffle) and when a round finishes rotating everyone.
const startDrain = (
  s: ChipState,
  by?: number | null,
  reason: "initial" | "round" = "initial",
): void => {
  s.reshufflePending = true;
  s.shuffleReady = false;
  s.shuffleRound = false;
  s.roundRemaining = [];
  for (const t of s.tables) {
    if (t.inactive || t.matchId) continue;
    releasePending(s, t);
    if (t.holderId) {
      const h = entryById(s, t.holderId);
      if (h) {
        h.status = "queued";
        h.tableId = null;
        if (!s.queue.includes(h.id)) s.queue.unshift(h.id);
      }
      t.holderId = null;
      t.lastLoserId = null;
      t.status = "open";
    }
  }
  const live = s.matches.filter((m) => m.status === "in_progress").length;
  if (live === 0) {
    s.shuffleReady = true;
    pushEvent(s, "shuffle", reason === "round" ? "Round complete — ready to shuffle" : "All tables cleared — ready to shuffle", by);
  } else {
    pushEvent(
      s,
      "shuffle",
      reason === "round"
        ? `Round complete — finishing ${live} match${live === 1 ? "" : "es"}`
        : `Shuffle started — waiting on ${live} match${live === 1 ? "" : "es"} to finish`,
      by,
    );
  }
};

// Invariant guard: while a shuffle cycle is DRAINING, once no live match remains
// the board MUST be "ready to shuffle" — no matter how the last match ended
// (Complete Match, Forfeit, Eliminate, Clear Table, Remove Table, …). Without
// this, ending the final draining match via any path other than recordWinner
// would freeze the board (seating stays frozen, tables idle, no Start Shuffle).
// Idempotent and returns the input unchanged when there's nothing to settle.
export const settleShuffleDrain = (input: ChipState): ChipState => {
  if (!input.reshufflePending || input.shuffleReady) return input;
  if (input.matches.some((m) => m.status === "in_progress")) return input;
  const s = clone(input);
  // The drain is done — clear any leftover holder/pending back to the queue.
  for (const t of s.tables) {
    if (t.matchId) continue;
    releasePending(s, t);
    if (t.holderId) {
      const h = entryById(s, t.holderId);
      if (h && h.status !== "eliminated") {
        h.status = "queued";
        h.tableId = null;
        if (!s.queue.includes(h.id)) s.queue.unshift(h.id);
      }
      t.holderId = null;
      t.lastLoserId = null;
      t.status = "open";
    }
  }
  s.shuffleReady = true;
  pushEvent(s, "shuffle", "Round complete — ready to shuffle");
  return s;
};

// Recovery guard (run on load + after a restore): void any "in_progress" match
// that can never resolve, AND clear any table pointing at a match that is gone or
// no longer live. Both leave the card blank and (worst) wedge a shuffle drain so
// it never settles. We drop ghost matches, requeue their alive teams, and clear
// dangling table references. Returns input unchanged when nothing needs fixing.
export const reconcileMatches = (input: ChipState): ChipState => {
  // A VALID live match must be seated on an ACTIVE table that still points back to
  // it, with both teams present and marked "playing". Anything else is a ghost:
  //   • a participant eliminated / missing / re-projected back to the queue, or
  //   • its table is inactive, missing, or has moved on to another match.
  // A ghost can't be finished from the UI and (worse) can wedge a shuffle drain.
  const badTeam = (id: string) => {
    const e = input.entries.find((x) => x.id === id);
    return !e || e.status !== "playing";
  };
  const isGhost = (m: ChipMatch): boolean => {
    if (m.status !== "in_progress") return false;
    const t = input.tables.find((x) => x.id === m.tableId);
    if (!t || t.inactive || t.matchId !== m.id) return true;
    return badTeam(m.aId) || badTeam(m.bId);
  };
  const orphanIds = new Set(input.matches.filter(isGhost).map((m) => m.id));
  // Matches that stay genuinely live once ghosts are voided.
  const liveIds = new Set(
    input.matches.filter((m) => m.status === "in_progress" && !orphanIds.has(m.id)).map((m) => m.id),
  );
  // A table whose matchId points at a match that is gone / finished / voided — a
  // dangling reference (e.g. left by a restore) that shows an empty-but-busy table.
  const hasDangling = input.tables.some((t) => !!t.matchId && !liveIds.has(t.matchId));
  if (orphanIds.size === 0 && !hasDangling) return input;
  const s = clone(input);
  const clearedTables = new Set<string>();
  for (const m of s.matches) {
    if (!orphanIds.has(m.id)) continue;
    for (const id of [m.aId, m.bId]) {
      const e = entryById(s, id);
      if (e && e.status !== "eliminated") {
        e.status = "queued";
        e.tableId = null;
        if (!s.queue.includes(id)) s.queue.push(id);
      }
    }
    // Only clear a table that STILL points at this ghost — never one that has
    // since moved on to a valid match (its stale tableId must not evict a good match).
    const t = s.tables.find((x) => x.matchId === m.id);
    if (t) clearedTables.add(t.id);
  }
  s.matches = s.matches.filter((m) => !orphanIds.has(m.id));
  const liveNow = new Set(s.matches.filter((m) => m.status === "in_progress").map((m) => m.id));
  for (const t of s.tables) {
    if (clearedTables.has(t.id)) {
      // Ghost-match table: its teams were requeued — fully open it.
      t.matchId = null;
      t.holderId = null;
      t.pendingChallengerId = null;
      t.status = "open";
    } else if (t.matchId && !liveNow.has(t.matchId)) {
      // Dangling reference: clear it, but keep a genuine staying winner as holder.
      t.matchId = null;
      t.pendingChallengerId = null;
      const h = t.holderId ? entryById(s, t.holderId) : null;
      if (!h || h.status === "eliminated") t.holderId = null;
      t.status = "open";
    }
  }
  return s;
};

// Recovery guard (run on load): every ALIVE team must be somewhere — in a live
// match, holding/pending a table, or in the queue. Re-attach any alive team that
// fell out (e.g. a stale/failed queue save), and drop queue ids that are
// eliminated, unknown, or already seated on a table. Returns input unchanged when
// the queue is already consistent.
export const reconcileQueue = (input: ChipState): ChipState => {
  const onTable = new Set<string>();
  for (const t of input.tables) {
    if (t.holderId) onTable.add(t.holderId);
    if (t.pendingChallengerId) onTable.add(t.pendingChallengerId);
  }
  for (const m of input.matches) if (m.status === "in_progress") { onTable.add(m.aId); onTable.add(m.bId); }
  const isQueueable = (id: string) => {
    const e = input.entries.find((x) => x.id === id);
    return !!e && e.status !== "eliminated" && !onTable.has(id);
  };
  const pruned = input.queue.filter(isQueueable);
  const inQueue = new Set(pruned);
  const orphans: string[] = [];
  for (const e of input.entries) {
    if (e.status === "eliminated" || onTable.has(e.id) || inQueue.has(e.id)) continue;
    orphans.push(e.id);
  }
  if (orphans.length === 0 && pruned.length === input.queue.length) return input; // already consistent
  const s = clone(input);
  s.queue = [...pruned, ...orphans];
  // Keep entry statuses coherent with where they actually are.
  for (const e of s.entries) {
    if (e.status === "eliminated") continue;
    if (onTable.has(e.id)) continue;
    if (e.status !== "queued") { e.status = "queued"; e.tableId = null; }
  }
  return s;
};

// ── restore points (persisted tournament history) ─────────────────────────────
// Keep the last N restore points so the blob stays bounded. Realistic chip events
// stay well under this; older points simply become non-restorable from the log.
const RESTORE_CAP = 60;

// Strip any accumulated "Undo:/Redo:/Restored:" prefixes from an action label.
const stripPrefix = (s: string): string => {
  let out = s;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/^\s*(undo|redo|reverted|restored|restore)(\s+action)?\s*:\s*/i, "").trim();
  } while (out !== prev);
  return out || "the last action";
};

const liteEntry = (e: ChipEntry): ChipEntrySnapshot => ({
  id: e.id,
  chips: e.chips,
  status: e.status,
  tableId: e.tableId ?? null,
  wins: e.wins,
  losses: e.losses,
  streak: e.streak,
  bestStreak: e.bestStreak,
  eliminations: e.eliminations,
  eliminatedAt: e.eliminatedAt ?? null,
});

// Capture the PRE-action live state as a restore point (call with the state
// BEFORE the action ran). eventIds/label describe what that action logged.
// Live matches are captured WITH their elapsed time so a restore brings the timer
// back to what it read at this moment (not 0:00, not the full real time since).
export const makeRestorePoint = (
  pre: ChipState,
  eventIds: string[],
  label: string,
): ChipRestorePoint => {
  const now = Date.now();
  const liveMatches: ChipMatchSnapshot[] = pre.matches
    .filter((m) => m.status === "in_progress")
    .map((m) => ({
      id: m.id,
      tableId: m.tableId,
      aId: m.aId,
      bId: m.bId,
      status: m.status,
      elapsedMs: Math.max(0, now - new Date(m.startedAt).getTime()),
      winnerId: m.winnerId ?? null,
      loserId: m.loserId ?? null,
    }));
  return {
    primaryEventId: eventIds[0],
    eventIds,
    at: new Date(now).toISOString(),
    label: stripPrefix(label),
    snapshot: {
      entries: pre.entries.map(liteEntry),
      tables: clone(pre.tables),
      queue: [...pre.queue],
      matches: liveMatches,
      startedAt: pre.startedAt ?? null,
      finishedAt: pre.finishedAt ?? null,
      winnerId: pre.winnerId ?? null,
      reshuffleCount: pre.reshuffleCount ?? 0,
      reshufflePending: !!pre.reshufflePending,
      reshuffleTableCount: pre.reshuffleTableCount ?? null,
      shuffleMode: !!pre.shuffleMode,
      shuffleReady: !!pre.shuffleReady,
      shuffleRound: !!pre.shuffleRound,
      roundRemaining: [...(pre.roundRemaining ?? [])],
    },
  };
};

// Append a restore point (capped) to a post-action state. Live tournaments only.
export const withRestorePoint = (
  next: ChipState,
  pre: ChipState,
  eventIds: string[],
  label: string,
): ChipState => {
  if (!eventIds.length || !pre.startedAt) return next;
  const rp = makeRestorePoint(pre, eventIds, label);
  const points = [...(next.restorePoints ?? []), rp];
  return { ...next, restorePoints: points.slice(-RESTORE_CAP) };
};

export interface RestoreMeta {
  reason: string;
  actorId?: number | null;
  actorName?: string | null;
}
// Roll the whole tournament back to just before the action whose primary event is
// `eventId` — reverting that action and everything after it. History is PRESERVED:
// reverted events stay (marked superseded), a "Tournament Restored" event is
// logged, and the now-inactive restore points are dropped.
export const restoreToPoint = (
  input: ChipState,
  eventId: string,
  meta: RestoreMeta,
): ChipState => {
  const rps = input.restorePoints ?? [];
  const idx = rps.findIndex((r) => r.primaryEventId === eventId || r.eventIds.includes(eventId));
  if (idx < 0) return input;
  const s = clone(input);
  const rp = rps[idx];
  const reverted = rps.slice(idx); // this action + everything newer
  const revertedIds = new Set(reverted.flatMap((r) => r.eventIds));
  const snap = rp.snapshot;

  // Restore the mutable entry fields (names/Fargo/registration come from current).
  const byId = new Map(snap.entries.map((e) => [e.id, e]));
  for (const e of s.entries) {
    const l = byId.get(e.id);
    if (!l) continue;
    e.chips = l.chips;
    e.status = l.status;
    e.tableId = l.tableId;
    e.wins = l.wins;
    e.losses = l.losses;
    e.streak = l.streak;
    e.bestStreak = l.bestStreak;
    e.eliminations = l.eliminations;
    e.eliminatedAt = l.eliminatedAt;
  }
  s.tables = clone(snap.tables);
  s.queue = [...snap.queue];
  s.startedAt = snap.startedAt;
  s.finishedAt = snap.finishedAt;
  s.winnerId = snap.winnerId;
  s.reshuffleCount = snap.reshuffleCount;
  s.reshufflePending = snap.reshufflePending;
  s.reshuffleTableCount = snap.reshuffleTableCount;
  s.shuffleMode = snap.shuffleMode;
  s.shuffleReady = snap.shuffleReady;
  s.shuffleRound = snap.shuffleRound;
  s.roundRemaining = snap.roundRemaining;

  // Bring back the matches that were LIVE at that point so teams mid-match go back
  // onto their table with the clock running. For each active snapshot table that
  // held a match:
  //   • NEW snapshots carry the match (teams + elapsed) — recreate it exactly and
  //     set startedAt = now − elapsed so the timer reads what it did at that point.
  //   • LEGACY snapshots (no match data) fall back to inferring the two seated
  //     teams and resetting the clock to 0:00.
  // The old record is REUSED when it still exists, RECREATED when it's gone (a
  // reshuffle after the match prunes the record, which would otherwise leave the
  // table empty on restore).
  const nowMs = Date.now();
  const matchSnaps = new Map<string, ChipMatchSnapshot>();
  for (const ms of snap.matches ?? []) matchSnaps.set(ms.id, ms);
  for (const t of s.tables) {
    if (t.inactive || !t.matchId) continue;
    const ms = matchSnaps.get(t.matchId);
    let aId: string | undefined;
    let bId: string | undefined;
    let startedAt: string;
    if (ms) {
      // Elapsed-preserving restore from saved match data.
      aId = ms.aId;
      bId = ms.bId;
      startedAt = new Date(nowMs - Math.max(0, ms.elapsedMs)).toISOString();
    } else {
      // Legacy fallback: infer the two seated teams, reset the clock to 0:00.
      const seated = s.entries
        .filter((e) => e.status === "playing" && e.tableId === t.id)
        .map((e) => e.id);
      if (seated.length === 2) { aId = seated[0]; bId = seated[1]; }
      startedAt = new Date(nowMs).toISOString();
    }
    if (!aId || !bId) {
      // Nothing to reconstruct — open the table so it's at least consistent.
      t.matchId = null;
      t.status = "open";
      continue;
    }
    let m = s.matches.find((mm) => mm.id === t.matchId);
    if (!m) {
      m = { id: t.matchId, tableId: t.id, aId, bId, startedAt, status: "in_progress" };
      s.matches.push(m);
    } else {
      m.tableId = t.id;
      m.aId = aId;
      m.bId = bId;
      m.winnerId = null;
      m.loserId = null;
      m.endedAt = null;
      m.startedAt = startedAt;
      m.status = "in_progress";
    }
    // A live-match table holds no waiting winner / pending challenger.
    t.holderId = null;
    t.pendingChallengerId = null;
    t.status = "in_use";
    for (const id of [aId, bId]) {
      const e = entryById(s, id);
      if (e && e.status !== "eliminated") { e.status = "playing"; e.tableId = t.id; }
    }
  }

  // Preserve history: mark reverted events superseded (they STAY in the log).
  for (const ev of s.events) if (revertedIds.has(ev.id)) ev.superseded = true;
  s.restorePoints = rps.slice(0, idx); // drop the now-inactive restore points

  const when = new Date(rp.at);
  const stamp = isNaN(when.getTime()) ? "an earlier point" : when.toLocaleString();
  pushEvent(s, "restore", `Restored to ${stamp}`, meta.actorId ?? null, {
    restore: true,
    revertedCount: reverted.length,
    revertedTitles: reverted.map((r) => r.label),
    reason: meta.reason,
    actorName: meta.actorName ?? null,
    restoredTo: rp.at,
  });

  // Make the board self-consistent (drop dangling matches, fix the queue/drain).
  return reconcileQueue(settleShuffleDrain(reconcileMatches(s)));
};

// Quick shortcut: revert the last `n` logged actions (no reason required).
export const undoLastActions = (input: ChipState, n: number, meta: RestoreMeta): ChipState => {
  const rps = input.restorePoints ?? [];
  if (!rps.length) return input;
  const target = rps[Math.max(0, rps.length - n)];
  return restoreToPoint(input, target.primaryEventId, meta);
};

// TD confirms a winner-stays assignment: the pending challenger faces the holder
// and the match starts now (timer at 0:00).
export const startPendingMatch = (
  input: ChipState,
  tableId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const t = s.tables.find((x) => x.id === tableId);
  if (!t || t.matchId || !t.holderId || !t.pendingChallengerId) return input;
  const holderId = t.holderId;
  const challengerId = t.pendingChallengerId;
  t.pendingChallengerId = null;
  startMatch(s, t, holderId, challengerId);
  pushEvent(s, "manual", `${t.label} match started`, by);
  return s;
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
    t.pendingChallengerId = null;
    t.inactive = false;
    t.closing = false;
  }
  s.matches = [];
  s.queue = shuffle(playing).map((e) => e.id);
  s.reshufflePending = false;
  s.reshuffleTableCount = null;
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
  pushEvent(s, "chip_loss", `${teamName(loser)} lost a chip → ${loser.chips} left`, by, { entryId: loserId, delta: -1, resulting: loser.chips });

  // Clear the finished match off the table.
  table.matchId = null;
  table.status = "open";

  // Winner stays on the table ONLY in normal flow. If the table was marked to
  // close, it goes inactive now; if a reshuffle is pending, nobody re-seats — in
  // both cases the winner rejoins the front of the queue (keeps their momentum).
  const tableClosing = !!table.closing;
  const pending = !!s.reshufflePending;
  if (tableClosing || pending) {
    table.holderId = null;
    table.lastLoserId = null;
    winner.status = "queued";
    winner.tableId = null;
    if (!s.queue.includes(winnerId)) s.queue.unshift(winnerId);
    if (tableClosing) {
      table.closing = false;
      table.inactive = true;
      pushEvent(s, "table_removed", `${table.label} closed after its match`, by);
    }
  } else {
    table.holderId = winnerId;
    table.lastLoserId = loserId; // anti-repeat: skip the loser next on THIS table
    winner.tableId = table.id;
  }

  if (loser.chips <= 0) {
    loser.status = "eliminated";
    loser.eliminatedAt = new Date().toISOString();
    loser.tableId = null;
    winner.eliminations += 1;
    pushEvent(s, "elimination", `${teamName(winner)} eliminated ${teamName(loser)}`, by, { entryId: loserId, byId: winnerId });
  } else {
    loser.status = "queued";
    loser.tableId = null;
    s.queue.push(loserId); // back of the queue
  }

  // A pending shuffle cycle: don't re-seat. When the LAST active match finishes,
  // the board is fully drained — enter the "ready to shuffle" state and wait for
  // the TD to press Start Shuffle (they may adjust tables first). The redraw does
  // NOT run automatically.
  if (pending) {
    if (!s.matches.some((m) => m.status === "in_progress")) {
      s.shuffleReady = true;
      pushEvent(s, "shuffle", "All tables cleared — ready to shuffle", by);
    }
    return s;
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
    return s;
  }

  // Shuffle round complete: once no round-remaining team is still waiting to be
  // seated, stop creating new matches and drain the rest. The match that just
  // seated the last team keeps playing — draining only clears WAITING winners.
  if (s.shuffleRound && !s.roundRemaining?.some((id) => entryById(s, id)?.status !== "eliminated")) {
    startDrain(s, by, "round");
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

// TD forfeits an entry out of the WHOLE tournament — eliminated regardless of
// chip count or current standing. If they are mid-match, the opponent wins by
// forfeit and stays on the table; a waiting holder's table is freed. The board
// re-seats and the win condition is re-checked (a forfeit can end the event).
export const forfeitEntry = (
  input: ChipState,
  entryId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const e = entryById(s, entryId);
  if (!e || e.status === "eliminated") return input;

  // Mid-match: the opponent wins by forfeit and stays as the table holder.
  const liveMatch = s.matches.find(
    (m) => m.status === "in_progress" && (m.aId === entryId || m.bId === entryId),
  );
  if (liveMatch) {
    const oppId = liveMatch.aId === entryId ? liveMatch.bId : liveMatch.aId;
    const opp = entryById(s, oppId);
    const table = s.tables.find((t) => t.id === liveMatch.tableId);
    liveMatch.winnerId = oppId;
    liveMatch.loserId = entryId;
    liveMatch.endedAt = new Date().toISOString();
    liveMatch.status = "finished";
    if (opp) {
      opp.wins += 1;
      opp.streak += 1;
      opp.bestStreak = Math.max(opp.bestStreak, opp.streak);
    }
    e.losses += 1;
    if (table) {
      table.matchId = null;
      table.status = "open";
      table.lastLoserId = null;
      if (opp) {
        table.holderId = oppId;
        opp.tableId = table.id;
      }
    }
    pushEvent(s, "forfeit", `${teamName(e)} forfeited vs ${opp ? teamName(opp) : "opponent"}`, by, { entryId, oppId });
  }

  // Force elimination regardless of remaining chips.
  e.chips = 0;
  e.status = "eliminated";
  e.eliminatedAt = new Date().toISOString();
  e.streak = 0;
  e.tableId = null;
  s.queue = s.queue.filter((id) => id !== entryId);
  roundSeat(s, entryId); // drop from roundRemaining so it can't block completion
  for (const t of s.tables) {
    if (t.holderId === entryId) {
      t.holderId = null;
      t.status = "open";
      releasePending(s, t); // holder gone → the pending challenger returns to the queue
    }
    if (t.pendingChallengerId === entryId) t.pendingChallengerId = null; // challenger eliminated
    if (t.lastLoserId === entryId) t.lastLoserId = null;
  }
  pushEvent(s, "elimination", `${teamName(e)} forfeited the tournament`, by, { entryId });

  if (s.startedAt && !s.finishedAt && !s.reshufflePending) seatAllTables(s);

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

// ── queue reordering ──────────────────────────────────────────────────────────
// TD moves a queued team up/down one spot, or to the top/bottom of the line.
export const reorderQueue = (
  input: ChipState,
  entryId: string,
  to: "up" | "down" | "top" | "bottom",
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const i = s.queue.indexOf(entryId);
  if (i < 0) return input;
  s.queue.splice(i, 1);
  const j =
    to === "up" ? Math.max(0, i - 1)
    : to === "down" ? Math.min(s.queue.length, i + 1)
    : to === "top" ? 0
    : s.queue.length;
  s.queue.splice(j, 0, entryId);
  const e = entryById(s, entryId);
  pushEvent(s, "manual", `${e ? teamName(e) : "Team"} moved ${to} in the queue`, by);
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
  pushEvent(s, "chip_adjust", `${teamName(e)} ${delta > 0 ? "+" : ""}${delta} chip → ${e.chips}`, by, { entryId, delta, resulting: e.chips });
  if (e.chips <= 0 && e.status === "queued") {
    e.status = "eliminated";
    e.eliminatedAt = new Date().toISOString();
    s.queue = s.queue.filter((id) => id !== entryId);
    roundSeat(s, entryId); // drop from roundRemaining so it can't block completion
    pushEvent(s, "elimination", `${teamName(e)} eliminated`, by, { entryId });
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
  // Restored mid-round: NOT added to roundRemaining, so they can't be seated this
  // round — they simply wait and get picked up by the next reshuffle.
  if (!s.queue.includes(entryId)) s.queue.push(entryId);
  s.finishedAt = null;
  s.winnerId = null;
  pushEvent(s, "manual", `${teamName(e)} bought back in (${e.chips} chips)`, by);
  seatAllTables(s);
  return s;
};

// TD manually restores a chip to an ELIMINATED team (an override, always
// available). They re-enter active at the BOTTOM of the queue with +1 chip and
// are NOT immediately seated — they wait their turn. The audit event captures
// the previous → new chip count and the reason (if entered).
export const restoreEntry = (
  input: ChipState,
  entryId: string,
  reason?: string | null,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const e = entryById(s, entryId);
  if (!e || e.status !== "eliminated") return input;
  const prev = e.chips;
  e.chips = Math.max(1, e.chips + 1);
  e.status = "queued";
  e.eliminatedAt = null;
  e.streak = 0;
  // Restored mid-round → not on roundRemaining, so it waits for the next reshuffle.
  if (!s.queue.includes(entryId)) s.queue.push(entryId); // bottom of the queue
  s.finishedAt = null;
  s.winnerId = null;
  const why = reason && reason.trim() ? ` — ${reason.trim()}` : "";
  pushEvent(s, "chip_adjust", `${teamName(e)} chip restored: ${prev} → ${e.chips}${why}`, by, { entryId, delta: e.chips - prev, resulting: e.chips });
  // Intentionally NO seatAllTables — they wait at the back of the queue.
  return s;
};

// ── reshuffle (deferred, fair full redraw) ────────────────────────────────────
// Randomize every remaining (alive) team and re-seat — a fresh position for
// everyone. Chips/records/eliminations are preserved; streaks + table anti-repeat
// reset. When tableCount is given, that many tables (first N in order) are made
// active and the rest inactive. Assumes no match is in progress (callers ensure).
export const finalizeReshuffle = (
  input: ChipState,
  tableCount: number | null,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const alive = aliveEntries(s);
  if (tableCount != null) {
    let activated = 0;
    for (const t of s.tables) {
      const active = activated < tableCount;
      t.inactive = !active;
      if (active) activated += 1;
    }
  }
  for (const e of alive) {
    e.status = "queued";
    e.tableId = null;
    e.streak = 0;
  }
  for (const t of s.tables) {
    // A table already removed (inactive) or pending removal (closing) STAYS
    // removed through a reshuffle — it never re-seats unless the TD adds it back.
    if (t.closing) t.inactive = true;
    t.status = "open";
    t.matchId = null;
    t.holderId = null;
    t.lastLoserId = null;
    t.pendingChallengerId = null;
    t.closing = false;
  }
  // Drop any lingering in-progress matches (should be none if matches finished).
  s.matches = s.matches.filter((m) => m.status !== "in_progress");
  s.queue = shuffle(alive).map((e) => e.id);
  s.reshuffleCount = (s.reshuffleCount ?? 0) + 1;
  s.reshufflePending = false;
  s.reshuffleTableCount = null;
  s.shuffleReady = false;
  // A new round begins: every shuffled survivor is round-remaining until seated.
  s.shuffleRound = !!s.shuffleMode;
  s.roundRemaining = s.shuffleMode ? [...s.queue] : [];
  pushEvent(s, "shuffle", `Reshuffle #${s.reshuffleCount} · ${alive.length} entries`, by);
  seatAllTables(s);
  return s;
};

// ── Shuffle Mode (persistent, TD-driven cycle) ──────────────────────────────────

// Enable/disable Shuffle Mode. Enabling just shows the banner (normal play
// continues). Disabling fully returns to normal mode: any in-progress shuffle
// cycle is abandoned and seating resumes.
export const setShuffleMode = (
  input: ChipState,
  on: boolean,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  if (!!s.shuffleMode === on) return input;
  s.shuffleMode = on;
  if (on) {
    pushEvent(s, "manual", "Shuffle Mode enabled", by);
  } else {
    const wasActive = !!s.reshufflePending || !!s.shuffleReady || !!s.shuffleRound;
    s.reshufflePending = false;
    s.shuffleReady = false;
    s.shuffleRound = false;
    s.roundRemaining = [];
    s.reshuffleTableCount = null;
    pushEvent(s, "manual", "Shuffle Mode disabled", by);
    if (wasActive && s.startedAt && !s.finishedAt) seatAllTables(s);
  }
  return s;
};

// Begin a shuffle cycle: freeze seating and drain the board. Tables holding a
// waiting winner are cleared immediately (that team rejoins the queue); tables
// with a live match keep playing until they finish. When every active table is
// empty the cycle flips to "ready" (here immediately if nothing is in progress).
export const beginShuffle = (input: ChipState, by?: number | null): ChipState => {
  const s = clone(input);
  if (s.reshufflePending || s.shuffleReady) return input;
  s.shuffleMode = true;
  startDrain(s, by, "initial");
  return s;
};

// Start Shuffle from the "ready" state: randomize the queue and re-seat onto the
// active tables, then return to normal chip flow. Shuffle Mode stays enabled so
// the TD can run another cycle later.
export const startShuffle = (
  input: ChipState,
  tableCount?: number | null,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  if (!s.shuffleReady) return input;
  return finalizeReshuffle(s, tableCount ?? null, by);
};

// Cancel an in-progress shuffle cycle before the redraw and resume normal
// rotation. Shuffle Mode itself stays enabled.
export const cancelReshuffle = (input: ChipState, by?: number | null): ChipState => {
  const s = clone(input);
  if (!s.reshufflePending && !s.shuffleReady && !s.shuffleRound) return input;
  s.reshufflePending = false;
  s.shuffleReady = false;
  s.shuffleRound = false;
  s.roundRemaining = [];
  s.reshuffleTableCount = null;
  pushEvent(s, "manual", "Shuffle cancelled", by);
  if (s.startedAt && !s.finishedAt) seatAllTables(s);
  return s;
};

// Legacy immediate reshuffle (no table-count change).
export const reshuffle = (input: ChipState, by?: number | null): ChipState =>
  finalizeReshuffle(input, null, by);

// ── tables ────────────────────────────────────────────────────────────────────
export const addTable = (input: ChipState, by?: number | null): ChipState => {
  const s = clone(input);
  const label = `Table ${s.tables.length + 1}`;
  s.tables.push({ id: newId("t"), label, isStream: false, status: "open", matchId: null });
  pushEvent(s, "table_added", `Added ${label}`, by);
  if (s.startedAt && !s.finishedAt) seatAllTables(s);
  return s;
};

// Add `count` tables at once. `names[i]` (when non-empty) overrides the default
// sequential "Table N" label for the i-th added table.
export const addTables = (
  input: ChipState,
  count: number,
  names?: (string | null | undefined)[],
  by?: number | null,
): ChipState => {
  let s = input;
  for (let i = 0; i < Math.max(0, count); i++) {
    s = addTable(s, by);
    const custom = names?.[i]?.trim();
    if (custom) s.tables[s.tables.length - 1].label = custom;
  }
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

// Recommended number of ACTIVE tables for the field size, to always keep a small
// queue (winner-stays). ~1 table per 3 teams, with end-game overrides so a queue
// survives as the field shrinks (e.g. 4 teams → 1 table: 2 play, 2 wait).
export const recommendedActiveTables = (remaining: number): number => {
  if (remaining <= 4) return 1; // 2–4 teams → one table keeps a line
  if (remaining <= 6) return 2;
  if (remaining <= 9) return 3;
  return Math.max(1, Math.round(remaining / 3));
};

// Close one or more tables (TD picks which). A table with a match in progress is
// marked `closing` and goes inactive only after that match ends — play is never
// interrupted. An available table (no live match) goes inactive immediately; any
// waiting holder is returned to the queue. Reversible via reactivateTable.
export const closeTables = (
  input: ChipState,
  tableIds: string[],
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const ids = new Set(tableIds);
  for (const t of s.tables) {
    if (!ids.has(t.id) || t.inactive) continue;
    const live = t.matchId
      ? s.matches.some((m) => m.id === t.matchId && m.status === "in_progress")
      : false;
    if (live) {
      t.closing = true;
      pushEvent(s, "table_removed", `${t.label} will close after its match`, by);
    } else {
      if (t.holderId) {
        const e = entryById(s, t.holderId);
        if (e && e.status !== "eliminated") {
          e.status = "queued";
          e.tableId = null;
          if (!s.queue.includes(e.id)) s.queue.unshift(e.id);
        }
      }
      releasePending(s, t);
      t.matchId = null;
      t.holderId = null;
      t.lastLoserId = null;
      t.status = "open";
      t.closing = false;
      t.inactive = true;
      pushEvent(s, "table_removed", `${t.label} closed`, by);
    }
  }
  if (s.startedAt && !s.finishedAt && !s.reshufflePending) seatAllTables(s);
  return s;
};

// Reset the running timer on a table: restart the in-progress match clock (or,
// for a table holding a waiting winner, reset the waiting clock).
export const resetTableTimer = (
  input: ChipState,
  tableId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const t = s.tables.find((x) => x.id === tableId);
  if (!t) return input;
  const nowIso = new Date().toISOString();
  // Reset every in-progress match tied to this table — matched by tableId OR the
  // table's matchId pointer, so a stale pointer on either side can't make the
  // reset miss the live match. Keep the pointer in sync with what we found.
  const live = s.matches.filter(
    (mm) => mm.status === "in_progress" && (mm.tableId === t.id || mm.id === t.matchId),
  );
  if (live.length) {
    for (const mm of live) mm.startedAt = nowIso;
    t.matchId = live[live.length - 1].id;
    pushEvent(s, "manual", `${t.label} match timer reset`, by);
    return s;
  }
  if (t.holderId) {
    // Waiting clock is derived from the holder's most recent win — restamp it.
    const lastWin = s.matches
      .filter((mm) => mm.tableId === t.id && mm.winnerId === t.holderId && mm.endedAt)
      .sort((x, y) => new Date(y.endedAt as string).getTime() - new Date(x.endedAt as string).getTime())[0];
    if (lastWin) lastWin.endedAt = nowIso;
    pushEvent(s, "manual", `${t.label} waiting timer reset`, by);
    return s;
  }
  return input;
};

// Clear a table: void any in-progress match (both teams back to the queue, no
// result) or send a waiting holder back to the queue. The table is emptied and
// left OPEN — it is not auto-re-seated, so the TD keeps control of what goes next.
export const clearTable = (
  input: ChipState,
  tableId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const t = s.tables.find((x) => x.id === tableId);
  if (!t) return input;
  const requeue = (id: string) => {
    const e = entryById(s, id);
    if (e && e.status !== "eliminated") {
      e.status = "queued";
      e.tableId = null;
      if (!s.queue.includes(id)) s.queue.push(id);
    }
  };
  const m = t.matchId ? s.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress") : null;
  if (m) {
    // Void the match entirely — it never counted (no W/L change).
    s.matches = s.matches.filter((mm) => mm.id !== m.id);
    requeue(m.aId);
    requeue(m.bId);
    pushEvent(s, "manual", `${t.label} cleared — match voided`, by);
  } else if (t.holderId || t.pendingChallengerId) {
    if (t.holderId) requeue(t.holderId);
    if (t.pendingChallengerId) requeue(t.pendingChallengerId);
    pushEvent(s, "manual", `${t.label} cleared`, by);
  } else {
    return input;
  }
  t.matchId = null;
  t.holderId = null;
  t.lastLoserId = null;
  t.pendingChallengerId = null;
  t.status = "open";
  return s;
};

// Re-activate an inactive (or closing) table so it receives matches again.
export const reactivateTable = (
  input: ChipState,
  tableId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const t = s.tables.find((x) => x.id === tableId);
  if (!t) return input;
  t.inactive = false;
  t.closing = false;
  t.status = "open";
  pushEvent(s, "table_added", `${t.label} reactivated`, by);
  if (s.startedAt && !s.finishedAt && !s.reshufflePending) seatAllTables(s);
  return s;
};

// Lock / unlock a table. A locked table takes no automatic assignments (Auto Run
// skips it); unlocking lets it seat again.
export const setTableLocked = (
  input: ChipState,
  tableId: string,
  locked: boolean,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const t = s.tables.find((x) => x.id === tableId);
  if (!t) return input;
  t.locked = locked;
  pushEvent(s, "manual", `${t.label} ${locked ? "locked" : "unlocked"}`, by);
  if (!locked && s.startedAt && !s.finishedAt && !s.reshufflePending) seatAllTables(s);
  return s;
};

// Move a table's current occupants (an in-progress match and/or a waiting winner)
// onto another EMPTY, unlocked, active table. The clock keeps running. The vacated
// table is then free to seat the next queued teams.
export const moveTable = (
  input: ChipState,
  fromId: string,
  toId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const from = s.tables.find((t) => t.id === fromId);
  const to = s.tables.find((t) => t.id === toId);
  if (!from || !to || from.id === to.id) return input;
  if (to.inactive || to.locked || to.matchId || to.holderId || to.pendingChallengerId) return input; // dest must be empty
  if (from.matchId) {
    const m = s.matches.find((mm) => mm.id === from.matchId && mm.status === "in_progress");
    if (m) {
      m.tableId = to.id;
      for (const id of [m.aId, m.bId]) {
        const e = entryById(s, id);
        if (e) e.tableId = to.id;
      }
    }
    to.matchId = from.matchId;
    to.status = "in_use";
    from.matchId = null;
    from.status = "open";
  }
  if (from.holderId) {
    const h = entryById(s, from.holderId);
    if (h) h.tableId = to.id;
    to.holderId = from.holderId;
    from.holderId = null;
  }
  if (from.pendingChallengerId) {
    const c = entryById(s, from.pendingChallengerId);
    if (c) c.tableId = to.id;
    to.pendingChallengerId = from.pendingChallengerId;
    from.pendingChallengerId = null;
  }
  to.lastLoserId = from.lastLoserId ?? null;
  from.lastLoserId = null;
  pushEvent(s, "move", `Moved ${from.label} → ${to.label}`, by);
  if (s.startedAt && !s.finishedAt && !s.reshufflePending) seatAllTables(s);
  return s;
};

// TD manually seats the next eligible team(s) onto one idle table (a holder gets
// the front challenger; an empty table gets two). Respects the table anti-repeat.
export const assignNextTeam = (
  input: ChipState,
  tableId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const table = s.tables.find((t) => t.id === tableId);
  if (!table || table.inactive || table.locked || table.closing || table.matchId || table.pendingChallengerId) return input;
  if (table.holderId) {
    // Winner-stays → assign as pending (TD confirms with Start Match).
    const challenger = takeChallenger(s, table);
    if (challenger) {
      table.pendingChallengerId = challenger;
      const ce = entryById(s, challenger);
      if (ce) { ce.status = "playing"; ce.tableId = table.id; }
    }
  } else if (s.queue.length >= 2) {
    const a = takeAny(s) as string;
    const b = takeAny(s) as string;
    table.lastLoserId = null;
    startMatch(s, table, a, b);
  }
  return s;
};

// TD manually assigns a SPECIFIC queued team onto a table (override). On a holder
// table they become the challenger; on an empty table they're paired with the
// next queued team.
export const assignSpecificTeam = (
  input: ChipState,
  tableId: string,
  entryId: string,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const table = s.tables.find((t) => t.id === tableId);
  if (!table || table.inactive || table.locked || table.closing || table.matchId || table.pendingChallengerId) return input;
  if (!s.queue.includes(entryId)) return input;
  s.queue = s.queue.filter((id) => id !== entryId);
  if (table.holderId) {
    // Winner-stays → assign as pending (TD confirms with Start Match).
    table.pendingChallengerId = entryId;
    const ce = entryById(s, entryId);
    if (ce) { ce.status = "playing"; ce.tableId = table.id; }
  } else {
    const other = takeAny(s);
    if (!other) {
      s.queue.unshift(entryId); // need two for an empty table
      return input;
    }
    table.lastLoserId = null;
    startMatch(s, table, entryId, other);
  }
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
