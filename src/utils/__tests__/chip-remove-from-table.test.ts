// src/utils/__tests__/chip-remove-from-table.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-remove-from-table.test.ts
// Engine removeFromTable: take ONE entry off a table (other stays seated), void a live match
// without recording a result, and queue the removed entry at the chosen end. Every case also
// runs the post-action reconcile pipeline the viewmodel applies, so nothing "repairs" it back.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  assignFinals,
  clearTable,
  emptyChipState,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  removeFromTable,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
  withRestorePoint,
  restoreToPoint,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

const entry = (name: string): ChipEntry => ({
  id: newId("e"),
  p1Name: name,
  p1Fargo: 500,
  p1Phone: "",
  p2Name: "",
  p2Fargo: null,
  teamFargo: 500,
  startChips: 0,
  chips: 0,
  paid: true,
  checkedIn: true,
  paidSidePots: [],
  status: "queued",
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  eliminations: 0,
  createdAt: new Date().toISOString(),
} as ChipEntry);

// The viewmodel's post-action pipeline (minus the hook-private materializeLive).
const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s)))));

// 6 players, 2 tables, started → opening matchups seated (holder + pending challenger).
const seatedState = (): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: ["A", "B", "C", "D", "E", "F"].map(entry) };
  s = addTables(s, 2);
  return startChipTournament(s);
};
const liveState = (): ChipState => startAllMatches(seatedState());

const e = (s: ChipState, id: string) => s.entries.find((x) => x.id === id)!;
const occurrences = (s: ChipState, id: string) => s.queue.filter((q) => q === id).length;
const snapshot = (s: ChipState) =>
  JSON.stringify(s.entries.map((x) => [x.id, x.chips, x.wins, x.losses, x.streak, x.eliminations]));

// Every alive entry is in exactly one place: the queue once, or seated (tableId set).
const assertConsistent = (s: ChipState) => {
  for (const x of s.entries) {
    if (x.status === "eliminated") continue;
    const inQ = occurrences(s, x.id);
    const seated = s.tables.some(
      (t) => t.holderId === x.id || t.pendingChallengerId === x.id ||
        s.matches.some((m) => m.id === t.matchId && m.status === "in_progress" && (m.aId === x.id || m.bId === x.id)),
    );
    assert.equal(inQ + (seated ? 1 : 0), 1, `${x.p1Name} must be in exactly one place (queue=${inQ}, seated=${seated})`);
    if (inQ) assert.equal(x.status, "queued");
  }
};

test("waiting table: remove the pending challenger → holder stays, challenger to NEXT", () => {
  const s0 = seatedState();
  const t = s0.tables[0];
  assert.ok(t.holderId && t.pendingChallengerId, "opening matchup seated");
  const holder = t.holderId!, pend = t.pendingChallengerId!;
  const s1 = pipeline(removeFromTable(s0, t.id, pend, "next"));
  const t1 = s1.tables.find((x) => x.id === t.id)!;
  assert.equal(t1.holderId, holder);
  assert.equal(t1.pendingChallengerId, null);
  assert.equal(s1.queue[0], pend);
  assert.equal(e(s1, pend).status, "queued");
  assert.equal(e(s1, pend).tableId, null);
  assert.equal(e(s1, holder).tableId, t.id);
  assertConsistent(s1);
});

test("waiting table: remove the holder → pending challenger becomes holder, removed to END", () => {
  const s0 = seatedState();
  const t = s0.tables[0];
  const holder = t.holderId!, pend = t.pendingChallengerId!;
  const s1 = pipeline(removeFromTable(s0, t.id, holder, "end"));
  const t1 = s1.tables.find((x) => x.id === t.id)!;
  assert.equal(t1.holderId, pend);
  assert.equal(t1.pendingChallengerId, null);
  assert.equal(s1.queue[s1.queue.length - 1], holder);
  assert.equal(occurrences(s1, holder), 1);
  assertConsistent(s1);
});

