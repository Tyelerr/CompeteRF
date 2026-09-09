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

// ── Anti-repeat: prevent an IMMEDIATE rematch (most-recent-opponent) ────────────
// The anti-repeat is keyed to each player's OWN most-recent completed opponent, NOT
// to the holder's whole streak. A queued team is blocked from a table only if the
// opponent of its single most-recent finished match IS that table's current holder.
// The moment that team plays anyone else (any table), its most-recent opponent
// changes and it becomes eligible against the old holder again.
//
// mostRecentOpponent: the other side of this entry's most-recent finished match,
// across ALL tables (so a match elsewhere correctly updates eligibility). Derived
// from match history — no stored field, correct across reloads/restores. Returns
// null if the entry has no completed match yet (fresh entrant → never blocked).
export const mostRecentOpponent = (s: ChipState, entryId: string): string | null => {
  let best: ChipMatch | null = null;
  for (const m of s.matches) {
    if (m.status === "in_progress" || !m.endedAt) continue;
    if (m.aId !== entryId && m.bId !== entryId) continue;
    if (!best || new Date(m.endedAt).getTime() > new Date(best.endedAt as string).getTime())
      best = m;
  }
  return best ? (best.aId === entryId ? best.bId : best.aId) : null;
};

// The queue "Rematch skipped" chip reflects an ACTUAL skip that is STILL in effect —
// never a prediction and never a stale record. A queued team is marked only when some
// table satisfies ALL of:
//   • it has a LIVE pending challenger selection (pendingChallengerId set, no live
//     match) — the decision that produced the skip still exists. The moment that
//     matchup starts, is cancelled, cleared, or re-selected, pendingChallengerId is
//     gone, so the chip clears regardless of which code path ended it.
//   • the team is in that table's rematchSkipped — it was ACTUALLY bypassed for THIS
//     selection (not merely a queued team whose opponent happens to conflict, and not
//     a team sitting deeper that was never evaluated).
//   • the team is STILL blocked — its most-recent opponent is still that holder. If
//     the team has since played elsewhere it's eligible again, so the chip clears.
// This makes the display self-correcting even if an old rematchSkipped array lingers
// on a table whose pending was released without clearing it.
export const rematchSkippedLabel = (s: ChipState, entryId: string): string | null => {
  if (s.shuffleRound) return null; // anti-repeat is off during a shuffle round — never label
  for (const t of s.tables) {
    if (t.matchId || !t.pendingChallengerId) continue; // no live pending selection
    if (!(t.rematchSkipped ?? []).includes(entryId)) continue; // not actually skipped here
    if (mostRecentOpponent(s, entryId) !== (t.holderId ?? null)) continue; // no longer blocked
    return t.label;
  }
  return null;
};

