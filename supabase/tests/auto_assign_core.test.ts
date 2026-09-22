// supabase/tests/auto_assign_core.test.ts
// Run: npx tsx --test supabase/tests/auto_assign_core.test.ts
//
// 1. The server bundle is the app scheduler: scheduler.bundle.js is exactly what
//    scripts/build-scheduler-bundle.js generates from src/utils/scheduler-entry.ts (fails if
//    anyone edits the scheduler without rebuilding), and the bundled planner returns the same
//    plan as the app module on the same state.
// 2. auto-assign-run's orchestration (auto_assign_core.ts) with injected load/apply/notify:
//    inactive, nothing to do, apply + notify only successes, stale → re-read + re-plan, bounded.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { planAutoAssignFromState as appPlan } from "../../src/utils/auto-assign";
import * as bundle from "../functions/_shared/scheduler.bundle.js";
import { runAutoAssign, AutoAssignDeps, AutoAssignState, ApplyResponse } from "../functions/_shared/auto_assign_core";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildBundle, outFile } = require("../../scripts/build-scheduler-bundle.js");

const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
const bracket = {
  generatedAt: "2026-09-01T10:00:00.000Z",
  drawNumber: 1,
  graph: buildBracketGraph(8, true),
  seeds: NAMES.map((n, i) => ({ registrationId: 100 + i, name: n, fargo: 500 })),
};
const tables = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 71 + i, tournament_id: 1, table_number: i + 1, status: "available" }));
const NOW = Date.parse("2026-09-01T14:00:00.000Z");
const done = (w: 1 | 2, min: number) => ({ status: "completed", winner: w, completedAt: new Date(Date.parse(bracket.generatedAt) + min * 60000).toISOString() });

test("scheduler.bundle.js is up to date with the app scheduler source", () => {
  const norm = (s: string) => s.replace(/\r\n/g, "\n");
  assert.equal(norm(readFileSync(outFile, "utf8")), norm(buildBundle()), "run: npm run build:scheduler");
});

test("the bundle carries the Clear Table hold: a just-cleared match is not re-assigned", () => {
  const ms: any = {
    W1M1: done(1, 20), W1M2: done(2, 50), W1M3: done(1, 30), W1M4: done(1, 40),
    W2M2: { status: "in_progress", tableId: 72 }, L1M1: { status: "in_progress", tableId: 73 }, L1M2: { status: "in_progress", tableId: 74 },
    W2M1: { status: "scheduled", clearedAt: new Date(NOW - 5_000).toISOString() },
  };
  const input = (state: any) => ({ liveSettings: { bracket, matchState: state, autoAssignMode: "longestWait" }, tables: tables(4), gameType: "9-ball", now: NOW });
  assert.deepEqual(bundle.planAutoAssignFromState(input(ms) as any), [], "held: the freed table stays free for now");
  const expired = { ...ms, W2M1: { status: "scheduled", clearedAt: new Date(NOW - 10 * 60_000).toISOString() } };
  assert.deepEqual(bundle.planAutoAssignFromState(input(expired) as any).map((p: any) => p.matchId), ["W2M1"], "after the hold: normal");
});

test("bundled planner === app planner on the same state (modes, pins, Play Next, busy tables)", () => {
  const states: any[] = [
    {},
    { W1M1: done(1, 20), W1M2: done(2, 50), W1M3: done(1, 30), W1M4: done(1, 40) },
    { W1M1: done(1, 20), W1M2: done(2, 50), W1M3: { status: "in_progress", tableId: 71 }, W2M1: { preferredTableId: 73 } },
    // a just-cleared match (Clear Table hold) and one whose hold has expired
    { W1M1: done(1, 20), W1M2: done(2, 50), W1M3: done(1, 30), W1M4: done(1, 40),
      W2M1: { status: "scheduled", clearedAt: new Date(NOW - 5_000).toISOString() },
      L1M1: { status: "scheduled", clearedAt: new Date(NOW - 10 * 60_000).toISOString() } },
  ];
  const extras: any[] = [
    { autoAssignMode: "balanced" },
    { autoAssignMode: "fifo" },
    { autoAssignMode: "manual", queueOrder: ["W1M4", "W1M3", "W1M2", "W1M1", "L1M2", "L1M1", "W2M2", "W2M1"] },
    { autoAssignMode: "balanced", queuePins: [{ matchId: "W1M4", place: "top" }, { matchId: "L1M1", place: "top" }] },
  ];
  let compared = 0;
  for (const ms of states) for (const ex of extras) for (const n of [1, 2, 4]) {
    const input = { liveSettings: { bracket, matchState: ms, ...ex }, tables: tables(n), gameType: "9-ball", now: NOW };
    assert.deepEqual(bundle.planAutoAssignFromState(input as any), appPlan(input as any), JSON.stringify({ ms, ex, n }));
    compared++;
  }
  assert.equal(compared, 48);
});

