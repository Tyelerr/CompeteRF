// supabase/tests/race_parity.test.ts
// Parity: the SERVER race port (supabase/functions/_shared/race.ts, used by
// notify-match-assigned) must produce exactly the races the APP computes
// (raceConfigFromLiveSettings → buildLiveMatches → resolveBracket → matchRaces) and the same
// race text (matchRaceText), for every real match across random brackets and settings.
// Run: npx tsx --test supabase/tests/race_parity.test.ts
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { raceConfigFromLiveSettings } from "../../src/utils/bracket.utils";
import { buildLiveMatches, matchRaceText } from "../../src/utils/match.utils";
import { resolveMatchSides } from "../functions/_shared/bracket";
import { computeMatchRace, stageOfMatch } from "../functions/_shared/race";

let seed = 20260923;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

const settingsVariants = (): Record<string, unknown>[] => [
  { raceMode: "fixed", fixedRaceWinners: 7, fixedRaceLosers: 5, fixedRaceFinals: 11 },
  { raceMode: "fixed", fixedRaceWinners: 6 }, // no losers / finals values → winners race everywhere
  { raceMode: "fixed", fixedRaceWinners: 5, fixedRaceLosers: 5, fixedRaceFinals: 9 },
  {
    raceMode: "groups",
    fixedRaceWinners: 5,
    raceGroups: [
      { label: "A", minFargo: 650, maxFargo: 0, raceTo: 7 },
      { label: "B", minFargo: 520, maxFargo: 649, raceTo: 5 },
      { label: "C", minFargo: 0, maxFargo: 450, raceTo: 3 }, // 451-519 falls outside → fallback
    ],
  },
  { raceMode: "differential", fargoDiffMinRace: 4, fargoDiffPerGame: 40, fargoDiffMaxRace: 7 },
  { raceMode: "differential", fargoDiffMinRace: 3, fargoDiffPerGame: 25, fargoDiffMaxRace: null },
];

test("server race == app race for every real match (fixed stages, groups, differential, overrides, byes)", () => {
  let compared = 0;
  const seen = { equal: 0, unequal: 0, winners: 0, losers: 0, finals: 0, modes: new Set<string>() };
  for (const size of [4, 8, 16]) {
    for (const dbl of [false, true]) {
      for (const ls0 of settingsVariants()) {
        for (let run = 0; run < 3; run++) {
          const seeds = Array.from({ length: size }, (_, i) =>
            run === 2 && i % 7 === 5
              ? null // byes
              : {
                  registrationId: 900 + i,
                  name: `Player ${i + 1}`,
                  fargo: rand() < 0.1 ? null : 400 + Math.floor(rand() * 400),
                  raceOverride: rand() < 0.08 ? 2 + Math.floor(rand() * 8) : null,
                },
          );
          const graph = buildBracketGraph(size, dbl);
          const bracket: any = { generatedAt: "2026-09-23T10:00:00Z", graph, seeds, drawNumber: 1 };
          const ms: Record<string, any> = {};
          for (let step = 0; step < 4 * size; step++) {
            const ls: any = { ...ls0, bracket, matchState: ms };
            const app = buildLiveMatches(bracket, ms, [], "9-ball", raceConfigFromLiveSettings(ls));
            const real = app.filter((m) => !m.bye && !m.empty && !m.pending && m.p1RegId != null && m.p2RegId != null);
            for (const m of real) {
              const sides = resolveMatchSides(bracket, ms, m.id);
              assert.ok(sides && sides.p1 && sides.p2, `sides ${m.id}`);
              assert.deepEqual([sides.p1.registrationId, sides.p2.registrationId], [m.p1RegId, m.p2RegId]);
              const srv = computeMatchRace(ls, m.id, { p1: sides.p1, p2: sides.p2 });
              const where = `size=${size} dbl=${dbl} mode=${ls0.raceMode} run=${run} ${m.id}`;
              assert.deepEqual([srv.p1Race, srv.p2Race], [m.p1Race, m.p2Race], where);
              assert.equal(srv.text, matchRaceText(m), where);
              compared++;
              if (srv.p1Race === srv.p2Race) seen.equal++;
              else seen.unequal++;
              seen[stageOfMatch(graph, m.id)]++;
              seen.modes.add(String(ls0.raceMode));
            }
            const open = real.filter((m) => m.status !== "completed");
            if (!open.length) break;
            const m = pick(open);
            const r = rand();
            ms[m.id] = { status: "completed", winner: rand() < 0.5 ? 1 : 2, result: r < 0.07 ? "withdraw" : r < 0.14 ? "forfeit" : "normal" };
          }
        }
      }
    }
  }
  assert.ok(compared > 1500, `compared ${compared}`);
  // every required case was actually exercised
  assert.ok(seen.equal > 0 && seen.unequal > 0, JSON.stringify(seen));
  assert.ok(seen.winners > 0 && seen.losers > 0 && seen.finals > 0, JSON.stringify(seen));
  assert.deepEqual([...seen.modes].sort(), ["differential", "fixed", "groups"]);
  console.log(`race parity: ${compared} matches — ${JSON.stringify({ ...seen, modes: [...seen.modes] })}`);
});

test("fixed stage examples (explicit): winners 7 / losers 5 / finals 11, and single-elim finals", () => {
  const seeds = ["A", "B", "C", "D"].map((n, i) => ({ registrationId: i + 1, name: n, fargo: 500 }));
  const ls: any = { raceMode: "fixed", fixedRaceWinners: 7, fixedRaceLosers: 5, fixedRaceFinals: 11 };
  const de: any = { graph: buildBracketGraph(4, true), seeds };
  const done = { status: "completed", winner: 1 };
  const msDE: any = { W1M1: done, W1M2: done, W2M1: done, L1M1: done, L2M1: done };
  const race = (b: any, ms: any, id: string) => {
    const s = resolveMatchSides(b, ms, id)!;
    return computeMatchRace({ ...ls, bracket: b, matchState: ms }, id, { p1: s.p1!, p2: s.p2! });
  };
  assert.equal(race(de, {}, "W1M1").text, "Race to 7");
  assert.equal(race(de, msDE, "L1M1").text, "Race to 5");
  assert.equal(race(de, msDE, "GF").text, "Race to 11");
  const se: any = { graph: buildBracketGraph(4, false), seeds };
  assert.equal(race(se, { W1M1: done, W1M2: done }, "W2M1").text, "Race to 11");
});
