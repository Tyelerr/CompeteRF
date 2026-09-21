// src/utils/__tests__/schedule.projection.test.ts
// Run: npx tsx --test src/utils/__tests__/schedule.projection.test.ts
// Pure tests over the real bracket graph builder + resolver + queue utils.
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
import { buildQueueEntries, computeReadyAtMap, isReady, orderQueue } from "../queue.utils";
import {
  ProjectedSchedule,
  projectedSlotText,
  projectSchedule,
} from "../schedule.projection";

const cfg: RaceConfig = {
  mode: "fixed",
  fixedWinners: 7,
  groups: [],
  diffMin: 0,
  diffPerGame: 0,
  diffMax: null,
};
const DRAWN = "2026-09-01T10:00:00.000Z";
const NOW = Date.parse("2026-09-01T14:00:00.000Z");
const at = (min: number) => new Date(Date.parse(DRAWN) + min * 60000).toISOString();
const MODES: AutoAssignMode[] = ["balanced", "winnersFirst", "losersFirst", "longestWait", "manual"];

const mkBracket = (names: (string | null)[], doubleElim: boolean): GeneratedBracket => ({
  generatedAt: DRAWN,
  drawType: "random",
  format: doubleElim ? "double_elimination" : "single_elimination",
  drawNumber: 1,
  players: names.filter(Boolean).length,
  bracketSize: names.length,
  byes: names.filter((n) => !n).length,
  round1: [],
  doubleElim,
  graph: buildBracketGraph(names.length, doubleElim),
  seeds: names.map((n, i) => (n ? { registrationId: 100 + i, name: n, fargo: 500 } : null)),
});

const done = (winner: 1 | 2, min: number): MatchLiveState => ({
  status: "completed",
  winner,
  completedAt: at(min),
});

const project = (
  bracket: GeneratedBracket,
  ms: Record<string, MatchLiveState>,
  mode: AutoAssignMode = "balanced",
  queueOrder: string[] = [],
) => {
  const matches = buildLiveMatches(bracket, ms, [], "9-ball", cfg);
  const s = projectSchedule({ bracket, matches, matchState: ms, mode, queueOrder, now: NOW });
  return { matches, s };
};

const ids = (s: ProjectedSchedule) => s.scheduled.map((p) => p.matchId);
const text = (s: ProjectedSchedule, id: string) =>
  `${projectedSlotText(s.byId[id].slot1)} vs ${projectedSlotText(s.byId[id].slot2)}`;

// Invariants that must hold for EVERY projection.
const assertInvariants = (s: ProjectedSchedule) => {
  const pos = new Map(ids(s).map((id, i) => [id, i]));
  for (const pm of Object.values(s.byId)) {
    // eligibility is exactly isReady — never influenced by priority
    assert.equal(pm.eligibility.ready, isReady(pm.match), `eligibility ${pm.matchId}`);
    assert.equal(pm.eligibility.ready, pm.lifecycle === "ready", `lifecycle ${pm.matchId}`);
    if (pm.eligibility.ready) assert.deepEqual(pm.eligibility.blockedBy, []);
  }
  for (const pm of s.scheduled) {
    assert.ok(pm.lifecycle === "ready" || pm.lifecycle === "waiting", `scheduled ${pm.matchId}`);
    // never ahead of an unresolved feeder that is also scheduled
    for (const f of pm.eligibility.blockedBy) {
      if (pos.has(f)) assert.ok((pos.get(f) as number) < (pos.get(pm.matchId) as number), `${pm.matchId} before feeder ${f}`);
    }
  }
  // ready subsequence === readyQueue (existing orderQueue output), byte for byte
  assert.deepEqual(
    s.scheduled.filter((p) => p.eligibility.ready).map((p) => p.matchId),
    s.readyQueue.map((e) => e.match.id),
  );
  // only ready matches ever reach the Auto Assign list
  for (const e of s.readyQueue) assert.equal(s.byId[e.match.id].eligibility.ready, true);
  // TIER RULE: scheduled = [all ready, in readyQueue order] ++ [all waiting]
  const n = s.readyQueue.length;
  assert.deepEqual(ids(s).slice(0, n), s.readyQueue.map((e) => e.match.id), "ready tier first");
  for (const pm of s.scheduled.slice(n)) assert.equal(pm.lifecycle, "waiting", `tier 2 ${pm.matchId}`);
};