// ── Orchestration ────────────────────────────────────────────────────────────────────────────
const W1_DONE = { W1M1: done(1, 20), W1M2: done(1, 50), W1M3: done(1, 30), W1M4: done(1, 40) };
const tourn = (over: Record<string, unknown> = {}, ms: any = W1_DONE): AutoAssignState["tournament"] => ({
  live_settings: { bracket, matchState: ms, autoAssignEnabled: true, autoAssignMode: "balanced" },
  live_state: "in_progress", is_paused: false, tournament_format: "double_elimination", game_type: "9-ball",
  updated_at: "v1", ...over,
});

function harness(states: AutoAssignState[], responses: ((ops: any[]) => ApplyResponse)[]) {
  const calls = { load: 0, apply: [] as { ops: any[]; expected: string }[], notify: [] as string[] };
  const deps: AutoAssignDeps = {
    load: async () => states[Math.min(calls.load++, states.length - 1)],
    apply: async (_t, ops, expected) => {
      calls.apply.push({ ops, expected });
      return responses[calls.apply.length - 1](ops);
    },
    notify: async (_t, m) => { calls.notify.push(m); if (m === "boom") throw new Error("x"); },
    now: () => NOW,
  };
  return { deps, calls };
}
const allOk = (ops: any[]): ApplyResponse => ({ status: "applied", results: ops.map((_, i) => ({ i, ok: true })) });

test("inactive tournament → no plan, no write", async () => {
  for (const t of [tourn({ is_paused: true }), tourn({ live_state: "completed" }), tourn({ tournament_format: "chip-tournament" }),
                   { ...tourn(), live_settings: { bracket, autoAssignEnabled: false } }, null]) {
    const { deps, calls } = harness([{ tournament: t as any, tables: tables(2) }], []);
    assert.equal((await runAutoAssign(1, deps)).status, "inactive");
    assert.equal(calls.apply.length, 0);
  }
});

test("nothing Ready / no free table → nothing_to_do, no write", async () => {
  const { deps, calls } = harness([{ tournament: tourn({}, {}), tables: [] }], []);
  assert.equal((await runAutoAssign(1, deps)).status, "nothing_to_do");
  assert.equal(calls.apply.length, 0);
});

test("applies assign+ifUnassigned ops (never start) with the read version; notifies only successes", async () => {
  const { deps, calls } = harness([{ tournament: tourn(), tables: tables(2) }], [
    (ops) => ({ status: "applied", results: ops.map((_, i) => ({ i, ok: i === 0, error: i === 0 ? undefined : "table_occupied" })) }),
  ]);
  const out = await runAutoAssign(1, deps);
  assert.equal(out.status, "applied");
  assert.equal(calls.apply.length, 1);
  assert.equal(calls.apply[0].expected, "v1");
  for (const op of calls.apply[0].ops) {
    assert.deepEqual(Object.keys(op).sort(), ["ifUnassigned", "matchId", "op", "tableId"]);
    assert.equal(op.op, "assign");
    assert.equal(op.ifUnassigned, true);
  }
  assert.deepEqual(out.assigned, [calls.apply[0].ops[0].matchId]);
  assert.deepEqual(calls.notify, out.assigned);
  assert.equal(out.skipped[0].error, "table_occupied");
});

test("stale → re-reads and re-plans against the new state", async () => {
  const fresh = tourn({ updated_at: "v2" }, { ...W1_DONE, W2M1: { status: "scheduled", tableId: 71 } });
  const { deps, calls } = harness(
    [{ tournament: tourn(), tables: tables(2) }, { tournament: fresh, tables: tables(2) }],
    [() => ({ status: "stale" }), allOk],
  );
  const out = await runAutoAssign(1, deps);
  assert.equal(out.status, "applied");
  assert.equal(out.attempts, 2);
  assert.equal(calls.load, 2);
  assert.equal(calls.apply[1].expected, "v2");
  assert.ok(calls.apply[1].ops.every((o: any) => o.matchId !== "W2M1" && o.tableId !== 71), "re-plan sees the new assignment");
});

test("stale forever → gives up after 3 attempts (the next trigger / sweep retries)", async () => {
  const { deps, calls } = harness([{ tournament: tourn(), tables: tables(2) }], Array(5).fill(() => ({ status: "stale" })));
  const out = await runAutoAssign(1, deps);
  assert.equal(out.status, "stale_gave_up");
  assert.equal(calls.apply.length, 3);
  assert.equal(calls.notify.length, 0);
});

test("inactive at apply time (disabled/paused between read and write) → stops, no notify", async () => {
  const { deps, calls } = harness([{ tournament: tourn(), tables: tables(2) }], [() => ({ status: "inactive" })]);
  assert.equal((await runAutoAssign(1, deps)).status, "inactive");
  assert.equal(calls.notify.length, 0);
});

test("a notification failure does not undo or abort the run", async () => {
  const { deps } = harness([{ tournament: tourn(), tables: tables(2) }], [allOk]);
  const d2 = { ...deps, notify: async () => { throw new Error("push down"); } };
  const out = await runAutoAssign(1, d2);
  assert.equal(out.status, "applied");
  assert.equal(out.assigned.length, 2);
});
