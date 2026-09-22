// src/utils/__tests__/elim-live-ops.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-live-ops.test.ts
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOpsLocally, liveOpErrorText, summarizeOpResults } from "../elim-live-ops";

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
