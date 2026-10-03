// src/utils/__tests__/chip-undo-live-match.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-undo-live-match.test.ts
// Undo / Restore while a match that STARTED AFTER the restore point is still live (2026-10-03
// audit). restoreToPoint used to leave that match in the log; reconcileMatches then treated it as
// a ghost and requeued its players even though the snapshot re-seats them — seated entries read
// "queued" (a 1-chip pending challenger could be chip-adjusted out while seated) and the next
// load voided the restored match. In the audit fuzz this hit ~50% of undo/restore operations.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  emptyChipState,
  newId,
  recordWinner,
  reconcileMatches,
  settleChipState,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipFormat, ChipState } from "../../models/types/chip.types";

const entry = (name: string, doubles: boolean): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: 500, p1Phone: "", p2Name: doubles ? `${name}2` : "", p2Fargo: doubles ? 450 : null,
    teamFargo: doubles ? 950 : 500, startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
// Mirrors the VM update(): shared settle, then a restore point for any action that logged events.
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  let next = settleChipState(fn(c));
  if (next === c) return c;
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  if (added > 1) {
    const tx = newId("tx");
    next = { ...next, events: next.events.map((e, i) => (i < added ? { ...e, txId: tx } : e)) };
  }
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[ev.length - 1].text);
};
const undo = (s: ChipState, n: number) => settleChipState(undoLastActions(s, n, { reason: "test" }));
const announced = (format: ChipFormat, n = 6, tables = 2, chips = 1): ChipState => {
  let s = emptyChipState(format);
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips }] } };
  s = { ...s, entries: "ABCDEFGHIJ".slice(0, n).split("").map((c) => entry(c, format === "scotch_doubles")) };
  s = addTables(s, tables);
  return settleChipState(startChipTournament(s)); // opening matchups announced, nothing started
};

// Every team the board seats (holder / pending challenger / live match) is "playing" on THAT table
// and not in the queue; every live match's players are seated on its table.
const assertSeatingConsistent = (s: ChipState, label: string) => {
  const byId = new Map(s.entries.map((e) => [e.id, e]));
  for (const t of s.tables) {
    if (t.inactive) continue;
    const m = t.matchId ? s.matches.find((x) => x.id === t.matchId) : null;
    const seated = m ? [m.aId, m.bId] : [t.holderId, t.pendingChallengerId];
    for (const id of seated) {
      if (!id) continue;
      const e = byId.get(id)!;
      assert.equal(e.status, "playing", `${label}: ${id} seated on ${t.id} but status=${e.status}`);
      assert.equal(e.tableId, t.id, `${label}: ${id} seated on ${t.id} but tableId=${e.tableId}`);
      assert.ok(!s.queue.includes(id), `${label}: ${id} seated AND queued`);
    }
  }
  for (const m of s.matches.filter((x) => x.status === "in_progress"))
    assert.ok(s.tables.some((t) => t.matchId === m.id), `${label}: live match ${m.id} has no table`);
};

for (const format of ["singles", "scotch_doubles"] as ChipFormat[]) {
  test(`[${format}] Undo of Start All re-announces the opening matchups with consistent seating`, () => {
    const before = announced(format);
    const started = act(before, (c) => startAllMatches(c));
    assert.ok(started.matches.some((m) => m.status === "in_progress"));
    const u = undo(started, 1);
    assertSeatingConsistent(u, "after undo");
    assert.equal(u.matches.filter((m) => m.status === "in_progress").length, 0, "nothing live after undo");
    // Stable across a load (reconcile is what the next load / poll runs).
    assert.deepEqual(reconcileMatches(u).entries.map((e) => e.status), u.entries.map((e) => e.status));
  });

  test(`[${format}] wrong result → next match started → Undo 2 restores the original live match`, () => {
    let s = act(announced(format, 6, 2, 3), (c) => startAllMatches(c));
    const t0 = s.tables.find((t) => t.matchId)!;
    const m0 = s.matches.find((m) => m.id === t0.matchId)!;
    s = act(s, (c) => recordWinner(c, m0.id, m0.bId));
    const tAfter = s.tables.find((t) => t.id === t0.id)!;
    if (tAfter.pendingChallengerId) s = act(s, (c) => startPendingMatch(c, t0.id));
    const u = undo(s, tAfter.pendingChallengerId ? 2 : 1);
    assertSeatingConsistent(u, "after undo 2");
    const restored = u.matches.find((m) => m.status === "in_progress" && m.tableId === t0.id)!;
    assert.ok(restored, "the original match is live again on its table");
    assert.deepEqual([restored.aId, restored.bId].sort(), [m0.aId, m0.bId].sort());
    // A reload must not void it.
    const reloaded = reconcileMatches(u);
    assert.ok(reloaded.matches.some((m) => m.id === restored.id && m.status === "in_progress"));
    assertSeatingConsistent(reloaded, "after reload");
  });
}