const readyIds = (s: ProjectedSchedule) => s.readyQueue.map((e) => e.match.id);
const futureIds = (s: ProjectedSchedule) => ids(s).slice(s.readyQueue.length);

const SE8 = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];

test("1. single elim before any match starts", () => {
  const b = mkBracket(SE8, false);
  const { s } = project(b, {});
  assertInvariants(s);
  assert.equal(s.scheduled.length, 7);
  assert.deepEqual(s.readyQueue.map((e) => e.match.id), ["W1M1", "W1M2", "W1M3", "W1M4"]);
  assert.equal(s.byId.W2M1.lifecycle, "waiting");
  assert.equal(s.byId.W2M1.eligibility.ready, false);
  assert.deepEqual(s.byId.W2M1.eligibility.blockedBy, ["W1M1", "W1M2"]);
  assert.equal(text(s, "W2M1"), "Winner of W1 vs Winner of W2");
  assert.equal(s.byId.W3M1.dependencyDepth, 2);
  assert.equal(s.byId.W3M1.conditional, null);
  assert.equal(ids(s).at(-1), "W3M1");
  // single elim has no loser feeders anywhere
  for (const pm of Object.values(s.byId))
    for (const sl of [pm.slot1, pm.slot2]) assert.ok(!(sl.kind === "feeder" && sl.outcome === "loser"));
});

test("2/7. single elim after feeders resolve: one resolved + one unresolved side", () => {
  const b = mkBracket(SE8, false);
  const { s } = project(b, { W1M1: done(1, 30) });
  assertInvariants(s);
  assert.equal(text(s, "W2M1"), "Ann vs Winner of W2");
  assert.deepEqual(s.byId.W2M1.slot1, {
    kind: "player",
    registrationId: 100,
    name: "Ann",
    fargo: 500,
    raceTo: null, // race only resolves once both players are known
  });
  assert.deepEqual(s.byId.W2M1.eligibility.blockedBy, ["W1M2"]);
  assert.equal(s.byId.W2M1.firstSideReadyAt, Date.parse(at(30)));
  // 13. completed is not scheduled
  assert.ok(!ids(s).includes("W1M1"));
  assert.deepEqual(s.completed.map((p) => p.matchId), ["W1M1"]);

  // Feeder finishes → placeholder replaced by the real player via recompute.
  const { s: s2 } = project(b, { W1M1: done(1, 30), W1M2: done(2, 40) });
  assert.equal(text(s2, "W2M1"), "Ann vs Di");
  assert.equal(s2.byId.W2M1.lifecycle, "ready");
  assertInvariants(s2);
});

test("3/5/6/8. double elim before play: winner + loser placeholders, both sides unresolved", () => {
  const b = mkBracket(SE8, true);
  const { s } = project(b, {});
  assertInvariants(s);
  assert.equal(Object.keys(s.byId).length, 15); // 7 W + 6 L + GF + GF2
  assert.equal(s.scheduled.length, 15);
  assert.equal(text(s, "L1M1"), "Loser of W1 vs Loser of W2");
  assert.deepEqual(s.byId.L1M1.slot1, {
    kind: "feeder",
    outcome: "loser",
    sourceMatchId: "W1M1",
    sourceLabel: "W1",
    sourceSide: "winners",
  });
  assert.equal(text(s, "L2M1"), "Winner of L1 vs Loser of W6");
  assert.equal(text(s, "GF"), "Winner of W7 vs Winner of L6");
  assert.equal(s.byId.W3M1.location, "Hotseat");
});

test("4. double elim partially resolved", () => {
  const b = mkBracket(SE8, true);
  const ms = { W1M1: done(1, 20), W1M2: done(1, 25), W1M3: done(2, 30) };
  const { s } = project(b, ms);
  assertInvariants(s);
  assert.equal(s.byId.L1M1.lifecycle, "ready");
  assert.equal(text(s, "L1M1"), "Bo vs Di");
  assert.equal(text(s, "L1M2"), "Ed vs Loser of W4");
  assert.equal(s.byId.W2M1.lifecycle, "ready");
  assert.equal(text(s, "W2M2"), "Fay vs Winner of W4");
});

