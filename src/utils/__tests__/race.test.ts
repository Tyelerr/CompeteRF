// src/utils/__tests__/race.test.ts
// Run: npx tsx --test src/utils/__tests__/race.test.ts
// Races come from ONE path: raceConfigFromLiveSettings → resolveBracket → matchRaces →
// LiveMatch.p1Race/p2Race/raceTo → matchRaceInfo/matchRaceText (Queue, player view, messages).
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBracketGraph } from "../bracket.double";
import { raceConfigFromLiveSettings } from "../bracket.utils";
import { buildLiveMatches, matchRaceInfo, matchRaceText } from "../match.utils";

const seeds = (fargos: number[], overrides: Record<number, number> = {}) =>
  fargos.map((f, i) => ({ registrationId: 100 + i, name: `P${i + 1}`, fargo: f, raceOverride: overrides[i] ?? null }));
const live = (dbl: boolean, ls: Record<string, unknown>, fargos: number[], ms: Record<string, unknown> = {}, overrides = {}) =>
  buildLiveMatches(
    { generatedAt: "2026-09-01T10:00:00Z", graph: buildBracketGraph(fargos.length, dbl), seeds: seeds(fargos, overrides) } as any,
    ms as any,
    [],
    "9-ball",
    raceConfigFromLiveSettings(ls as any),
  );
const byId = (ms: ReturnType<typeof live>) => new Map(ms.map((m) => [m.id, m]));
const done = (w: 1 | 2) => ({ status: "completed", winner: w });
const FIXED = { raceMode: "fixed", fixedRaceWinners: 7, fixedRaceLosers: 5, fixedRaceFinals: 11 };

test("Fixed Race (double elim): winners side, losers side and finals use their configured races", () => {
  const f = [500, 500, 500, 500];
  // play to the grand final: W1M1 A, W1M2 C, W2M1 A, L1M1 B, L2M1 B → GF A vs B
  const ms = { W1M1: done(1), W1M2: done(1), W2M1: done(1), L1M1: done(1), L2M1: done(1) };
  const m = byId(live(true, FIXED, f, ms));
  assert.equal(m.get("W1M1")!.raceTo, 7);
  assert.equal(m.get("W2M1")!.raceTo, 7); // Hotseat is a winners-side match
  assert.equal(m.get("L1M1")!.raceTo, 5);
  assert.equal(m.get("L2M1")!.raceTo, 5);
  assert.equal(m.get("GF")!.raceTo, 11);
  assert.equal(m.get("W1M1")!.raceLabel, "Race 7");
  assert.equal(m.get("L1M1")!.raceLabel, "Race 5");
  assert.equal(m.get("GF")!.raceLabel, "Race 11");
});

test("Fixed Race (single elim): the championship match uses the finals race", () => {
  const m = byId(live(false, FIXED, [500, 500, 500, 500], { W1M1: done(1), W1M2: done(1) }));
  assert.equal(m.get("W1M1")!.raceTo, 7);
  assert.equal(m.get("W2M1")!.raceTo, 11);
});

test("Fixed Race without losers/finals values falls back to the winners race (unchanged behavior)", () => {
  const m = byId(live(true, { raceMode: "fixed", fixedRaceWinners: 6 }, [500, 500, 500, 500], { W1M1: done(1), W1M2: done(1) }));
  assert.equal(m.get("L1M1")!.raceTo, 6);
  assert.equal(m.get("W2M1")!.raceTo, 6);
});

test("A/B/C race groups: each player's own group race; stage does not apply", () => {
  const ls = {
    ...FIXED, // fixed-stage values present but irrelevant in groups mode
    raceMode: "groups",
    raceGroups: [
      { label: "A", minFargo: 600, maxFargo: 0, raceTo: 6 },
      { label: "B", minFargo: 0, maxFargo: 599, raceTo: 4 },
    ],
  };
  const m = byId(live(true, ls, [650, 480, 620, 610], { W1M1: done(1), W1M2: done(1) }));
  const w1 = m.get("W1M1")!;
  assert.deepEqual([w1.p1Race, w1.p2Race, w1.raceTo], [6, 4, null]);
  const l1 = m.get("L1M1")!; // P2 (480, B) vs P4 (610, A) — losers side, still group races
  assert.deepEqual([l1.p1Race, l1.p2Race], [4, 6]);
  assert.equal(matchRaceText(w1), "P1 — Race to 6\nP2 — Race to 4");
});

test("Fargo Differential: lower rated gets the minimum race, higher rated gets min + diff/perGame (capped)", () => {
  const ls = { raceMode: "differential", fargoDiffMinRace: 4, fargoDiffPerGame: 40, fargoDiffMaxRace: 7 };
  const m = byId(live(true, ls, [600, 500, 550, 550]));
  const w1 = m.get("W1M1")!; // 600 vs 500: diff 100 → +2 → 6 for the higher
  assert.deepEqual([w1.p1Race, w1.p2Race], [6, 4]);
  const w2 = m.get("W1M2")!; // equal ratings → equal races
  assert.deepEqual([w2.p1Race, w2.p2Race, w2.raceTo], [4, 4, 4]);
  const capped = byId(live(true, ls, [800, 400, 550, 550])).get("W1M1")!; // +10 → capped at 7
  assert.deepEqual([capped.p1Race, capped.p2Race], [7, 4]);
});

test("manual race override wins and shows as unequal", () => {
  const m = byId(live(true, FIXED, [500, 500, 500, 500], {}, { 0: 9 }));
  const w1 = m.get("W1M1")!;
  assert.deepEqual([w1.p1Race, w1.p2Race], [9, 7]);
  assert.equal(matchRaceInfo(w1).equal, false);
});

test("race text: equal → one line, unequal → one line per player", () => {
  assert.equal(matchRaceText({ p1Name: "Tyelerr Hill", p2Name: "John Smith", p1Race: 7, p2Race: 7, raceTo: 7 }), "Race to 7");
  assert.equal(
    matchRaceText({ p1Name: "Tyelerr Hill", p2Name: "John Smith", p1Race: 5, p2Race: 4, raceTo: null }),
    "Tyelerr Hill — Race to 5\nJohn Smith — Race to 4",
  );
});
