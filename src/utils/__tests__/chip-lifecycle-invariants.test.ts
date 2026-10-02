// src/utils/__tests__/chip-lifecycle-invariants.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-lifecycle-invariants.test.ts
//
// Full Chip tournaments (start → champion → finish) driven through the REAL engine with the
// SAME post-action settle + restore points the VM's update() applies, over many seeded random
// runs: singles + scotch doubles, 2–48 entrants, 1–8 tables (fewer and more than recommended),
// 1–5 starting chips (and mixed Fargo tiers), plus TD noise — queue Move Up/Down/Top/Bottom,
// table lock/unlock, tables added mid-event, Assign Next Team, Undo, and Shuffle Mode cycles.
// After EVERY action it checks the invariants that matter on a busy night:
//   • chips are non-negative integers; 0 chips ⇔ eliminated (for field entrants)
//   • no duplicate queue entries; nobody is both queued and seated; nobody on two tables
//   • a table holds at most one live match and its players are the ones seated there
//   • eliminated teams are never queued or seated; alive teams are never lost (queued or seated)
//   • without Undo, chips lost == valid finished matches (no double deduction)
//   • the event never deadlocks: until a champion exists there is always a next step
// and at the end: one champion, finishTournament places every entrant exactly once.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTable,
  addTables,
  assignNextTeam,
  beginShuffle,
  cancelReshuffle,
  clearTable,
  chipFinalsState,
  dashboard,
  emptyChipState,
  finalPlacements,
  finishTournament,
  newId,
  recordWinner,
  reorderQueue,
  seatFinals,
  setShuffleMode,
  setTableLocked,
  settleChipState,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  startShuffle,
  startShuffleCycle,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipFormat, ChipState } from "../../models/types/chip.types";

// ── deterministic Math.random (the engine shuffles + mints ids with it) ─────────────────────
const realRandom = Math.random;
const seeded = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

const entry = (i: number, doubles: boolean, fargo: number): ChipEntry =>
  ({
    id: newId("e"), p1Name: `P${i}`, p1Fargo: fargo, p1Phone: "",
    p2Name: doubles ? `Q${i}` : "", p2Fargo: doubles ? fargo : null, teamFargo: doubles ? fargo * 2 : fargo,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;

// VM update(): shared settle + a restore point for logged actions (what Undo walks back).
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  let next = settleChipState(fn(c));
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  if (added > 1) {
    const tx = newId("tx");
    next = { ...next, events: next.events.map((e, i) => (i < added ? { ...e, txId: tx } : e)) };
  }
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[ev.length - 1].text);
};

interface Opts {
  format: ChipFormat;
  n: number;
  tables: number;
  chips: number | "tiers";
  seed: number;
  noise?: boolean; // queue moves, locks, Assign Next Team, add tables
  undo?: boolean;
  shuffle?: boolean;
}

const seatedIds = (s: ChipState): string[] => {
  const out: string[] = [];
  for (const t of s.tables) {
    if (t.holderId) out.push(t.holderId);
    if (t.pendingChallengerId) out.push(t.pendingChallengerId);
    const m = t.matchId ? s.matches.find((x) => x.id === t.matchId) : null;
    if (m) for (const id of [m.aId, m.bId]) if (id !== t.holderId && id !== t.pendingChallengerId) out.push(id);
  }
  return out;
};