// State used for mode tests: all W1 done, W2M1 on the table, W2M2 + L1M1 + L1M2 ready.
const modeState = (): Record<string, MatchLiveState> => ({
  W1M1: done(1, 20),
  W1M2: done(1, 50),
  W1M3: done(1, 30),
  W1M4: done(1, 40),
  W2M1: { status: "in_progress", tableId: 1, startedAt: at(55) },
});

test("9. ready matches preserve existing orderQueue semantics in every mode", () => {
  const b = mkBracket(SE8, true);
  const ms = modeState();
  for (const mode of MODES) {
    const q = mode === "manual" ? ["L1M2", "W2M2"] : [];
    const { matches, s } = project(b, ms, mode, q);
    assertInvariants(s);
    const expected = orderQueue(
      buildQueueEntries(matches, computeReadyAtMap(b, ms), NOW),
      mode,
      q,
    ).map((e) => e.match.id);
    assert.deepEqual(s.readyQueue.map((e) => e.match.id), expected, mode);
    assert.deepEqual(s.scheduled.filter((p) => p.eligibility.ready).map((p) => p.matchId), expected, mode);
    s.readyQueue.forEach((e, i) => assert.equal(s.byId[e.match.id].readyRank, i));
  }
});

// Mid-play 16-player DE: W1 done, W2M1 done (Ann), W2M2 in progress, W2M3/W2M4 ready,
// L1M1 done, L1M2 assigned (not started), L1M3/L1M4 ready.
const SE16 = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal", "Ivy", "Jon", "Kim", "Lou", "Max", "Ned", "Ola", "Pat"];
const midState = (): Record<string, MatchLiveState> => ({
  W1M1: done(1, 20), W1M2: done(2, 25), W1M3: done(1, 30), W1M4: done(1, 35),
  W1M5: done(2, 40), W1M6: done(1, 45), W1M7: done(1, 50), W1M8: done(2, 55),
  W2M1: done(1, 80),
  W2M2: { status: "in_progress", tableId: 1, startedAt: at(85) },
  L1M1: done(1, 90),
  L1M2: { status: "scheduled", tableId: 2 },
});

test("10. Losers First: ready tier first, losers still prioritized among futures", () => {
  const b = mkBracket(SE8, true);
  const { s } = project(b, modeState(), "losersFirst");
  assertInvariants(s);
  // Ready tier = orderQueue (L1M2 waited longer than L1M1); L2M2 no longer jumps W2M2.
  assert.deepEqual(readyIds(s), ["L1M2", "L1M1", "W2M2"]);
  assert.deepEqual(futureIds(s), ["L2M1", "L2M2", "L3M1", "W3M1", "L4M1", "GF", "GF2"]);
  assert.equal(s.byId.L2M2.eligibility.ready, false);
  assert.ok(!s.readyQueue.some((e) => e.match.id === "L2M2"));

  // 16-player: losers futures (even 2 levels away) stay below every ready match,
  // and the future section still leads with losers matches.
  const big = project(mkBracket(SE16, true), midState(), "losersFirst").s;
  assertInvariants(big);
  assert.deepEqual(readyIds(big), ["L1M3", "L1M4", "W2M3", "W2M4"]);
  const fut = futureIds(big);
  assert.equal(big.byId[fut[0]].side, "losers");
  assert.ok(fut.indexOf("L3M2") < fut.indexOf("W3M1"), fut.join(","));
});

test("11. Winners First: ready tier first, winners futures ahead of losers futures", () => {
  const b = mkBracket(SE8, true);
  const { s } = project(b, modeState(), "winnersFirst");
  assertInvariants(s);
  assert.deepEqual(readyIds(s), ["W2M2", "L1M2", "L1M1"]);
  assert.deepEqual(futureIds(s), ["W3M1", "L2M1", "L2M2", "L3M1", "L4M1", "GF", "GF2"]);
  assert.equal(s.byId.W3M1.eligibility.ready, false);

  const big = project(mkBracket(SE16, true), midState(), "winnersFirst").s;
  assertInvariants(big);
  assert.deepEqual(readyIds(big), ["W2M3", "W2M4", "L1M3", "L1M4"]);
  // W13 (Ann vs Winner of W10), W14, Hotseat — now all BELOW ready L3/L4, but first among futures
  assert.deepEqual(futureIds(big).slice(0, 3), ["W3M1", "W3M2", "W4M1"]);
  assert.equal(text(big, "W3M1"), "Ann vs Winner of W10");
});

