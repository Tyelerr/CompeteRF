// src/utils/__tests__/clear-table.test.ts
// Run: npx tsx --test src/utils/__tests__/clear-table.test.ts
// Clear Table: what it writes (ops), where the match lands in each Match Order, and the short
// Auto Assign hold that stops the clear from undoing itself.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { AutoAssignMode, MatchLiveState } from "../../models/types/tournament-settings.types";
import { planAutoAssignFromState } from "../auto-assign";
import { buildBracketGraph } from "../bracket.double";
import { raceConfigFromLiveSettings } from "../bracket.utils";
import { CLEAR_TABLE_HOLD_MS, buildClearTableOps, clearHeldIds, clearTableConfirm, isClearHeld } from "../clear-table";
import { buildLiveMatches } from "../match.utils";
import { projectSchedule } from "../schedule.projection";

const DRAWN = "2026-09-01T10:00:00.000Z";
const at = (min: number) => new Date(Date.parse(DRAWN) + min * 60000).toISOString();
const NOW = Date.parse(at(600));
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
const bracket: any = { generatedAt: DRAWN, graph: buildBracketGraph(8, true), seeds: NAMES.map((n, i) => ({ registrationId: 100 + i, name: n, fargo: 500 })) };
const tables = (n: number): any[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, tournament_id: 1, table_number: i + 1, status: "available" }));
const done = (w: 1 | 2, min: number): MatchLiveState => ({ status: "completed", winner: w, completedAt: at(min) });
const W1_DONE = { W1M1: done(1, 20), W1M2: done(1, 50), W1M3: done(1, 30), W1M4: done(1, 40) };
const plan = (ms: Record<string, MatchLiveState>, extra: Record<string, unknown> = {}, nTables = 2, now = NOW) =>
  planAutoAssignFromState({ liveSettings: { bracket, matchState: ms, ...extra } as any, tables: tables(nTables), gameType: "9-ball", now });
const readyIds = (ms: Record<string, MatchLiveState>, mode: AutoAssignMode, extra: Record<string, unknown> = {}) => {
  const matches = buildLiveMatches(bracket, ms, tables(2), "9-ball", raceConfigFromLiveSettings({}));
  return projectSchedule({ bracket, matches, matchState: ms, mode, queueOrder: (extra.queueOrder as string[]) ?? [], queuePins: extra.queuePins ?? [], now: NOW })
    .readyQueue.map((e) => e.match.id);
};

// ── What Clear Table writes ────────────────────────────────────────────────────────────────
test("automatic modes: a single unassign op — no start/score/mode/Auto Assign change", () => {
  for (const mode of ["balanced", "winnersFirst", "losersFirst", "longestWait"] as AutoAssignMode[]) {
    const ops = buildClearTableOps({ matchId: "W2M1", mode, queueOrder: ["W2M2", "W2M1"] });
    assert.deepEqual(ops, [{ op: "unassign", matchId: "W2M1" }]);
    const json = JSON.stringify(ops);
    for (const forbidden of ["start", "status", "winner", "Score", "autoAssignEnabled", "autoAssignMode", "queuePins"])
      assert.equal(json.includes(forbidden), false, `${mode}: ${forbidden}`);
  }
});

test("Manual: unassign + the match moved to the front of the manual order (same atomic call)", () => {
  const ops = buildClearTableOps({ matchId: "W2M1", mode: "manual", queueOrder: ["W2M2", "L1M1", "W2M1"] });
  assert.deepEqual(ops, [
    { op: "unassign", matchId: "W2M1" },
    { op: "set_queue", queueOrder: ["W2M1", "W2M2", "L1M1"] },
  ]);
  // not previously in the order, or an empty order → still goes to the front, nothing duplicated
  assert.deepEqual(buildClearTableOps({ matchId: "W2M1", mode: "manual", queueOrder: ["W2M2"] })[1], { op: "set_queue", queueOrder: ["W2M1", "W2M2"] });
  assert.deepEqual(buildClearTableOps({ matchId: "W2M1", mode: "manual", queueOrder: null })[1], { op: "set_queue", queueOrder: ["W2M1"] });
  assert.equal(JSON.stringify(ops).includes("autoAssignMode"), false, "stays in Manual; never switches mode");
});