const check = (s: ChipState, o: Opts, step: number, chipsConserved: boolean) => {
  const ctx = `${o.format} n=${o.n} tables=${o.tables} chips=${o.chips} seed=${o.seed} step=${step}`;
  const field = s.entries.filter((e) => e.checkedIn);
  for (const e of field) {
    assert.ok(Number.isInteger(e.chips) && e.chips >= 0, `bad chips ${e.chips} ${ctx}`);
    if (e.status === "eliminated") assert.equal(e.chips, 0, `eliminated with ${e.chips} chips ${ctx}`);
    else if (!s.winnerId) assert.ok(e.chips > 0 || s.matches.some((m) => m.status === "in_progress" && (m.aId === e.id || m.bId === e.id)), `alive with 0 chips and not playing ${e.id} ${ctx}`);
  }
  assert.equal(new Set(s.queue).size, s.queue.length, `duplicate queue entry ${ctx}`);
  const seated = seatedIds(s);
  assert.equal(new Set(seated).size, seated.length, `entry seated twice ${JSON.stringify(seated)} ${ctx}`);
  for (const id of s.queue) assert.ok(!seated.includes(id), `entry both queued and seated ${id} ${ctx}`);
  const live = s.matches.filter((m) => m.status === "in_progress");
  const perTable = new Map<string, number>();
  for (const m of live) {
    perTable.set(m.tableId, (perTable.get(m.tableId) ?? 0) + 1);
    const t = s.tables.find((x) => x.id === m.tableId);
    assert.ok(t && t.matchId === m.id, `live match ${m.id} not on its table ${ctx}`);
  }
  for (const [tid, c] of perTable) assert.equal(c, 1, `table ${tid} has ${c} live matches ${ctx}`);
  const byId = new Map(s.entries.map((e) => [e.id, e]));
  for (const id of [...s.queue, ...seated]) assert.notEqual(byId.get(id)?.status, "eliminated", `eliminated ${id} still in play ${ctx}`);
  if (!s.winnerId) {
    const where = new Set([...s.queue, ...seated]);
    for (const e of field) if (e.status !== "eliminated") assert.ok(where.has(e.id), `alive entry ${e.id} lost (not queued, not seated) ${ctx}`);
    // Dashboard counts reconcile with the records ("9 Remaining · 2 Active Tables · 7 Waiting").
    const d = dashboard(s);
    assert.equal(d.playersRemaining, where.size, `Remaining ${d.playersRemaining} != queued+seated ${where.size} ${ctx}`);
    assert.equal(d.playersRemaining + d.eliminated, field.length, `Remaining+Eliminated != field ${ctx}`);
    assert.equal(d.queueCount, s.queue.length);
    assert.equal(d.activeTables, live.length, `Active Tables ${d.activeTables} != live matches ${live.length} ${ctx}`);
  }
  if (chipsConserved) {
    const lost = field.reduce((a, e) => a + (e.startChips - e.chips), 0);
    const finished = s.matches.filter((m) => m.status === "finished").length;
    assert.equal(lost, finished, `chips lost ${lost} != finished matches ${finished} ${ctx}`);
  }
};