// Pull a challenger for the winner-stays holder. Anti-repeat (immediate rematch):
// FIFO — inspect the front-most eligible team; if its most-recent opponent is this
// holder, skip forward to the first queued team whose most-recent opponent is NOT the
// holder. If NO such team exists (everyone waiting last played this holder), fall back
// to the front-most eligible (allow the rematch) rather than deadlocking the table.
// Round gating is preserved. Records ONLY the teams actually passed over on
// table.rematchSkipped (transient) for the Next Match modal + queue chip.
const takeChallenger = (s: ChipState, table: ChipTable, by?: number | null): string | null => {
  const holder = table.holderId ?? null;
  const isBlocked = (id: string): boolean =>
    holder != null && mostRecentOpponent(s, id) === holder;
  const firstIdx = s.queue.findIndex((id) => roundSeatable(s, id));
  if (firstIdx === -1) {
    table.rematchSkipped = [];
    return null; // no eligible challenger at all → the holder waits
  }
  // Shuffle round: anti-repeat is DISABLED — the round's priority is that every
  // eligible entry gets its one required turn, so never reorder/skip to dodge a
  // rematch (and never emit a "Rematch skipped" note). Take the front-most eligible.
  if (s.shuffleRound) {
    table.rematchSkipped = [];
    return s.queue.splice(firstIdx, 1)[0];
  }
  const freshIdx = s.queue.findIndex((id) => roundSeatable(s, id) && !isBlocked(id));
  let idx = firstIdx;
  const skipped: string[] = [];
  if (freshIdx !== -1 && freshIdx !== firstIdx) {
    idx = freshIdx;
    // Only the eligible teams we passed over BECAUSE they'd immediately rematch.
    for (let i = firstIdx; i < freshIdx; i++) {
      const id = s.queue[i];
      if (roundSeatable(s, id) && isBlocked(id)) skipped.push(id);
    }
    if (skipped.length) {
      const holderEntry = holder ? entryById(s, holder) : null;
      const names = skipped
        .map((id) => { const e = entryById(s, id); return e ? teamName(e) : "a team"; })
        .join(", ");
      pushEvent(
        s,
        "manual",
        `Rematch skipped — ${names} just played ${holderEntry ? teamName(holderEntry) : "the holder"} (${table.label})`,
        by,
      );
    }
  }
  table.rematchSkipped = skipped; // transient: who was skipped for THIS assignment
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
  table.rematchSkipped = []; // the pending "Rematch skipped" note is consumed on start
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
  // Opening phase ("Start All"): the tournament has STARTED but no match has begun
  // yet. Opening matchups are ANNOUNCED — seated as holder + pending challenger with
  // NO timer — and wait for the TD to tap Start All, which starts them all at once.
  // This reuses the exact "assigned, awaiting Start Match" state that winner-stays
  // (pendingChallengerId) and assignFinals already use. The instant any match starts,
  // matches is non-empty and preStart is false forever after, so mid-event fresh
  // pairs (an emptied table reopening) still start immediately as before.
  const preStart = !!s.startedAt && s.matches.length === 0;
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
          // Assign the next opponent but WAIT for the TD to tap Start Match
          // (0:00) — in normal play AND during a shuffle round. Every winner-stays
          // matchup is announced before it begins; the timer never auto-starts.
          // (roundSeat still fires here so the round countdown / completion track
          // the assignment; the round only drains once no pending matchup remains
          // — see recordWinner.)
          table.pendingChallengerId = challenger;
          const ce = entryById(s, challenger);
          if (ce) {
            ce.status = "playing";
            ce.tableId = table.id;
          }
          roundSeat(s, challenger);
          progressed = true;
        }
      } else {
        const pair = takePair(s);
        if (pair) {
          const [a, b] = pair;
          table.lastLoserId = null; // fresh seat, no anti-repeat carry-over
          if (preStart) {
            // Announce the opening matchup (no timer) — starts on Start All.
            table.holderId = a;
            table.pendingChallengerId = b;
            table.status = "open";
            for (const id of [a, b]) {
              const e = entryById(s, id);
              if (e) { e.status = "playing"; e.tableId = table.id; }
              roundSeat(s, id);
            }
          } else {
            startMatch(s, table, a, b);
          }
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
  t.rematchSkipped = []; // the selection that produced this pending is gone
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
  // Keep shuffleRound TRUE through a round-completion drain so the ready state reads as
  // "Round N Complete" (+ Start Shuffle). Clear it for the INITIAL modal-confirm drain
  // (shuffle started while matches were live) so the ready state reads "Ready to Shuffle"
  // (+ Start Shuffle). Either way the TD taps Start Shuffle to redraw — no auto-advance.
  s.shuffleRound = reason === "round";
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
      t.rematchSkipped = [];
      t.status = "open";
    } else if (t.matchId && !liveNow.has(t.matchId)) {
      // Dangling reference: clear it, but keep a genuine staying winner as holder.
      t.matchId = null;
      t.pendingChallengerId = null;
      t.rematchSkipped = [];
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

// Safety reconcile: a team with 0 chips is OUT — always. The match-loss path
// (recordWinner) and chip adjustments already eliminate on reaching 0, but an entry
// can arrive at 0 by other routes (seeded from a 0/blank Fargo tier, an import, a
// restore). This guard catches ANY non-eliminated entry sitting at ≤0 chips and
// eliminates it: pulls it from the queue and frees any table slot it holds, so a
// 0-chip team can never linger in active rotation. Skips entries currently IN a live
// match (that resolves through recordWinner) and only runs while the tournament is
// live. Idempotent — returns input unchanged when nothing is at 0.
export const reconcileEliminations = (input: ChipState): ChipState => {
  if (!input.startedAt || input.finishedAt) return input;
  const inLive = new Set<string>();
  for (const m of input.matches) {
    if (m.status === "in_progress") { inLive.add(m.aId); inLive.add(m.bId); }
  }
  const hasVictim = input.entries.some(
    (e) => e.status !== "eliminated" && (e.chips ?? 0) <= 0 && !inLive.has(e.id),
  );
  if (!hasVictim) return input;
  const s = clone(input);
  const nowIso = new Date().toISOString();
  for (const e of s.entries) {
    if (e.status === "eliminated" || (e.chips ?? 0) > 0 || inLive.has(e.id)) continue;
    e.status = "eliminated";
    e.eliminatedAt = e.eliminatedAt ?? nowIso;
    e.tableId = null;
    s.queue = s.queue.filter((id) => id !== e.id);
    for (const t of s.tables) {
      if (t.holderId === e.id) { t.holderId = null; t.lastLoserId = null; t.status = "open"; }
      if (t.pendingChallengerId === e.id) t.pendingChallengerId = null;
    }
    pushEvent(s, "elimination", `${teamName(e)} eliminated (out of chips)`, null, { entryId: e.id });
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
  pushEvent(s, "manual", `${t.label} match started`, by, { act: "match_started" });
  return s;
};

// A table showing an OPENING matchup still awaiting Start: a fresh holder + pending
// pair with no live match, where the holder has NOT yet won on this table THIS round
// (streak === 0). Keying on streak (reset to 0 at the tournament start AND at every
// reshuffle) — not lifetime wins/losses — means the SAME opening flow applies to each
// Shuffle round's opening matchups, not just the very first tournament kickoff. This
// distinguishes the opening kickoff from a normal winner-stays pending challenger
// (whose holder just won → streak > 0). Opening tables are the only ones the "Start
// All / Start Remaining" control acts on.
const isOpeningWaitTable = (s: ChipState, t: ChipTable): boolean => {
  if (t.inactive || t.matchId || !t.holderId || !t.pendingChallengerId) return false;
  const h = entryById(s, t.holderId);
  return !!h && (h.streak ?? 0) === 0;
};

// How many opening matchups are still waiting to start.
export const openingWaitCount = (s: ChipState): number =>
  s.tables.filter((t) => isOpeningWaitTable(s, t)).length;

// A table showing a genuine WINNER-STAYS next challenger: a pending challenger that
// exists because a COMPLETED match freed the table, so the holder has already played
// (wins > 0). This — NOT the mere existence of a pending challenger — is what the
// "Next Match / Incoming Team" callout targets. It excludes an opening matchup that
// is merely Waiting to Start (isOpeningWaitTable: holder has never played), so
// assigning/starting the opening never triggers a callout; only recording a winner
// (which stays the holder and pulls the next challenger) does — independently per
// table, the moment that table's own match completes.
export const isPostMatchPending = (s: ChipState, t: ChipTable): boolean => {
  if (t.inactive || t.matchId || !t.holderId || !t.pendingChallengerId) return false;
  const h = entryById(s, t.holderId);
  // streak > 0 ⇒ the holder just won a game on THIS table this round (a winner staying).
  // Reset to 0 at each reshuffle, so a new round's opening holders never look post-match
  // — the callout only fires once a table records its first result of the round.
  return !!h && (h.streak ?? 0) > 0;
};

// The state of the global opening-kickoff control, driving its label + visibility:
//   • "all"       — nothing has started yet (Start All)
//   • "remaining" — some opening tables are live, others still waiting (Start Remaining)
//   • null        — no opening table is waiting (control reverts to Shuffle Mode)
export const startAllState = (s: ChipState): "all" | "remaining" | null => {
  if (!s.startedAt || s.finishedAt) return null;
  if (openingWaitCount(s) === 0) return null;
  // "all" while NO active table has a live match yet (fresh opening — tournament OR a
  // reshuffle round); "remaining" once at least one is live. (Can't key on the global
  // matches.length here — it's non-zero after the first round — so read live tables.)
  const anyLive = s.tables.some(
    (t) =>
      !t.inactive &&
      !!t.matchId &&
      s.matches.some((m) => m.id === t.matchId && m.status === "in_progress"),
  );
  return anyLive ? "remaining" : "all";
};

// "Start All" / "Start Remaining": start EVERY opening table still waiting to start,
// all at the SAME instant so their timers stay in sync. Only touches opening tables
// (fresh holder + pending, no live match) — it never starts a mid-game winner-stays
// pending matchup, and never resets or restarts a table that is already Live. No-op
// when nothing is waiting.
export const startAllMatches = (
  input: ChipState,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const waiting = s.tables.filter((t) => isOpeningWaitTable(s, t));
  if (!waiting.length) return input;
  const startedAt = new Date().toISOString();
  for (const t of waiting) {
    const holderId = t.holderId as string;
    const challengerId = t.pendingChallengerId as string;
    t.pendingChallengerId = null;
    startMatch(s, t, holderId, challengerId);
    // startMatch stamps startedAt individually; align them all to one instant.
    const m = s.matches.find((mm) => mm.id === t.matchId);
    if (m) m.startedAt = startedAt;
  }
  const n = waiting.length;
  pushEvent(s, "manual", `Started ${n} match${n === 1 ? "" : "es"}`, by, { act: "matches_started" });
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
  pushEvent(s, "manual", `Tournament started · ${playing.length} entries`, null, { act: "tournament_started" });
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
    pushEvent(s, "manual", `${teamName(alive[0])} wins the tournament! 🏆`, by, { act: "champion", entryId: alive[0].id });
    return s;
  }

  // Shuffle round complete: once every alive team has been seated for the round
  // (nothing left in roundRemaining) AND no table is still holding a pending
  // challenger awaiting Start Match, stop creating new matches and drain the
  // rest. The pending guard matters now that winner-stays matchups wait for Start
  // Match — without it the last announced matchup would be released before it is
  // played. Draining only clears WAITING winners; live matches finish first.
  const roundAllSeated = !s.roundRemaining?.some((id) => entryById(s, id)?.status !== "eliminated");
  const anyPending = s.tables.some((t) => !!t.pendingChallengerId);
  if (s.shuffleRound && roundAllSeated && !anyPending) {
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
    pushEvent(s, "manual", `${teamName(alive[0])} wins the tournament! 🏆`, by, { act: "champion", entryId: alive[0].id });
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
// Metadata for a MANUAL director chip override (distinct from engine-controlled chip
// changes like match results / losses / buy-backs). Required while live so every manual
// change to the live field is attributable and auditable.
export interface ChipAdjustMeta {
  reason?: string | null;
  notes?: string | null;
  actorId?: number | null;
  actorName?: string | null;
}

// Manual chip override (the TD's +/- controls). NOT used by engine gameplay — match
// results adjust chips inside recordWinner, never here. Guards while live:
//   • requires a reason (meta.reason) — a manual live override must be attributable;
//   • an actively-PLAYING player can never be manually reduced to 0 (elimination must
//     come from the match-result flow), so the change is refused if it would zero them.
// A QUEUED player reduced to 0 is eliminated through the existing path (below), same as
// before. Setup (pre-start) adjustments are unrestricted (no reason needed).
export const adjustChips = (
  input: ChipState,
  entryId: string,
  delta: number,
  meta?: ChipAdjustMeta | null,
): ChipState => {
  const s = clone(input);
  const e = entryById(s, entryId);
  if (!e) return input;
  const live = !!s.startedAt && !s.finishedAt;
  // Defense-in-depth: a live manual override with no reason is refused at the engine, so
  // no caller (stale UI, another component) can silently mutate the live field.
  if (live && !meta?.reason) return input;
  const liveMatch = s.matches.find(
    (m) => m.status === "in_progress" && (m.aId === entryId || m.bId === entryId),
  );
  const playing = e.status === "playing" || !!liveMatch;
  const oldChips = e.chips;
  const resulting = Math.max(0, e.chips + delta);
  // Never let a manual override eliminate an actively-playing player via a chip edit.
  if (live && playing && resulting <= 0) return input;
  e.chips = resulting;
  const reasonSuffix = meta?.reason ? ` — ${meta.reason}` : "";
  pushEvent(
    s,
    "chip_adjust",
    `${teamName(e)} chips ${oldChips} → ${e.chips} (${delta > 0 ? "+" : ""}${delta})${reasonSuffix}`,
    meta?.actorId ?? null,
    {
      entryId,
      delta,
      resulting: e.chips,
      oldChips,
      newChips: e.chips,
      reason: meta?.reason ?? null,
      notes: meta?.notes ?? null,
      actorName: meta?.actorName ?? null,
      playerState: e.status,
      tableId: e.tableId ?? null,
      matchId: liveMatch?.id ?? null,
    },
  );
  if (e.chips <= 0 && e.status === "queued") {
    e.status = "eliminated";
    e.eliminatedAt = new Date().toISOString();
    s.queue = s.queue.filter((id) => id !== entryId);
    roundSeat(s, entryId); // drop from roundRemaining so it can't block completion
    pushEvent(s, "elimination", `${teamName(e)} eliminated`, meta?.actorId ?? null, { entryId });
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
  pushEvent(s, "manual", `${teamName(e)} bought back in (${e.chips} chips)`, by, { act: "buyback", entryId });
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
  // Eliminate any 0-chip team BEFORE the draw. Otherwise a team sitting at 0 chips but
  // not yet flagged eliminated would be treated as "alive", get seated onto a table,
  // and then be removed by the post-redraw elimination reconcile — leaving that table
  // empty even though eligible teams remained (the "Table 2 stays Available" bug).
  const s = clone(reconcileEliminations(input));
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
    // A reshuffle is a full redraw: every ACTIVE table returns to play, so a stale
    // "lock" (a transient mid-round "don't send a match here") does NOT carry into the
    // new round — otherwise a locked table is silently skipped forever. To sit a table
    // out of a round, the TD reduces tables (inactive) in the Shuffle modal.
    t.locked = false;
    t.rematchSkipped = []; // stale anti-repeat notes never carry into the new round
  }
  // Drop any lingering in-progress matches (should be none if matches finished).
  s.matches = s.matches.filter((m) => m.status !== "in_progress");
  s.queue = shuffle(alive).map((e) => e.id);
  s.reshuffleCount = (s.reshuffleCount ?? 0) + 1;
  s.reshufflePending = false;
  s.reshuffleTableCount = null;
  s.reshuffleRemovingIds = []; // removals are finalized (closing tables now inactive)
  s.shuffleReady = false;
  // A new round begins: every shuffled survivor is round-remaining until seated.
  s.shuffleRound = !!s.shuffleMode;
  s.roundRemaining = s.shuffleMode ? [...s.queue] : [];
  pushEvent(s, "shuffle", `Reshuffle #${s.reshuffleCount} · ${alive.length} entries`, by, { act: "reshuffled" });
  // ANNOUNCE the new round's opening matchups (holder + pending challenger, NO timer)
  // — exactly like the tournament's opening. The TD starts them via Start All / Start
  // Remaining / individual Start Match; nothing auto-starts. We seat the pairs here
  // (rather than via seatAllTables, whose preStart branch only covers matches.length
  // === 0) so every reshuffle opens as "Waiting to Start". Because every survivor's
  // streak was reset to 0 above, these holders read as opening-wait (isOpeningWaitTable)
  // and no "Next Match / Incoming Team" callout fires until a table records its first
  // result this round (isPostMatchPending → holder streak > 0).
  for (const table of s.tables) {
    if (table.inactive || table.closing || table.locked) continue;
    if (table.holderId || table.pendingChallengerId || table.matchId) continue;
    const pair = takePair(s);
    if (!pair) break;
    const [a, b] = pair;
    table.lastLoserId = null;
    table.holderId = a;
    table.pendingChallengerId = b;
    table.status = "open";
    for (const id of [a, b]) {
      const e = entryById(s, id);
      if (e) { e.status = "playing"; e.tableId = table.id; }
      roundSeat(s, id);
    }
  }
  return s;
};

// Auto-ASSIGN the FINALS (reserve, do NOT start). When the field settles to
// exactly two alive players with no active match and no assignment yet, reserve
// them onto a table as holder + pendingChallenger — the SAME "assigned, awaiting
// Start Match" state normal winner-stays uses (table.holderId + pendingChallengerId
// + no matchId, consumed by startPendingMatch). The TD still taps Start Match to go
// live. This deliberately does NOT call finalizeReshuffle/startMatch (that would
// start immediately). It runs from the VM settle path (and on load), never render:
//   • Assigns once — if a table already holds both finalists (assigned) or a match
//     is in progress, it returns the input unchanged (duplicate protection).
//   • Repeats — after a final game whose loser still has chips, the board settles
//     to "winner is holder, loser queued" (anti-repeat blocks the rematch); this
//     reserves the loser as the pending challenger on the winner's table (clearing
//     lastLoserId so the two CAN face off), again awaiting Start Match.
//   • No table — if nothing is free it no-ops (UI: "waiting for an available
//     table"); it auto-assigns on the next settle once a table frees up.
// Chip-loss, elimination, winner selection and results are untouched: the reserved
// match still starts via startPendingMatch and resolves via recordWinner.
export const assignFinals = (input: ChipState): ChipState => {
  if (!input.startedAt || input.finishedAt) return input;
  const alive = aliveEntries(input);
  if (alive.length !== 2) return input;
  if (input.matches.some((m) => m.status === "in_progress")) return input; // playing
  // Already assigned (a table holds a holder + pending challenger, no match)?
  if (input.tables.some((t) => t.holderId && t.pendingChallengerId && !t.matchId))
    return input; // duplicate protection
  const seatable = (t: ChipTable) =>
    !t.inactive && !t.closing && !t.locked && !t.matchId;
  // Prefer the table where a finalist is already the holder (between-games); else
  // any empty seatable table (fresh finals).
  const table =
    input.tables.find(
      (t) => seatable(t) && !!t.holderId && alive.some((e) => e.id === t.holderId),
    ) ??
    input.tables.find(
      (t) => seatable(t) && !t.holderId && !t.pendingChallengerId,
    );
  if (!table) return input; // no table free → UI shows "waiting for a table"

  const s = clone(input);
  const tbl = s.tables.find((t) => t.id === table.id)!;
  const holderId =
    tbl.holderId && alive.some((e) => e.id === tbl.holderId)
      ? tbl.holderId
      : alive[0].id;
  const challengerId = holderId === alive[0].id ? alive[1].id : alive[0].id;
  tbl.holderId = holderId;
  tbl.pendingChallengerId = challengerId;
  tbl.matchId = null;
  tbl.lastLoserId = null; // finals: the two MUST face off — clear anti-repeat
  tbl.status = "open";
  // Reserve both on this table and pull them from the waiting queue.
  s.queue = s.queue.filter((id) => id !== holderId && id !== challengerId);
  for (const id of [holderId, challengerId]) {
    const e = entryById(s, id);
    if (e) {
      e.status = "playing";
      e.tableId = tbl.id;
    }
  }
  // Finals is not a shuffle round — clear any lingering round/drain state.
  s.shuffleRound = false;
  s.roundRemaining = [];
  s.reshufflePending = false;
  s.shuffleReady = false;
  s.reshuffleRemovingIds = []; // the pending cycle is superseded by finals
  pushEvent(
    s,
    "manual",
    `Finals assigned — ${teamName(entryById(s, holderId)!)} vs ${teamName(entryById(s, challengerId)!)} on ${tbl.label}`,
    null,
    { act: "finals" },
  );
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
    s.reshuffleRemovingIds = [];
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
  s.reshuffleRemovingIds = [];
  startDrain(s, by, "initial");
  return s;
};

// Begin a shuffle cycle WITH the TD's Reduce-tables selection applied first. Empty
// selected tables go inactive immediately; live ones are marked "closing after match"
// — and we record EXACTLY those (shuffle-owned closings) so a later Cancel Shuffle can
// reopen only them, never a table the TD closed manually. Then drain, same as
// beginShuffle. This is the ONE authoritative entry the Shuffle modal confirm uses.
export const startShuffleCycle = (
  input: ChipState,
  removeTableIds: string[],
  by?: number | null,
): ChipState => {
  // Record which selected tables THIS shuffle actually removes — computed from the
  // PRE-shuffle state: a table that was genuinely active (not already inactive, not
  // already closing) is shuffle-owned, whether it then goes inactive (empty) or
  // closing (live). A table already closing from a manual "Close After Current Match"
  // is deliberately EXCLUDED, so Cancel Shuffle leaves that manual decision intact.
  const owned = removeTableIds.filter((id) => {
    const t = input.tables.find((x) => x.id === id);
    return !!t && !t.inactive && !t.closing;
  });
  const withRemovals = removeTableIds.length ? closeTables(input, removeTableIds, by) : input;
  if (withRemovals.reshufflePending || withRemovals.shuffleReady) return withRemovals;
  const s = clone(withRemovals);
  s.shuffleMode = true;
  // ZERO live matches at confirm → nothing to wait for: redraw straight into Round 1
  // (the modal was the confirmation; NO separate Start Shuffle step). LIVE matches →
  // freeze + drain ("Finishing the Round") and rest at "Ready to Shuffle" until the TD
  // taps Start Shuffle (which runs finalizeReshuffle then). Later round completions also
  // rest at ready (via startDrain "round"); every non-immediate redraw is TD-triggered.
  if (!s.matches.some((m) => m.status === "in_progress")) {
    return finalizeReshuffle(s, null, by);
  }
  s.reshuffleRemovingIds = owned; // tracked for the drain window (Cancel can restore)
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
  // Cancelling resumes normal play — so undo THIS shuffle's table-removal intent for
  // EVERY table it removed (tracked in reshuffleRemovingIds), whichever way it went:
  //   • live table left "closing after match" → clear closing (stays active)
  //   • empty table made inactive by the shuffle → reactivate it
  // Tables the TD closed/deactivated for any OTHER reason (a manual "Close After
  // Current Match", or a pre-existing inactive table) are NOT in the set and are left
  // exactly as they are. seatAllTables (below) re-seats the restored tables.
  const shuffleOwned = new Set(s.reshuffleRemovingIds ?? []);
  for (const t of s.tables) {
    if (!shuffleOwned.has(t.id)) continue;
    if (t.closing) t.closing = false;
    if (t.inactive) { t.inactive = false; t.status = "open"; }
  }
  s.reshuffleRemovingIds = [];
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
  // Table removal never auto-seats/starts a match (table-management only). Requeued
  // players (above) are seated by the normal flow, not here.
  return s;
};

// ── SINGLE SOURCE OF TRUTH for every Chip recommended-table count ──────────────
// One entry = one singles PLAYER or one doubles TEAM (never individual partners); a
// table seats 2 entries. We want ~half the field playing at once but ALWAYS round
// DOWN so we only recommend COMPLETE matches — the odd extra entry waits instead of
// spawning another table. So the count is floor(entries / 4), floored at 1 once a
// match is possible, and 0 below 2 entries (no match can start).
//   2–7 → 1 · 8–11 → 2 · 12–15 → 3 · 16–19 → 4 · 20 → 5 · 32–35 → 8 · 36 → 9
export const getChipRecommendedTableCount = (entryCount: number): number =>
  entryCount < 2 ? 0 : Math.max(1, Math.floor(entryCount / 4));

// Recommended number of ACTIVE tables during LIVE play, for the alive-entry field
// size. Delegates to the shared helper so setup and live never diverge.
export const recommendedActiveTables = (remaining: number): number =>
  getChipRecommendedTableCount(remaining);

// ── Recommended SETUP tables (format-aware, single source of truth) ────────────
// A chip ENTRY is "playable" for table planning when it can actually be seated:
// singles always; scotch doubles only when BOTH partners are present (an incomplete
// team still waiting for a teammate can't start a match, so it isn't counted). Uses
// the SAME partner test as the setup→live start flow.
export const playableEntryCount = (s: ChipState): number => {
  const doubles = s.settings.format === "scotch_doubles";
  return s.entries.filter((e) => {
    if (e.status === "eliminated") return false;
    if (!doubles) return true;
    return e.p2MemberId != null || (!!e.p2Name && e.p2Name !== "") || e.p2ProfileId != null;
  }).length;
};

// How many tables to SET UP so ~half the field plays at once and the rest queue
// (winner-stays). Delegates to the shared helper (floor, never ceil) so setup and
// live recommendations are always identical. Uses TEAM count for doubles:
//   Singles  8→2, 10→2, 12→3, 16→4, 20→5   (entries = players)
//   Doubles  4→1, 8→2, 12→3, 16→4 teams    (entries = teams; = players 8→1, 16→2 …)
export const recommendedSetupTables = (playableEntries: number): number =>
  getChipRecommendedTableCount(playableEntries);

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
  // Closing/removing a table is a table-management action ONLY — it must never
  // implicitly seat the queue or start a match. Any freed holder is returned to the
  // queue above and will be seated by the normal flow (match completion / explicit
  // assign), not here. (Was: seatAllTables(s), which auto-started a new match.)
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

// Clear a table (administrative reset — NOT a match result): void any in-progress
// match (both teams back to the queue, no chip/W-L change) or send a waiting
// holder + pending challenger back to the queue. The TD chooses the destination:
//   • "next" → the affected entries go to the FRONT of the queue (up next), in a
//     deterministic order (match: aId then bId; waiting: holder then pending).
//   • "end"  → they go to the BACK, same deterministic order.
// Entries already in the queue are MOVED (not duplicated). The table is emptied and
// left OPEN (closing/holder/pending/timer all cleared) so Auto-Assign sees it
// correctly; a locked table stays locked. Not auto-re-seated — the TD keeps control.
export const clearTable = (
  input: ChipState,
  tableId: string,
  destination: "next" | "end" = "end",
  by?: number | null,
): ChipState => {
  const s = clone(input);
  const t = s.tables.find((x) => x.id === tableId);
  if (!t) return input;
  // A table already pending closure ("Close After Current Match") completes its
  // closure on clear (goes inactive) instead of reopening — same terminal state
  // recordWinner produces when a closing table's match finishes.
  const wasClosing = !!t.closing;
  // Affected entries, in deterministic order.
  const affected: string[] = [];
  let matchCancelled = false;
  const m = t.matchId ? s.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress") : null;
  if (m) {
    s.matches = s.matches.filter((mm) => mm.id !== m.id); // void — never counted
    affected.push(m.aId, m.bId);
    matchCancelled = true;
  } else if (t.holderId || t.pendingChallengerId) {
    if (t.holderId) affected.push(t.holderId);
    if (t.pendingChallengerId) affected.push(t.pendingChallengerId);
  } else {
    return input;
  }
  // Alive affected entries → queued; drop any existing queue occurrence (move, don't
  // duplicate) then place at the chosen end, preserving affected order.
  const alive = affected.filter((id) => { const e = entryById(s, id); return !!e && e.status !== "eliminated"; });
  for (const id of alive) {
    const e = entryById(s, id);
    if (e) { e.status = "queued"; e.tableId = null; }
  }
  s.queue = s.queue.filter((id) => !alive.includes(id));
  s.queue = destination === "next" ? [...alive, ...s.queue] : [...s.queue, ...alive];

  t.matchId = null;
  t.holderId = null;
  t.lastLoserId = null;
  t.pendingChallengerId = null;
  t.rematchSkipped = [];
  t.closing = false;
  t.status = "open";
  // Normal table → open/Auto-Assignable. Pending-closure table → complete the
  // closure (inactive; skipped by seating). `locked` is untouched in both cases.
  if (wasClosing) t.inactive = true;

  const names = alive.map((id) => { const e = entryById(s, id); return e ? teamName(e) : "a team"; }).join(" and ");
  const destLabel = destination === "next" ? "next in queue" : "end of queue";
  const verb = wasClosing ? "cleared and closed" : "cleared";
  pushEvent(
    s,
    "manual",
    names ? `${t.label} ${verb} — ${names} moved to ${destLabel}` : `${t.label} ${verb}`,
    by,
    {
      act: "table_cleared",
      tableId: t.id,
      tableLabel: t.label,
      entryIds: alive,
      destination: destination === "next" ? "next_in_queue" : "end_of_queue",
      matchCancelled,
      closedTable: wasClosing,
    },
  );
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
  // Reactivate / Cancel-Removal is a PURE table-state change — it must never seat the
  // queue or start a match (that caused "Cancel Removal starts a match on another
  // table"). The reactivated table fills via the normal flow / explicit assign.
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
  // Lock/Unlock is a PURE availability toggle — it must never seat the queue or start a
  // match. Unlocking just makes the table eligible again; it fills via the normal flow /
  // explicit assign (Assign Next Team / Auto Assign), not as a side effect of unlocking.
  return s;
};

// Lock or unlock EVERY active (non-inactive) table at once. Same pure-availability
// semantics as the single-table toggle — never seats, never starts/cancels a match,
// never reorders the queue. A locked table with a live match keeps playing and simply
// won't receive a new challenger afterward ("locks after match"). Writes ONE summary
// audit event with the affected count (not per-table, to avoid noise).
export const setAllTablesLocked = (
  input: ChipState,
  locked: boolean,
  by?: number | null,
): ChipState => {
  const s = clone(input);
  let n = 0;
  for (const t of s.tables) {
    if (t.inactive) continue; // removed tables aren't part of the active set
    if (!!t.locked === locked) continue;
    t.locked = locked;
    n += 1;
  }
  if (n === 0) return input;
  pushEvent(s, "manual", `All tables ${locked ? "locked" : "unlocked"} (${n})`, by, { count: n });
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
    // Winner-stays → assign as pending (TD confirms with Start Match). A manual
    // override is a deliberate pick, not an anti-repeat skip — clear any prior
    // selection's skip record so it can't linger on this new pending.
    table.pendingChallengerId = entryId;
    table.rematchSkipped = [];
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

// ── final placements ──────────────────────────────────────────────────────────
export const TOURNAMENT_FINISHED_TEXT = "Tournament Finished";
// Placement is by EXACT elimination order and nothing else (never chips, Fargo,
// or record): the last team standing is 1st; the team eliminated most recently is
// 2nd; … the first team eliminated is last. Timestamp ties fall back to a stable
// id order so the sequence is always deterministic. Derivable at any time from the
// committed state — persisted on Finish for durable career/earnings data.
export interface ChipPlacement { entryId: string; place: number }
export const finalPlacements = (s: ChipState): ChipPlacement[] => {
  const champ = s.winnerId ? entryById(s, s.winnerId) : null;
  // Elimination order comes from the COMMITTED event log, not eliminatedAt: two
  // eliminations in the same millisecond share a timestamp, so ordering by time
  // is non-deterministic. Events are appended newest-first (unshift), so the
  // first elimination event is the most-recent elimination and ranks 2nd, the
  // next ranks 3rd, … the oldest ranks last. Superseded (restored-past) events
  // are skipped so a rolled-back elimination never affects placement.
  const orderedElim: ChipEntry[] = [];
  const seen = new Set<string>();
  for (const ev of s.events) {
    if (ev.type !== "elimination" || ev.superseded) continue;
    const eid = (ev.payload?.entryId as string | undefined) ?? undefined;
    if (!eid || eid === s.winnerId || seen.has(eid)) continue;
    const e = entryById(s, eid);
    if (e) { seen.add(eid); orderedElim.push(e); }
  }
  // Safety net: any eliminated entry without a surviving event (edge case) is
  // appended by eliminatedAt desc, then a stable id order.
  const leftover = s.entries
    .filter((e) => e.id !== s.winnerId && e.eliminatedAt && !seen.has(e.id))
    .sort((a, b) => {
      const d = new Date(b.eliminatedAt as string).getTime() - new Date(a.eliminatedAt as string).getTime();
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const ordered = [...(champ ? [champ] : []), ...orderedElim, ...leftover];
  return ordered.map((e, i) => ({ entryId: e.id, place: i + 1 }));
};

// Fully tear down the live board for a completed tournament: Shuffle Mode + round
// state OFF, queue emptied, tables/timers/pending cleared, any lingering match
// closed, champion off the board. Pure + IDEMPOTENT — returns input unchanged
// when already clean. Used both by finishTournament AND on load of an
// already-finished tournament, so stale saved state is normalized and the ACTIVE
// reconcile guards (reconcileQueue would re-add the alive winner to the queue) are
// bypassed. This is what keeps the completed state from being revived.
export const reconcileCompleted = (input: ChipState): ChipState => {
  const dirty =
    !!input.shuffleMode || !!input.shuffleRound || !!input.reshufflePending || !!input.shuffleReady ||
    (input.roundRemaining?.length ?? 0) > 0 || input.reshuffleTableCount != null ||
    input.queue.length > 0 ||
    input.matches.some((m) => m.status === "in_progress") ||
    input.tables.some((t) => !!t.matchId || !!t.holderId || !!t.pendingChallengerId || !!t.lastLoserId);
  if (!dirty) return input;
  const s = clone(input);
  s.shuffleMode = false;
  s.shuffleRound = false;
  s.reshufflePending = false;
  s.shuffleReady = false;
  s.roundRemaining = [];
  s.reshuffleTableCount = null;
  const now = new Date().toISOString();
  for (const m of s.matches) {
    if (m.status === "in_progress") { m.status = "finished"; m.endedAt = m.endedAt ?? now; }
  }
  for (const t of s.tables) {
    t.matchId = null;
    t.holderId = null;
    t.pendingChallengerId = null;
    t.lastLoserId = null;
    if (!t.inactive) t.status = "open";
  }
  s.queue = [];
  const champ = s.winnerId ? entryById(s, s.winnerId) : null;
  if (champ) champ.tableId = null;
  return s;
};

// Mark the champion's tournament finished: fully tear down the live board (via
// reconcileCompleted), stamp finishedAt, and log the distinct "Tournament
// Finished" audit event ONCE. Idempotent — the finished-event check makes repeated
// calls no-ops. Only valid once a champion is decided (winnerId); the tournament
// ROW status is flipped separately by the vm.
export const finishTournament = (input: ChipState, by?: number | null): ChipState => {
  if (!input.winnerId) return input;
  if (input.events.some((e) => e.type === "manual" && e.text === TOURNAMENT_FINISHED_TEXT)) return input;
  const base = reconcileCompleted(input);
  const s = base === input ? clone(input) : base;
  if (!s.finishedAt) s.finishedAt = new Date().toISOString();
  const placements = finalPlacements(s);
  pushEvent(s, "manual", TOURNAMENT_FINISHED_TEXT, by, {
    act: "tournament_finished",
    placements: placements.map((p) => ({ entryId: p.entryId, place: p.place })),
  });
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