for (const side of ["a", "b"] as const) {
  for (const dest of ["next", "end"] as const) {
    test(`live match: remove player ${side.toUpperCase()} → ${dest}: match voided, no result, other stays`, () => {
      const s0 = liveState();
      const t = s0.tables[0];
      const m = s0.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress")!;
      assert.ok(m, "live match");
      const removed = side === "a" ? m.aId : m.bId;
      const other = side === "a" ? m.bId : m.aId;
      const before = snapshot(s0);
      const s1 = pipeline(removeFromTable(s0, t.id, removed, dest));
      const t1 = s1.tables.find((x) => x.id === t.id)!;
      // voided: gone from matches (never counted), no finished/forfeit record created
      assert.equal(s1.matches.find((mm) => mm.id === m.id), undefined);
      assert.equal(s1.matches.filter((mm) => mm.status !== "in_progress").length, 0);
      // no chip / W-L / streak / elimination change for anyone
      assert.equal(snapshot(s1), before);
      // remaining player seated as the table's waiting holder
      assert.equal(t1.matchId, null);
      assert.equal(t1.holderId, other);
      assert.equal(e(s1, other).tableId, t.id);
      assert.notEqual(e(s1, other).status, "queued");
      // removed player queued at the chosen end, once
      assert.equal(e(s1, removed).status, "queued");
      assert.equal(e(s1, removed).tableId, null);
      assert.equal(occurrences(s1, removed), 1);
      if (dest === "next") assert.equal(s1.queue[0], removed);
      else assert.equal(s1.queue[s1.queue.length - 1], removed);
      // other table untouched
      assert.deepEqual(s1.tables[1], s0.tables[1]);
      assertConsistent(s1);
      // one audit event
      const ev = s1.events[0];
      assert.equal(ev.payload?.act, "table_player_removed");
      assert.equal(ev.payload?.matchVoided, true);
      assert.equal(ev.payload?.remainingId, other);
    });
  }
}

test("live match on a CLOSING table: remaining player requeued to front, table closes", () => {
  const s0 = liveState();
  const t = s0.tables[0];
  const m = s0.matches.find((mm) => mm.id === t.matchId)!;
  const withClosing: ChipState = { ...s0, tables: s0.tables.map((x) => (x.id === t.id ? { ...x, closing: true } : x)) };
  const s1 = pipeline(removeFromTable(withClosing, t.id, m.aId, "end"));
  const t1 = s1.tables.find((x) => x.id === t.id)!;
  assert.equal(t1.inactive, true);
  assert.equal(t1.holderId, null);
  assert.equal(s1.queue[0], m.bId);
  assert.equal(s1.queue[s1.queue.length - 1], m.aId);
  assertConsistent(s1);
});

test("guards: unknown table / entry not at the table → no change", () => {
  const s0 = liveState();
  const notSeated = s0.queue[0];
  assert.equal(removeFromTable(s0, "nope", notSeated, "next"), s0);
  assert.equal(removeFromTable(s0, s0.tables[0].id, notSeated, "next"), s0);
});

test("undo: restoring the pre-action point brings back the live match exactly", () => {
  const s0 = liveState();
  const t = s0.tables[0];
  const m = s0.matches.find((mm) => mm.id === t.matchId)!;
  const acted = removeFromTable(s0, t.id, m.aId, "next");
  const newIds = acted.events.slice(0, acted.events.length - s0.events.length).map((x) => x.id);
  const withRp = withRestorePoint(acted, s0, newIds, acted.events[0].text);
  const rp = withRp.restorePoints![withRp.restorePoints!.length - 1];
  const restored = restoreToPoint(withRp, rp.primaryEventId, { reason: "test undo" });
  const tR = restored.tables.find((x) => x.id === t.id)!;
  assert.equal(tR.matchId, m.id);
  assert.ok(restored.matches.some((mm) => mm.id === m.id && mm.status === "in_progress"));
  assert.deepEqual(restored.queue, s0.queue);
});

test("existing clearTable is unchanged: both players leave, table opens", () => {
  const s0 = liveState();
  const t = s0.tables[0];
  const m = s0.matches.find((mm) => mm.id === t.matchId)!;
  const s1 = clearTable(s0, t.id, "next");
  const t1 = s1.tables.find((x) => x.id === t.id)!;
  assert.equal(t1.holderId, null);
  assert.equal(t1.matchId, null);
  assert.deepEqual(s1.queue.slice(0, 2), [m.aId, m.bId]);
});