const runChip = (o: Opts) => {
  Math.random = seeded(o.seed);
  try {
    const rand = seeded(o.seed * 7 + 1);
    const doubles = o.format === "scotch_doubles";
    let s = emptyChipState(o.format);
    const tiers =
      o.chips === "tiers"
        ? [
            { id: "t1", minFargo: 0, maxFargo: 449, chips: 4 },
            { id: "t2", minFargo: 450, maxFargo: 599, chips: 3 },
            { id: "t3", minFargo: 600, maxFargo: null, chips: 2 },
          ]
        : [{ id: "t1", minFargo: 0, maxFargo: null, chips: o.chips }];
    // Scotch doubles tiers match the COMBINED team Fargo.
    const scaled = doubles ? tiers.map((t) => ({ ...t, minFargo: t.minFargo * 2, maxFargo: t.maxFargo == null ? null : t.maxFargo * 2 + 1 })) : tiers;
    s = { ...s, settings: { ...s.settings, tiers: scaled } };
    s = { ...s, entries: Array.from({ length: o.n }, (_, i) => entry(i, doubles, 300 + Math.floor(rand() * 500))) };
    s = addTables(s, o.tables);
    s = settleChipState(startChipTournament(s));
    s = act(s, startAllMatches);
    let usedUndo = false;
    let steps = 0;
    let shuffles = 0;
    let tdRecoveries = 0;
    let strandedHolders = 0;
    check(s, o, 0, true);
    while (!s.winnerId) {
      steps++;
      assert.ok(steps < 20000, `runaway ${o.format} n=${o.n} seed=${o.seed}`);
      const r = rand();
      const before = s;
      if (o.noise && r < 0.05 && s.queue.length > 1) {
        const id = s.queue[Math.floor(rand() * s.queue.length)];
        s = act(s, (c) => reorderQueue(c, id, (["up", "down", "top", "bottom"] as const)[Math.floor(rand() * 4)]));
      } else if (o.noise && r < 0.08 && s.tables.length) {
        const t = s.tables[Math.floor(rand() * s.tables.length)];
        s = act(s, (c) => setTableLocked(c, t.id, !t.locked));
      } else if (o.noise && r < 0.09 && s.tables.length < o.tables + 3) {
        s = act(s, (c) => addTable(c));
      } else if (o.noise && r < 0.11) {
        const empty = s.tables.find((t) => !t.matchId && !t.holderId && !t.pendingChallengerId && !t.locked && !t.inactive);
        if (empty) s = act(s, (c) => assignNextTeam(c, empty.id));
      } else if (o.undo && r < 0.13 && (s.restorePoints?.length ?? 0) > 2) {
        s = act(s, (c) => undoLastActions(c, 1 + Math.floor(rand() * 2), { reason: "Director mistake" } as any));
        usedUndo = true;
      } else if (o.shuffle && r < 0.16 && !s.reshufflePending && !s.shuffleReady && !s.shuffleRound && shuffles < 4) {
        s = act(s, (c) => beginShuffle(c));
        shuffles++;
      } else {
        // Normal play: start everything startable, then finish one live match.
        if (s.shuffleReady) s = act(s, (c) => startShuffle(c));
        const fin = chipFinalsState(s);
        if (fin.kind === "select") s = act(s, (c) => seatFinals(c, fin.tableIds[0]));
        for (const t of s.tables)
          if (t.holderId && t.pendingChallengerId && !t.matchId) s = act(s, (c) => startPendingMatch(c, t.id));
        const live = s.matches.filter((m) => m.status === "in_progress");
        if (live.length) {
          const m = live[Math.floor(rand() * live.length)];
          s = act(s, (c) => recordWinner(c, m.id, rand() < 0.5 ? m.aId : m.bId));
        } else if (s === before) {
          // Nothing moved: release locks (a TD would) — then it must be able to progress.
          if (s.tables.some((t) => t.locked)) {
            for (const t of s.tables) if (t.locked) s = act(s, (c) => setTableLocked(c, t.id, false));
          } else if (s.shuffleMode && !s.reshufflePending && !s.shuffleReady && !s.shuffleRound) {
            s = act(s, (c) => setShuffleMode(c, false));
          } else {
            // No live match, nothing pending: chip seating only re-runs inside recordWinner and
            // there is no Auto Run yet, so the TD must act. Model exactly what the UI offers:
            //   1. Assign Next Team on a waiting holder / empty usable table (needs queued teams);
            //   2. if every alive team is a lone waiting winner (empty queue), Clear Table on one
            //      (its winner rejoins the queue) and Assign Next Team on another.
            const fin2 = chipFinalsState(s);
            const usable = (t: ChipState["tables"][number]) => !t.inactive && !t.locked && !t.closing && !t.matchId && !t.pendingChallengerId;
            const fillable = s.tables.find((t) => usable(t) && (t.holderId ? s.queue.length >= 1 : s.queue.length >= 2));
            if (fillable) {
              s = act(s, (c) => assignNextTeam(c, fillable.id));
              tdRecoveries++;
            } else {
              const lone = s.tables.filter((t) => usable(t) && t.holderId);
              if (lone.length >= 2 && s.queue.length === 0) {
                s = act(s, (c) => clearTable(c, lone[0].id, "next"));
                s = act(s, (c) => assignNextTeam(c, lone[1].id));
                tdRecoveries++;
                strandedHolders++;
              }
            }
            if (s === before && fin2.kind === "none" && process.env.CHIP_DUMP) console.log(JSON.stringify({ tables: s.tables, queue: s.queue, shuffleMode: s.shuffleMode, roundRemaining: s.roundRemaining, reshufflePending: s.reshufflePending, shuffleRound: s.shuffleRound, shuffleReady: s.shuffleReady, events: s.events.slice(0, 6).map((e) => e.text) }, null, 1));
            assert.ok(s !== before || fin2.kind !== "none",
              `DEADLOCK ${o.format} n=${o.n} tables=${o.tables} seed=${o.seed} step=${steps} queue=${s.queue.length} alive=${s.entries.filter((e) => e.status !== "eliminated").length} pending=${!!s.reshufflePending} ready=${!!s.shuffleReady} round=${!!s.shuffleRound} finals=${fin2.kind}`);
          }
        }
      }
      check(s, o, steps, !usedUndo);
    }
    const done = finishTournament(s);
    const places = finalPlacements(done);
    const field = done.entries.filter((e) => e.checkedIn);
    assert.equal(places.length, field.length, `placements ${places.length} != field ${field.length}`);
    assert.equal(new Set(places.map((p: any) => p.entryId ?? p.id)).size, places.length, "duplicate placement");
    assert.equal(dashboard(done).playersRemaining, 1);
    assert.equal(field.filter((e) => e.status !== "eliminated").length, 1);
    return { steps, shuffles, usedUndo, tdRecoveries, strandedHolders };
  } finally {
    Math.random = realRandom;
  }
};

