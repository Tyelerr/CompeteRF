// src/utils/__tests__/auto-assign.test.ts
// Run: npx tsx --test src/utils/__tests__/auto-assign.test.ts
// Auto Assign planning (the exact function the server bundle runs) + Play Next.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { AutoAssignMode, MatchLiveState } from "../../models/types/tournament-settings.types";
import { buildBracketGraph } from "../bracket.double";
import { raceConfigFromLiveSettings } from "../bracket.utils";
import { buildLiveMatches } from "../match.utils";
import { freeTables, planAutoAssign } from "../queue.utils";
import { projectSchedule } from "../schedule.projection";
import { autoAssignActive, computeTableOccupancy, planAutoAssignFromState } from "../auto-assign";

const DRAWN = "2026-09-01T10:00:00.000Z";
const at = (m: number) => new Date(Date.parse(DRAWN) + m * 60000).toISOString();
const done = (w: 1 | 2, m: number): MatchLiveState => ({ status: "completed", winner: w, completedAt: at(m) });
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
const bracket: any = {
  generatedAt: DRAWN,
  graph: buildBracketGraph(8, true),
  seeds: NAMES.map((n, i) => ({ registrationId: 100 + i, name: n, fargo: 500 })),
};
const tables = (n: number): any[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, tournament_id: 1, table_number: i + 1, status: "available", is_streaming: false }));
const W1_DONE = { W1M1: done(1, 20), W1M2: done(1, 50), W1M3: done(1, 30), W1M4: done(1, 40) };
const NOW = Date.parse("2026-09-01T14:00:00.000Z");
const plan = (ms: Record<string, MatchLiveState>, extra: Record<string, unknown> = {}, nTables = 4) =>
  planAutoAssignFromState({ liveSettings: { bracket, matchState: ms, ...extra } as any, tables: tables(nTables), gameType: "9-ball", now: NOW });
// The same pipeline the Manage screen shows (projection readyQueue + occupancy + planner).
const appPlan = (ms: Record<string, MatchLiveState>, mode: AutoAssignMode, queueOrder: string[] = [], queuePins: unknown = [], nTables = 4) => {
  const matches = buildLiveMatches(bracket, ms, tables(nTables), "9-ball", raceConfigFromLiveSettings({}));
  const s = projectSchedule({ bracket, matches, matchState: ms, mode, queueOrder, queuePins, now: NOW });
  return planAutoAssign(s.readyQueue, freeTables(tables(nTables), computeTableOccupancy(matches)));
};

test("active only when enabled + running + unpaused + elimination", () => {
  const base = { live_settings: { autoAssignEnabled: true }, live_state: "in_progress", is_paused: false, tournament_format: "double-elimination" };
  assert.equal(autoAssignActive(base), true);
  assert.equal(autoAssignActive({ ...base, live_settings: { autoAssignEnabled: false } }), false);
  assert.equal(autoAssignActive({ ...base, live_state: "registration_closed" }), false);
  assert.equal(autoAssignActive({ ...base, is_paused: true }), false);
  assert.equal(autoAssignActive({ ...base, tournament_format: "chip-tournament" }), false);
  assert.equal(autoAssignActive(null), false);
});

test("Ready + free table → assignment planned; no Ready or no free table → nothing", () => {
  assert.equal(plan(W1_DONE, {}, 2).length, 2);
  const busy: Record<string, MatchLiveState> = {};
  ["W1M1", "W1M2", "W1M3", "W1M4"].forEach((id, i) => (busy[id] = { status: "in_progress", tableId: i + 1 }));
  assert.deepEqual(plan(busy), []); // all tables in use, nothing Ready
  assert.deepEqual(plan(W1_DONE, {}, 0), []);
  assert.deepEqual(planAutoAssignFromState({ liveSettings: {}, tables: tables(2), gameType: "", now: NOW }), []); // no bracket
});

test("freeing a table plans the next appropriate assignment", () => {
  const ms: Record<string, MatchLiveState> = { ...W1_DONE, W2M1: { status: "in_progress", tableId: 1 }, W2M2: { status: "in_progress", tableId: 2 } };
  assert.deepEqual(plan(ms, {}, 2), []);
  const after = plan({ ...ms, W2M1: { ...done(1, 90), tableId: 1 } }, {}, 2);
  assert.equal(after.length, 1);
  assert.equal(after[0].tableId, 1);
});

test("server planning == the Manage screen's pipeline for every mode, Manual order and pins", () => {
  for (const mode of ["balanced", "winnersFirst", "losersFirst", "longestWait"] as AutoAssignMode[]) {
    assert.deepEqual(plan(W1_DONE, { autoAssignMode: mode }, 2), appPlan(W1_DONE, mode, [], [], 2), mode);
    const pins = [{ matchId: "L1M2", place: "top" }];
    assert.deepEqual(plan(W1_DONE, { autoAssignMode: mode, queuePins: pins }, 1), appPlan(W1_DONE, mode, [], pins, 1), `${mode} pins`);
    assert.equal(plan(W1_DONE, { autoAssignMode: mode, queuePins: pins }, 1)[0].matchId, "L1M2");
  }
  const order = ["L1M2", "W2M2", "L1M1", "W2M1"];
  assert.deepEqual(plan(W1_DONE, { autoAssignMode: "manual", queueOrder: order }, 2).map((p) => p.matchId), ["L1M2", "W2M2"]);
});

test("Play Next: preferred free table first; a busy preferred table never holds anything idle", () => {
  const pref = plan({ ...W1_DONE, L1M2: { status: "scheduled", preferredTableId: 3 } }, {}, 3);
  assert.deepEqual(pref.find((p) => p.matchId === "L1M2"), { matchId: "L1M2", tableId: 3 });
  const busy = plan({ ...W1_DONE, W2M1: { status: "in_progress", tableId: 1 }, L1M2: { status: "scheduled", preferredTableId: 1 } }, {}, 2);
  assert.equal(busy.length, 1);
  assert.equal(busy[0].tableId, 2);
});

test("Play Next contested: earlier in queue order wins; no preferences → original pairing", () => {
  const ms: Record<string, MatchLiveState> = { ...W1_DONE, L1M1: { status: "scheduled", preferredTableId: 2 }, L1M2: { status: "scheduled", preferredTableId: 2 } };
  const matches = buildLiveMatches(bracket, ms, tables(2), "9-ball", raceConfigFromLiveSettings({}));
  const q = projectSchedule({ bracket, matches, matchState: ms, mode: "balanced", queueOrder: [], now: NOW }).readyQueue;
  const firstPref = q.find((e) => e.match.id === "L1M1" || e.match.id === "L1M2")!.match.id;
  assert.deepEqual(plan(ms, {}, 2).find((p) => p.tableId === 2), { matchId: firstPref, tableId: 2 });
  const plainQ = projectSchedule({ bracket, matches: buildLiveMatches(bracket, W1_DONE, tables(3), "9-ball", raceConfigFromLiveSettings({})), matchState: W1_DONE, mode: "balanced", queueOrder: [], now: NOW }).readyQueue;
  assert.deepEqual(plan(W1_DONE, {}, 3), plainQ.slice(0, 3).map((e, i) => ({ matchId: e.match.id, tableId: i + 1 })));
});
