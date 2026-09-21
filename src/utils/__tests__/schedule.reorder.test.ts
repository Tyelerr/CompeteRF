// src/utils/__tests__/schedule.reorder.test.ts
// Run: npx tsx --test src/utils/__tests__/schedule.reorder.test.ts
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AutoAssignMode,
  GeneratedBracket,
  MatchLiveState,
} from "../../models/types/tournament-settings.types";
import { buildBracketGraph } from "../bracket.double";
import { RaceConfig } from "../bracket.utils";
import { buildLiveMatches } from "../match.utils";
import { buildQueueEntries, computeReadyAtMap, orderQueue } from "../queue.utils";
import { ProjectedSchedule, projectSchedule } from "../schedule.projection";
import { reorderScheduled, scheduleMoveAvailability } from "../schedule.reorder";

const cfg: RaceConfig = { mode: "fixed", fixedWinners: 7, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null };
const DRAWN = "2026-09-01T10:00:00.000Z";
const NOW = Date.parse("2026-09-01T14:00:00.000Z");
const at = (min: number) => new Date(Date.parse(DRAWN) + min * 60000).toISOString();
const done = (winner: 1 | 2, min: number): MatchLiveState => ({ status: "completed", winner, completedAt: at(min) });
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal", "Ivy", "Jon", "Kim", "Lou", "Max", "Ned", "Ola", "Pat"];
const bracket: GeneratedBracket = {
  generatedAt: DRAWN,
  drawType: "random",
  format: "double_elimination",
  drawNumber: 1,
  players: 16,
  bracketSize: 16,
  byes: 0,
  round1: [],
  doubleElim: true,
  graph: buildBracketGraph(16, true),
  seeds: NAMES.map((n, i) => ({ registrationId: 100 + i, name: n, fargo: 500 })),
};
// W1 done; W2M1 done; W2M2 in progress; W2M3/W2M4 ready; L1M1 done; L1M2 assigned; L1M3/L1M4 ready.
const ms: Record<string, MatchLiveState> = {
  W1M1: done(1, 20), W1M2: done(2, 25), W1M3: done(1, 30), W1M4: done(1, 35),
  W1M5: done(2, 40), W1M6: done(1, 45), W1M7: done(1, 50), W1M8: done(2, 55),
  W2M1: done(1, 80),
  W2M2: { status: "in_progress", tableId: 1, startedAt: at(85) },
  L1M1: done(1, 90),
  L1M2: { status: "scheduled", tableId: 2 },
};
const matches = buildLiveMatches(bracket, ms, [], "9-ball", cfg);
const project = (mode: AutoAssignMode, queueOrder: string[] = []): ProjectedSchedule =>
  projectSchedule({ bracket, matches, matchState: ms, mode, queueOrder, now: NOW });
const ids = (s: ProjectedSchedule) => s.scheduled.map((p) => p.matchId);
// Apply a move exactly the way the Queue does: persist the new order + Manual.
const apply = (s: ProjectedSchedule, id: string, move: "up" | "down" | "top" | "bottom") => {
  const next = reorderScheduled(s.scheduled, id, move);
  assert.ok(next, `${move} ${id} should be allowed`);
  return { order: next as string[], s: project("manual", next as string[]) };
};
const readyCount = (s: ProjectedSchedule) => s.readyQueue.length;

test("switching to Manual with the displayed order reproduces it exactly (every mode)", () => {
  for (const mode of ["balanced", "winnersFirst", "losersFirst", "longestWait", "manual"] as AutoAssignMode[]) {
    const s = project(mode);
    assert.deepEqual(ids(project("manual", ids(s))), ids(s), mode);
  }
});

test("Move Up / Move Down swap adjacent rows within a tier", () => {
  const s = project("balanced");
  // ready tier
  const r = ids(s);
  const up = apply(s, r[1], "up");
  assert.deepEqual(ids(up.s), up.order);
  assert.deepEqual(ids(up.s).slice(0, 2), [r[1], r[0]]);
  const down = apply(s, r[0], "down");
  assert.deepEqual(ids(down.s).slice(0, 2), [r[1], r[0]]);
  // waiting tier: find an adjacent independent pair
  const n = readyCount(s);
  let k = n;
  while (!scheduleMoveAvailability(s.scheduled, k + 1).up) k++;
  const w = apply(s, r[k + 1], "up");
  assert.deepEqual(ids(w.s), w.order);
  assert.deepEqual([ids(w.s)[k], ids(w.s)[k + 1]], [r[k + 1], r[k]]);
});