test("Balanced: a lower-round future match cannot jump a ready match; balanced order within futures", () => {
  // W1M3 still on the table → L1M2 (Losers R1) is waiting; W2M1 (Winners R2) is ready.
  const b = mkBracket(SE8, true);
  const ms: Record<string, MatchLiveState> = {
    W1M1: done(1, 20),
    W1M2: done(1, 25),
    W1M3: { status: "in_progress", tableId: 1, startedAt: at(30) },
    W1M4: done(1, 35),
  };
  const { s } = project(b, ms, "balanced");
  assertInvariants(s);
  assert.deepEqual(readyIds(s), ["L1M1", "W2M1"]);
  assert.equal(text(s, "L1M2"), "Loser of W3 vs Hal");
  // Round 1 future sits below the Round 2 ready match; then lowest round, losers on ties.
  assert.deepEqual(futureIds(s).slice(0, 3), ["L1M2", "L2M2", "W2M2"]);
});

test("Longest Waiting stays ready-first with the deterministic future fallback", () => {
  const big = project(mkBracket(SE16, true), midState(), "longestWait").s;
  assertInvariants(big);
  // Futures: fewest unresolved levels first (all depth-1 before any depth-2).
  const depths = futureIds(big).map((id) => big.byId[id].dependencyDepth);
  assert.deepEqual(depths, [...depths].sort((x, y) => x - y));
});

test("12. Manual: future cannot rise above ready; manual rank still orders futures", () => {
  const b = mkBracket(SE8, true);
  const ms = modeState();
  // L2M2 is ranked #1 but is waiting → stays in tier 2 (first there).
  const { matches, s } = project(b, ms, "manual", ["L2M2", "W2M2"]);
  assertInvariants(s);
  assert.equal(s.scheduled.length, 10); // 3 ready + 7 waiting (incl GF, GF2)
  const expectedReady = orderQueue(
    buildQueueEntries(matches, computeReadyAtMap(b, ms), NOW),
    "manual",
    ["L2M2", "W2M2"],
  ).map((e) => e.match.id);
  assert.deepEqual(readyIds(s), expectedReady);
  assert.deepEqual(readyIds(s), ["W2M2", "L1M2", "L1M1"]);
  assert.equal(futureIds(s)[0], "L2M2");
  assert.equal(s.byId.L2M2.eligibility.ready, false);

  // Manual rank changes future order: default balanced puts L3M1 before W3M1;
  // ranking W3M1 lifts it to the front of the future section.
  const plain = futureIds(project(b, ms, "manual", []).s);
  assert.ok(plain.indexOf("L3M1") < plain.indexOf("W3M1"));
  const ranked = project(b, ms, "manual", ["W3M1"]).s;
  assertInvariants(ranked);
  assert.equal(futureIds(ranked)[0], "W3M1");
  // …but a ranked future match still can't pass its own feeder.
  const blocked = futureIds(project(b, ms, "manual", ["L3M1"]).s);
  assert.ok(blocked.indexOf("L3M1") > blocked.indexOf("L2M1") && blocked.indexOf("L3M1") > blocked.indexOf("L2M2"));
});

test("13/14. completed excluded; assigned + in-progress are active, not scheduled", () => {
  const b = mkBracket(SE8, true);
  const ms = { ...modeState(), L1M1: { status: "scheduled", tableId: 2 } as MatchLiveState };
  const { s } = project(b, ms);
  assertInvariants(s);
  assert.deepEqual(s.active.map((p) => [p.matchId, p.lifecycle]), [
    ["W2M1", "inProgress"],
    ["L1M1", "assigned"],
  ]);
  for (const id of ["W1M1", "W1M2", "W1M3", "W1M4", "W2M1", "L1M1"]) assert.ok(!ids(s).includes(id), id);
  assert.equal(s.byId.L1M1.eligibility.ready, false);
  // L2M1 waits on L1M1 (assigned, ahead of the schedule) + W2M2 (ready)
  assert.deepEqual(s.byId.L2M1.eligibility.blockedBy, ["L1M1", "W2M2"]);
});