test("confirmation copy names the table and says Auto Assign stays on", () => {
  assert.equal(clearTableConfirm("Diamond 1", false), "This will remove Diamond 1 from this match and return the match to the Ready queue.");
  assert.equal(
    clearTableConfirm("Diamond 1", true),
    "This will remove Diamond 1 from this match and return the match to the Ready queue." +
      " Auto Assign stays on and won't automatically reassign this match for 2 minutes.",
  );
  assert.equal(CLEAR_TABLE_HOLD_MS, 120_000, "2-minute hold");
});

// ── Where the cleared match lands ───────────────────────────────────────────────────────────
test("cleared match is Ready again and ordered by the selected Match Order", () => {
  // With round 1 complete the Ready tier is W2M1, W2M2, L1M1, L1M2; W2M1 was just cleared.
  const cleared: Record<string, MatchLiveState> = { ...W1_DONE, W2M1: { status: "scheduled", clearedAt: at(599) } };
  assert.ok(readyIds(cleared, "longestWait").includes("W2M1"), "back in the Ready queue");
  // each automatic mode places it by ITS rule (unchanged by the clear)
  assert.deepEqual(readyIds(cleared, "longestWait"), readyIds(W1_DONE, "longestWait"));
  assert.deepEqual(readyIds(cleared, "balanced"), readyIds(W1_DONE, "balanced"));
  assert.deepEqual(readyIds(cleared, "winnersFirst")[0], "W2M2");
  // Manual: the front of the manual order (what buildClearTableOps writes) = next available
  assert.equal(readyIds(cleared, "manual", { queueOrder: ["W2M1", "W2M2"] })[0], "W2M1");
  // a TD pin still wins in an automatic mode
  assert.equal(readyIds(cleared, "longestWait", { queuePins: [{ matchId: "W2M1", place: "top" }] })[0], "W2M1");
});

test("clearing changes nothing else about the match (scores, bracket, other matches)", () => {
  const before: Record<string, MatchLiveState> = { ...W1_DONE, W2M1: { status: "scheduled", tableId: 1, assignedAt: at(500), p1Score: 0, p2Score: 0 } };
  // what the server write produces (migration 20260926120000): table fields only
  const after: Record<string, MatchLiveState> = { ...W1_DONE, W2M1: { ...before.W2M1, tableId: null, assignedAt: null, startedAt: null, status: "scheduled", clearedAt: at(600) } };
  assert.deepEqual(after.W1M1, before.W1M1);
  assert.deepEqual(after.W1M2, before.W1M2);
  assert.equal(after.W2M1.p1Score, 0);
  assert.equal(after.W2M1.p2Score, 0);
  assert.equal(after.W2M1.winner, undefined);
  assert.equal(after.W2M1.status, "scheduled");
  const sides = (ms: Record<string, MatchLiveState>) =>
    buildLiveMatches(bracket, ms, tables(2), "9-ball", raceConfigFromLiveSettings({})).map((x) => `${x.id}:${x.p1Name ?? "-"}/${x.p2Name ?? "-"}:${x.status}`);
  const m = buildLiveMatches(bracket, after, tables(2), "9-ball", raceConfigFromLiveSettings({})).find((x) => x.id === "W2M1")!;
  assert.equal(m.tableId, null);
  assert.equal(m.status, "scheduled");
  assert.ok(m.p1Name && m.p2Name, "both players still resolved");
  assert.deepEqual(sides(after), sides(before), "bracket advancement identical before/after the clear");
});

// ── Auto Assign interaction ─────────────────────────────────────────────────────────────────
// Every other Ready match is already playing, so table 1 (the one just freed) is the only free
// table and W2M1 the only Ready match — exactly the self-reversal scenario.
const ONLY_CLEARED = (clearedAt: string): Record<string, MatchLiveState> => ({
  ...W1_DONE,
  W2M1: { status: "scheduled", clearedAt },
  W2M2: { status: "in_progress", tableId: 2, startedAt: at(500) },
  L1M1: { status: "in_progress", tableId: 3, startedAt: at(500) },
  L1M2: { status: "in_progress", tableId: 4, startedAt: at(500) },
});