test("Move to Top / Move to Bottom stay inside the tier", () => {
  const s = project("balanced");
  const n = readyCount(s);
  const r = ids(s);
  // ready: last ready → top of list
  const top = apply(s, r[n - 1], "top");
  assert.equal(ids(top.s)[0], r[n - 1]);
  // ready: first ready → bottom of READY tier (never below a waiting match)
  const bottom = apply(s, r[0], "bottom");
  assert.equal(ids(bottom.s)[n - 1], r[0]);
  assert.equal(bottom.s.byId[r[0]].eligibility.ready, true);
  // waiting: W3M1 (Ann vs Winner of W10 — feeder on a table) → first waiting row
  const wTop = apply(s, "W3M1", "top");
  assert.equal(ids(wTop.s)[n], "W3M1");
  // waiting: bottom → after every non-dependent waiting match, before its dependents + GF/GF2
  const wBot = apply(s, "L2M1", "bottom");
  const o = ids(wBot.s);
  assert.ok(o.indexOf("L2M1") > o.indexOf("L2M4"));
  assert.ok(o.indexOf("L2M1") < o.indexOf("L3M1")); // L3M1 needs L2M1
  assert.equal(o.at(-1), "GF2");
});

test("a Waiting match can never be moved above a Ready match", () => {
  const s = project("balanced");
  const n = readyCount(s);
  const firstWaiting = s.scheduled[n];
  assert.equal(scheduleMoveAvailability(s.scheduled, n).up, false);
  assert.equal(reorderScheduled(s.scheduled, firstWaiting.matchId, "up"), null);
  // Even a forged queueOrder that ranks it first keeps it below every Ready match.
  const forged = project("manual", [firstWaiting.matchId, ...ids(s).filter((x) => x !== firstWaiting.matchId)]);
  assert.equal(ids(forged).indexOf(firstWaiting.matchId), n);
  // …and the last Ready match can't be pushed below a Waiting one.
  assert.equal(scheduleMoveAvailability(s.scheduled, n - 1).down, false);
});

test("a Waiting match cannot jump its unresolved feeder", () => {
  const s = project("balanced");
  const o = ids(s);
  // find a waiting row whose direct feeder sits right above it
  const k = s.scheduled.findIndex((p, i) => i > 0 && p.eligibility.blockedBy.includes(o[i - 1]));
  assert.ok(k > 0, "fixture has an adjacent feeder pair");
  assert.equal(scheduleMoveAvailability(s.scheduled, k).up, false);
  assert.equal(reorderScheduled(s.scheduled, o[k], "up"), null);
  // Forged order putting it first: projection still places it after the feeder.
  const forged = project("manual", [o[k], ...o.filter((x) => x !== o[k])]);
  for (const f of s.byId[o[k]].eligibility.blockedBy) {
    if (ids(forged).includes(f)) assert.ok(ids(forged).indexOf(f) < ids(forged).indexOf(o[k]));
  }
});

test("manual priority never changes eligibility; Auto Assign still sees only readyQueue", () => {
  const s = project("balanced");
  const before = Object.fromEntries(Object.values(s.byId).map((p) => [p.matchId, p.eligibility.ready]));
  const moved = apply(s, "W3M1", "top").s;
  for (const p of Object.values(moved.byId)) assert.equal(p.eligibility.ready, before[p.matchId], p.matchId);
  assert.ok(!moved.readyQueue.some((e) => e.match.id === "W3M1"));
  // readyQueue under Manual is still exactly the existing orderQueue result
  const expected = orderQueue(
    buildQueueEntries(matches, computeReadyAtMap(bracket, ms), NOW),
    "manual",
    ids(moved),
  ).map((e) => e.match.id);
  assert.deepEqual(moved.readyQueue.map((e) => e.match.id), expected);
});

test("conditional GF2 is pinned last", () => {
  const s = project("balanced");
  const last = s.scheduled.length - 1;
  assert.equal(s.scheduled[last].matchId, "GF2");
  assert.deepEqual(scheduleMoveAvailability(s.scheduled, last), { up: false, down: false, top: false, bottom: false });
  assert.equal(scheduleMoveAvailability(s.scheduled, last - 1).down, false);
});
