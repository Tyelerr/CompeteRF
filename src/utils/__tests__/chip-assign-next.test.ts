// src/utils/__tests__/chip-assign-next.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-assign-next.test.ts
// Native table-card "Assign Next Team" / "Assign Next Match" = the existing engine
// assignNextTeam (vm.assignNextTeam), shown only when canAssignNextTeam says it would seat
// someone. Covers the Remove Player → refill flow, the no-eligible fallback, and Shuffle rules.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  assignFinals,
  assignNextTeam,
  beginShuffle,
  canAssignNextTeam,
  clearTable,
  emptyChipState,
  finalizeReshuffle,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  reconcileShuffleRound,
  removeFromTable,
  returnActiveMatchesToQueue,
  setTableLocked,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

const entry = (name: string): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileShuffleRound(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s))))));
const live = (n = 8, tables = 2): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGHIJ".slice(0, n).split("").map(entry) };
  s = addTables(s, tables);
  return pipeline(startAllMatches(startChipTournament(s)));
};
const liveTable = (s: ChipState) => s.tables.find((t) => t.matchId)!;

test("live match: no assign button (Select Winner owns that state)", () => {
  const s = live();
  assert.equal(canAssignNextTeam(s, liveTable(s).id), false);
});

test("Remove Player → remaining player waits → Assign Next Team seats the next eligible → Start Match", () => {
  let s = live();
  const t = liveTable(s);
  const m = s.matches.find((x) => x.id === t.matchId)!;
  s = pipeline(removeFromTable(s, t.id, m.bId, "end"));
  const after = s.tables.find((x) => x.id === t.id)!;
  assert.equal(after.holderId, m.aId, "A stays seated");
  assert.equal(canAssignNextTeam(s, t.id), true, "button shows");
  const front = s.queue[0];
  s = pipeline(assignNextTeam(s, t.id));
  const filled = s.tables.find((x) => x.id === t.id)!;
  assert.equal(filled.holderId, m.aId);
  assert.equal(filled.pendingChallengerId, front, "next eligible queued team is the challenger");
  assert.equal(canAssignNextTeam(s, t.id), false, "button gone once assigned");
  s = pipeline(startPendingMatch(s, t.id));
  assert.ok(s.matches.some((x) => x.tableId === t.id && x.status === "in_progress"), "normal flow continues");
});

test("Clear Table → empty → Assign Next Match fills it with the next pair (normal play: first two queued)", () => {
  let s = live();
  const t = liveTable(s);
  s = pipeline(clearTable(s, t.id, "end"));
  assert.equal(canAssignNextTeam(s, t.id), true);
  const [q0, q1] = s.queue;
  s = pipeline(assignNextTeam(s, t.id));
  const m = s.matches.find((x) => x.tableId === t.id && x.status === "in_progress")!;
  assert.deepEqual([m.aId, m.bId], [q0, q1], "same pair the old assignment produced");
});

test("no eligible player → no button, and the action is a no-op", () => {
  let s = live(4, 2); // 4 players on 2 tables → nobody queued
  const t = liveTable(s);
  const m = s.matches.find((x) => x.id === t.matchId)!;
  s = pipeline(removeFromTable(s, t.id, m.bId, "end")); // A waits; B is the only queued entry
  const noQueue: ChipState = { ...s, queue: [] }; // …and nobody eligible
  assert.equal(canAssignNextTeam(noQueue, t.id), false, "passive Waiting for Opponent");
  assert.equal(assignNextTeam(noQueue, t.id).tables.find((x) => x.id === t.id)!.pendingChallengerId ?? null, null, "no-op");
  const empty = pipeline(clearTable(s, t.id, "end")); // both back; 2 queued
  const one: ChipState = { ...empty, queue: empty.queue.slice(0, 1) };
  assert.equal(canAssignNextTeam(one, t.id), false, "an empty table needs two eligible");
  assert.equal(canAssignNextTeam(empty, t.id), true);
});

test("locked / closing / draining tables never show the button", () => {
  let s = live();
  const t = liveTable(s);
  s = pipeline(clearTable(s, t.id, "end"));
  assert.equal(canAssignNextTeam(pipeline(setTableLocked(s, t.id, true)), t.id), false);
  assert.equal(canAssignNextTeam({ ...s, reshufflePending: true }, t.id), false);
  assert.equal(canAssignNextTeam({ ...s, finishedAt: new Date().toISOString() }, t.id), false);
});

test("Shuffle round: only ROUND-ELIGIBLE players are assigned, and they're marked seated for the round", () => {
  let s = live(8, 2);
  s = pipeline(returnActiveMatchesToQueue(s));
  s = pipeline(beginShuffle(s));
  s = pipeline(finalizeReshuffle(s, null)); // round opens: matchups announced on both tables
  // clear a table: its two go back owed a turn
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  s = pipeline(clearTable(s, t.id, "end"));
  // pretend the queue FRONT already played this round (off the owed list) — must be skipped
  const played = s.queue.find((id) => !s.roundRemaining!.includes(id));
  const eligibleBefore = s.queue.filter((id) => s.roundRemaining!.includes(id));
  assert.ok(eligibleBefore.length >= 2);
  s = pipeline(assignNextTeam(s, t.id));
  const m = s.matches.find((x) => x.tableId === t.id && x.status === "in_progress")!;
  for (const id of [m.aId, m.bId]) {
    assert.ok(eligibleBefore.includes(id), "only players still owed a turn");
    assert.equal(s.roundRemaining!.includes(id), false, "now seated for the round");
  }
  if (played) assert.notEqual(m.aId, played);
});

test("Shuffle round: an empty table with fewer than two eligible players shows no button", () => {
  let s = live(8, 2);
  s = pipeline(returnActiveMatchesToQueue(s));
  s = pipeline(beginShuffle(s));
  s = pipeline(finalizeReshuffle(s, null));
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  s = pipeline(clearTable(s, t.id, "end"));
  // leave exactly one round-eligible entry
  const keep = s.roundRemaining![0];
  const narrowed: ChipState = { ...s, roundRemaining: [keep] };
  assert.ok(narrowed.queue.length >= 2, "plenty queued, but not eligible");
  assert.equal(canAssignNextTeam(narrowed, t.id), false);
});