test("Auto Assign does NOT immediately put the cleared match back on the freed table", () => {
  const ms = ONLY_CLEARED(new Date(NOW - 1000).toISOString());
  assert.deepEqual(plan(ms, { autoAssignEnabled: true, autoAssignMode: "longestWait" }, 4), [], "table 1 stays free for now");
  assert.deepEqual(plan(ms, { autoAssignEnabled: true, autoAssignMode: "manual", queueOrder: ["W2M1"] }, 4), [], "Manual: also held");
  // without the stamp it WOULD be handed straight back — this is what the hold prevents
  const noStamp = { ...ms, W2M1: { status: "scheduled" } as MatchLiveState };
  assert.deepEqual(plan(noStamp, { autoAssignMode: "longestWait" }, 4).map((x) => x.matchId), ["W2M1"]);
});

test("the hold is only that match — other Ready matches still take the freed table", () => {
  const ms = { ...ONLY_CLEARED(new Date(NOW - 1000).toISOString()), L1M2: { status: "scheduled" } as MatchLiveState };
  assert.deepEqual(plan(ms, { autoAssignMode: "longestWait" }, 4).map((x) => x.matchId), ["L1M2"], "L1M2 takes the free table; the cleared match waits");
});

test("after the hold the match is auto-assigned normally (next trigger / sweep)", () => {
  const ms = ONLY_CLEARED(new Date(NOW - CLEAR_TABLE_HOLD_MS - 1).toISOString());
  assert.deepEqual(plan(ms, { autoAssignMode: "longestWait" }, 4).map((x) => x.matchId), ["W2M1"]);
  // …and in Manual it is the next available match
  assert.deepEqual(plan(ms, { autoAssignMode: "manual", queueOrder: ["W2M1"] }, 4).map((x) => x.matchId), ["W2M1"]);
});

test("hold window: boundaries, missing/invalid/future stamps", () => {
  assert.equal(isClearHeld({ status: "scheduled", clearedAt: new Date(NOW).toISOString() }, NOW), true);
  assert.equal(isClearHeld({ status: "scheduled", clearedAt: new Date(NOW - CLEAR_TABLE_HOLD_MS + 1).toISOString() }, NOW), true);
  assert.equal(isClearHeld({ status: "scheduled", clearedAt: new Date(NOW - CLEAR_TABLE_HOLD_MS).toISOString() }, NOW), false);
  assert.equal(isClearHeld({ status: "scheduled" }, NOW), false);
  assert.equal(isClearHeld({ status: "scheduled", clearedAt: null }, NOW), false);
  assert.equal(isClearHeld({ status: "scheduled", clearedAt: "nonsense" }, NOW), false);
  assert.equal(isClearHeld({ status: "scheduled", clearedAt: new Date(NOW + 60000).toISOString() }, NOW), false, "a future stamp is ignored, never a permanent hold");
  assert.deepEqual([...clearHeldIds({ A: { status: "scheduled", clearedAt: new Date(NOW - 5).toISOString() }, B: { status: "scheduled" } }, NOW)], ["A"]);
});

test("Auto Assign stays ON: clearing never writes the enabled flag, and planning still works", () => {
  const ls = { bracket, matchState: { ...W1_DONE, W2M1: { status: "scheduled", clearedAt: new Date(NOW - 1000).toISOString() } }, autoAssignEnabled: true, autoAssignMode: "balanced" } as any;
  assert.equal(ls.autoAssignEnabled, true);
  const p = planAutoAssignFromState({ liveSettings: ls, tables: tables(4), gameType: "9-ball", now: NOW });
  assert.ok(p.length > 0, "other matches still get assigned");
  assert.equal(p.some((x) => x.matchId === "W2M1"), false, "…but not the held one");
  const ops = JSON.stringify(buildClearTableOps({ matchId: "W2M1", mode: "balanced", queueOrder: [] }));
  assert.equal(ops.includes("autoAssignEnabled"), false);
});