const FORMATS: ChipFormat[] = ["singles", "scotch_doubles"];

test("chip: plain winner-stays runs complete for every size / table count / chip count", () => {
  let runs = 0;
  for (const format of FORMATS)
    for (const n of [2, 3, 4, 5, 8, 13, 16, 32])
      for (const tables of [1, 2, 4, 8])
        for (const chips of [1, 2, 3, 5, "tiers"] as const) {
          runChip({ format, n, tables, chips, seed: n * 97 + tables * 13 + (typeof chips === "number" ? chips : 9) + (format === "singles" ? 0 : 5000) });
          runs++;
        }
  assert.ok(runs >= 300, `runs=${runs}`);
});

test("chip: TD noise (queue moves, table locks, added tables, Assign Next Team) never breaks invariants", () => {
  for (const format of FORMATS)
    for (const n of [4, 7, 16, 33])
      for (const tables of [1, 3, 6])
        for (let seed = 1; seed <= 6; seed++) runChip({ format, n, tables, chips: 3, seed: seed * 1009 + n + tables, noise: true });
});

test("chip: Shuffle Mode cycles (multiple reshuffles) complete with a champion", () => {
  let shuffled = 0;
  for (const format of FORMATS)
    for (const n of [4, 6, 9, 16, 24])
      for (const tables of [1, 2, 4])
        for (let seed = 1; seed <= 5; seed++) {
          const r = runChip({ format, n, tables, chips: 3, seed: seed * 7919 + n * 3 + tables, shuffle: true, noise: seed % 2 === 0 });
          shuffled += r.shuffles;
        }
  assert.ok(shuffled > 50, `shuffles exercised: ${shuffled}`);
});

test("chip: Undo / restore mid-event keeps every structural invariant and still finishes", () => {
  for (const format of FORMATS)
    for (const n of [4, 8, 16])
      for (const tables of [1, 3])
        for (let seed = 1; seed <= 6; seed++) runChip({ format, n, tables, chips: 2, seed: seed * 104729 + n + tables, undo: true, noise: true });
});

test("chip: a larger field (48 entrants, 10 tables, 5 chips) finishes in bounded work", () => {
  const t0 = Date.now();
  const r = runChip({ format: "singles", n: 48, tables: 10, chips: 5, seed: 31337, noise: true, shuffle: true });
  assert.ok(r.steps > 0);
  // Engine cost guard (pure, local): a whole 48-entry event incl. invariant checks.
  assert.ok(Date.now() - t0 < 60000, `took ${Date.now() - t0}ms`);
});

test("chip parity: web 'Disable Shuffle' and native 'Cancel Shuffle' leave the same tables active", () => {
  for (const format of FORMATS) {
    Math.random = seeded(99);
    try {
      let s = emptyChipState(format);
      s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
      s = { ...s, entries: Array.from({ length: 12 }, (_, i) => entry(i, format === "scotch_doubles", 500)) };
      s = addTables(s, 4);
      s = act(settleChipState(startChipTournament(s)), startAllMatches);
      // Shuffle that removes two of the four tables, then drain to Ready.
      const remove = s.tables.slice(2).map((t) => t.id);
      s = act(s, (c) => startShuffleCycle(c, remove));
      for (let k = 0; k < 50 && !s.shuffleReady; k++) {
        for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) s = act(s, (c) => startPendingMatch(c, t.id));
        const m = s.matches.find((x) => x.status === "in_progress");
        if (m) s = act(s, (c) => recordWinner(c, m.id, m.aId));
      }
      assert.equal(s.shuffleReady, true, "reached Ready to Shuffle");
      const active = (x: ChipState) => x.tables.filter((t) => !t.inactive && !t.closing).map((t) => t.id).sort();
      const viaCancel = act(s, (c) => cancelReshuffle(c));
      const viaDisable = act(s, (c) => setShuffleMode(c, false));
      assert.deepEqual(active(viaDisable), active(viaCancel), `${format}: same active tables either way`);
      assert.equal(active(viaDisable).length, 4, "the shuffle-closed tables are back");
      assert.equal(viaDisable.shuffleMode, false);
      assert.equal(viaCancel.shuffleMode, true, "Cancel keeps the mode on (unchanged)");
    } finally {
      Math.random = realRandom;
    }
  }
});