test("15. grand final + conditional GF2 reset", () => {
  const b = mkBracket(["A", "B", "C", "D"], true);
  const upToGF = {
    W1M1: done(1, 10),
    W1M2: done(1, 20),
    W2M1: done(1, 30),
    L1M1: done(1, 40),
    L2M1: done(1, 50),
  };
  // Before GF: GF2 exists only as a possibility, last, not ready.
  const pre = project(b, {}).s;
  assertInvariants(pre);
  assert.equal(pre.byId.GF2.conditional, "possible");
  assert.equal(ids(pre).at(-1), "GF2");
  assert.equal(text(pre, "GF2"), "Winner of Finals vs Loser of Finals");
  for (const mode of MODES) assert.equal(ids(project(b, {}, mode, ["GF2"]).s).at(-1), "GF2", mode);

  const ready = project(b, upToGF).s;
  assert.equal(ready.byId.GF.lifecycle, "ready");
  assert.equal(ready.byId.GF.conditional, null);
  assert.equal(ready.byId.GF2.conditional, "possible");
  assert.deepEqual(ids(ready), ["GF", "GF2"]);

  // WB finalist wins GF → reset skipped: GF2 disappears.
  const noReset = project(b, { ...upToGF, GF: done(1, 60) }).s;
  assert.equal(noReset.byId.GF2, undefined);
  assert.deepEqual(ids(noReset), []);

  // LB finalist wins GF → reset required and ready.
  const reset = project(b, { ...upToGF, GF: done(2, 60) }).s;
  assertInvariants(reset);
  assert.equal(reset.byId.GF2.conditional, "required");
  assert.equal(reset.byId.GF2.lifecycle, "ready");
  assert.deepEqual(reset.readyQueue.map((e) => e.match.id), ["GF2"]);
});

test("16. byes / empty slots and pass-through placeholders", () => {
  // 6 players in an 8 bracket: W1M2 and W1M4 are byes.
  const b = mkBracket(["Ann", "Bo", "Cy", null, "Ed", "Fay", "Gus", null], true);
  const { s } = project(b, {});
  assertInvariants(s);
  assert.equal(s.byId.W1M2.lifecycle, "bye");
  assert.equal(text(s, "W1M2"), "Cy vs Bye");
  // L1M1 = Loser of W1M1 vs loser of a bye → can only ever be a bye: not scheduled
  assert.equal(s.byId.L1M1.lifecycle, "bye");
  assert.ok(!ids(s).includes("L1M1") && !ids(s).includes("W1M2"));
  // The bye advanced Cy; the L2 placeholder follows the pass-through to the real source.
  assert.equal(text(s, "W2M1"), "Winner of W1 vs Cy");
  assert.equal(s.byId.L2M1.slot1.kind, "feeder");
  assert.deepEqual(
    s.byId.L2M1.slot1.kind === "feeder" && [s.byId.L2M1.slot1.outcome, s.byId.L2M1.slot1.sourceMatchId],
    ["loser", "W1M1"],
  );
  assert.deepEqual(s.byId.L2M1.eligibility.blockedBy.sort(), ["W1M1", "W2M2"]);

  // After W1M1: L1M1 auto-advances Bo, L2M1 side resolves.
  const after = project(b, { W1M1: done(1, 30) }).s;
  assertInvariants(after);
  assert.equal(after.byId.L1M1.lifecycle, "bye");
  assert.equal(projectedSlotText(after.byId.L2M1.slot1), "Bo");
});

test("dependency safety holds for every mode across representative states", () => {
  const b = mkBracket(SE8, true);
  const states: Record<string, MatchLiveState>[] = [
    {},
    { W1M1: done(1, 20) },
    modeState(),
    { ...modeState(), W2M1: done(2, 70), L1M1: done(1, 60) },
  ];
  for (const ms of states)
    for (const mode of MODES) for (const q of [[], ["GF", "L3M1", "W3M1"]]) assertInvariants(project(b, ms, mode, q).s);
});

test("empty inputs", () => {
  const s = projectSchedule({ bracket: null, matches: [], matchState: {}, mode: "balanced", queueOrder: [], now: NOW });
  assert.deepEqual([s.scheduled, s.active, s.completed, s.readyQueue], [[], [], [], []]);
});
