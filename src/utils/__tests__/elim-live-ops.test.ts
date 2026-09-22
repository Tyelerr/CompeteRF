// src/utils/__tests__/elim-live-ops.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-live-ops.test.ts
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyOpsLocally,
  buildAssignOps,
  classifyTables,
  liveOpErrorText,
  planDisplacements,
  summarizeOpResults,
} from "../elim-live-ops";

const NOW = "2026-09-01T12:00:00.000Z";

test("optimistic mirror matches the server op semantics and never drops other keys", () => {
  const ls = {
    raceMode: "fixed" as const,
    queueOrder: ["A"],
    matchState: {
      W1M1: { status: "in_progress" as const, tableId: 1, p1Score: 2 },
      W1M2: { status: "scheduled" as const, tableId: 2 },
    },
  };
  const out = applyOpsLocally(
    ls,
    [
      { op: "assign", matchId: "W1M3", tableId: 3, start: true },
      { op: "start", matchId: "W1M2" },
      { op: "unassign", matchId: "W1M1" },
      { op: "patch_match", matchId: "W1M4", set: { timerSeconds: 60 } },
      { op: "set_queue", queueOrder: ["W1M4"], autoAssignMode: "manual" },
    ],
    NOW,
  );
  assert.equal(out.raceMode, "fixed");
  assert.deepEqual(out.queueOrder, ["W1M4"]);
  assert.equal(out.autoAssignMode, "manual");
  assert.deepEqual(out.matchState?.W1M3, { status: "in_progress", tableId: 3, startedAt: NOW });
  assert.deepEqual(out.matchState?.W1M2, { status: "in_progress", tableId: 2, startedAt: NOW });
  assert.deepEqual(out.matchState?.W1M1, { status: "scheduled", tableId: null, startedAt: null, p1Score: 2 });
  assert.deepEqual(out.matchState?.W1M4, { status: "scheduled", timerSeconds: 60 });
  assert.equal(ls.matchState.W1M1.tableId, 1); // input not mutated
});

test("partial-success summary text", () => {
  assert.equal(summarizeOpResults([{ i: 0, ok: true }, { i: 1, ok: true }], "assigned"), "2 assigned");
  assert.equal(
    summarizeOpResults(
      [{ i: 0, ok: true }, { i: 1, ok: true }, { i: 2, ok: true }, { i: 3, ok: false, error: "table_occupied" }],
      "assigned",
    ),
    "3 assigned · 1 skipped — table occupied",
  );
  assert.equal(liveOpErrorText("match_in_progress"), "already in progress");
  assert.equal(liveOpErrorText("something_new"), "could not be saved");
});


const TABLES = [
  { id: 1, status: "available" },
  { id: 2, status: "available" },
  { id: 3, status: "in_use" },
  { id: 4, status: "unavailable" },
];
const ON_TABLE = [
  { id: "W1M1", tableId: 2, status: "scheduled", p1Name: "Ann", p2Name: "Bo" }, // parked
  { id: "W1M2", tableId: 3, status: "in_progress", p1Name: "Cy", p2Name: "Di" }, // playing
  { id: "W1M3", tableId: 1, status: "completed", p1Name: "Ed", p2Name: "Fay" }, // done → frees table
];

test("table classification: free / parked (displaceable) / playing / unavailable", () => {
  const st = classifyTables(TABLES, ON_TABLE);
  assert.deepEqual(st[1], { kind: "free" });
  assert.deepEqual(st[2], { kind: "assigned", matchId: "W1M1", label: "Ann vs Bo" });
  assert.deepEqual(st[3], { kind: "playing", matchId: "W1M2", label: "Cy vs Di" });
  assert.deepEqual(st[4], { kind: "unavailable" });
});

test("displacement: only parked occupants of chosen tables; never the in-progress one", () => {
  const st = classifyTables(TABLES, ON_TABLE);
  assert.deepEqual(planDisplacements([{ matchId: "L1M1", tableId: 1 }], st), []);
  assert.deepEqual(planDisplacements([{ matchId: "L1M1", tableId: 2 }], st), [{ matchId: "W1M1", tableId: 2, label: "Ann vs Bo" }]);
  assert.deepEqual(planDisplacements([{ matchId: "L1M1", tableId: 3 }], st), []); // playing: not a displacement
  // the bumped match isn't counted when it is itself being re-placed in the same plan
  assert.deepEqual(planDisplacements([{ matchId: "L1M1", tableId: 2 }, { matchId: "W1M1", tableId: 1 }], st), []);
});

test("assign batch: displaced unassigns first, atomic only when something is displaced", () => {
  const plain = buildAssignOps([{ matchId: "L1M1", tableId: 1 }], false);
  assert.deepEqual(plain, { ops: [{ op: "assign", matchId: "L1M1", tableId: 1, start: false }], atomic: false });
  const bump = buildAssignOps([{ matchId: "L1M1", tableId: 2 }], true, ["W1M1"]);
  assert.deepEqual(bump, {
    ops: [
      { op: "unassign", matchId: "W1M1" },
      { op: "assign", matchId: "L1M1", tableId: 2, start: true },
    ],
    atomic: true,
  });
});
