// src/utils/__tests__/elim-lifecycle-invariants.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-lifecycle-invariants.test.ts
//
// Full single- and double-elimination lifecycles driven through the SAME pure engine the app
// and the server Auto Assign bundle use (buildBracketGraph → seedPlayers → buildLiveMatches /
// resolveBracket → planAutoAssignFromState → computeEliminatedRegIds / computeStandings).
// Each run draws a field, assigns Ready matches to a limited set of tables every step (Auto
// Assign planner, every queue mode), plays a random in-progress match to completion, and
// checks the bracket invariants after EVERY step:
//   • a table never hosts two unfinished matches; a player is never in two unfinished matches
//   • only Ready (both players known) matches are ever planned onto a table
//   • an eliminated player never re-appears in an unfinished match
//   • double elim: nobody is eliminated after one legitimate loss; nobody with two losses plays on
//   • the bracket never deadlocks (something is always playable until there is a champion)
// and at the end: exactly one champion, N-1 eliminated, SE = N-1 played matches, DE = 2N-2 or
// 2N-1 (reset), standings place every entrant exactly once with a unique 1st and 2nd.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { AutoAssignMode, MatchLiveState } from "../../models/types/tournament-settings.types";
import { buildBracketGraph } from "../bracket.double";
import { resolveBracket, MatchResult } from "../bracket.resolve";
import { DrawPlayer, RaceConfig, recommendedBracketSize, seedPlayers } from "../bracket.utils";
import { buildLiveMatches, computeEliminatedRegIds, elimPlayersRemaining, LiveMatch } from "../match.utils";
import { planAutoAssignFromState } from "../auto-assign";
import { computeStandings } from "../tournament.stats";

const CFG: RaceConfig = { mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null } as any;
const MODES: AutoAssignMode[] = ["balanced", "winnersFirst", "losersFirst", "longestWait", "manual"];

// Deterministic PRNG so failures are reproducible.
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

const tablesOf = (n: number, tid = 1, unavailable: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({
    id: tid * 1000 + i + 1,
    tournament_id: tid,
    table_number: i + 1,
    status: unavailable.includes(i + 1) ? "unavailable" : "available",
    is_streaming: false,
  })) as any[];

const playersOf = (n: number, rand: () => number, base = 1): DrawPlayer[] =>
  Array.from({ length: n }, (_, i) => ({
    registrationId: base + i,
    // Duplicate names on purpose (identity is the registration id, never the name).
    name: i % 7 === 3 ? "Same Name" : `P${base + i}`,
    fargo: Math.floor(200 + rand() * 600),
  })) as DrawPlayer[];

interface RunOpts {
  n: number;
  dbl: boolean;
  tables: number;
  mode: AutoAssignMode;
  seed: number;
  withdrawRate?: number;
  forfeitRate?: number;
  unavailable?: number[];
}

interface RunResult {
  champion: number | null;
  played: number; // real matches decided (winner set)
  withdrawals: number;
  eliminated: number[];
  matches: LiveMatch[];
  steps: number;
  maxConcurrent: number;
}

const unfinished = (m: LiveMatch) => m.status !== "completed" && !m.bye && !m.empty;

const runTournament = (o: RunOpts): RunResult => {
  const rand = rng(o.seed);
  const players = playersOf(o.n, rand);
  const size = recommendedBracketSize(o.n);
  const bracket: any = {
    generatedAt: "2026-09-01T10:00:00.000Z",
    graph: buildBracketGraph(size, o.dbl),
    seeds: seedPlayers(players, size),
    doubleElim: o.dbl,
  };
  const tables = tablesOf(o.tables, 1, o.unavailable ?? []);
  const matchState: Record<string, MatchLiveState> = {};
  let now = Date.parse("2026-09-01T10:00:00.000Z");
  const iso = () => new Date(now).toISOString();
  const losses = new Map<number, number>();
  const withdrawn = new Set<number>();
  let played = 0;
  let withdrawals = 0;
  let steps = 0;
  let maxConcurrent = 0;

  const build = () => buildLiveMatches(bracket, matchState, tables, "9-ball", CFG);
  const ctx = () => `n=${o.n} dbl=${o.dbl} tables=${o.tables} mode=${o.mode} seed=${o.seed} step=${steps}`;

  for (;;) {
    steps++;
    assert.ok(steps < 2000, `runaway ${ctx()}`);
    // ── Auto Assign: plan exactly as the server does, then apply as server 'assign' ops.
    const ls: any = { bracket, matchState, autoAssignMode: o.mode, queueOrder: [] };
    const plan = planAutoAssignFromState({ liveSettings: ls, tables, gameType: "9-ball", now });
    let matches = build();
    const byId = new Map(matches.map((m) => [m.id, m]));
    for (const p of plan) {
      const m = byId.get(p.matchId)!;
      assert.ok(m && !m.pending && !m.bye && !m.empty && m.status === "scheduled" && m.tableId == null,
        `planned a non-Ready match ${p.matchId} ${ctx()}`);
      assert.notEqual(tables.find((t) => t.id === p.tableId)?.status, "unavailable", `planned onto unavailable table ${ctx()}`);
      matchState[p.matchId] = { ...(matchState[p.matchId] ?? { status: "scheduled" }), tableId: p.tableId, status: "in_progress", startedAt: iso() };
    }
    matches = build();

    // ── Invariants on the live state.
    const tableUse = new Map<number, string>();
    const playerUse = new Map<number, string>();
    const elim = new Set(computeEliminatedRegIds(matches));
    let concurrent = 0;
    for (const m of matches) {
      if (!unfinished(m)) continue;
      if (m.tableId != null) {
        concurrent++;
        assert.ok(!tableUse.has(m.tableId), `table ${m.tableId} double-booked (${tableUse.get(m.tableId)} + ${m.id}) ${ctx()}`);
        tableUse.set(m.tableId, m.id);
      }
      if (m.pending) continue;
      for (const r of [m.p1RegId, m.p2RegId]) {
        if (r == null) continue;
        assert.ok(!elim.has(r), `eliminated player ${r} in unfinished ${m.id} ${ctx()}`);
        assert.ok(!withdrawn.has(r), `withdrawn player ${r} in unfinished ${m.id} ${ctx()}`);
        if (o.dbl) assert.ok((losses.get(r) ?? 0) < 2, `player ${r} with 2 losses still playing ${m.id} ${ctx()}`);
        else assert.ok((losses.get(r) ?? 0) < 1, `SE player ${r} with a loss still playing ${m.id} ${ctx()}`);
        if (m.status === "in_progress") {
          assert.ok(!playerUse.has(r), `player ${r} in two active matches (${playerUse.get(r)} + ${m.id}) ${ctx()}`);
          playerUse.set(r, m.id);
        }
      }
    }
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    // DE: nobody is eliminated after only ONE legitimate loss.
    if (o.dbl) for (const r of elim) assert.ok((losses.get(r) ?? 0) >= 2 || withdrawn.has(r), `player ${r} eliminated with ${losses.get(r) ?? 0} loss(es) ${ctx()}`);

    const results: Record<string, MatchResult> = {};
    for (const [id, st] of Object.entries(matchState))
      results[id] = { completed: st.status === "completed", winner: st.winner ?? null, result: st.result ?? null };
    const champ = resolveBracket(bracket.graph, bracket.seeds, results, CFG).champion;
    if (champ) {
      assert.equal(matches.filter((m) => m.status === "in_progress").length, 0, `champion while a match is still live ${ctx()}`);
      return { champion: champ.registrationId, played, withdrawals, eliminated: [...elim], matches, steps, maxConcurrent };
    }

    // ── Play one live match to completion (no deadlock: there must be one).
    const live = matches.filter((m) => m.status === "in_progress" && !m.pending);
    assert.ok(live.length > 0, `DEADLOCK: no champion and nothing playable ${ctx()} free=${tables.length - tableUse.size}`);
    const m = live[Math.floor(rand() * live.length)];
    now += 5 * 60000;
    const r = rand();
    const winner: 1 | 2 = rand() < 0.5 ? 1 : 2;
    const loserReg = (winner === 1 ? m.p2RegId : m.p1RegId)!;
    const isGrandFinal = m.side === "grand";
    if (!isGrandFinal && r < (o.withdrawRate ?? 0)) {
      matchState[m.id] = { ...matchState[m.id], status: "completed", winner, result: "withdraw", completedAt: iso() };
      withdrawn.add(loserReg);
      withdrawals++;
    } else {
      const result = r < (o.withdrawRate ?? 0) + (o.forfeitRate ?? 0) ? "forfeit" : "normal";
      matchState[m.id] = { ...matchState[m.id], status: "completed", winner, result, completedAt: iso(), p1Score: winner === 1 ? 5 : 2, p2Score: winner === 2 ? 5 : 2 };
      losses.set(loserReg, (losses.get(loserReg) ?? 0) + 1);
    }
    played++;
  }
};

const SIZES = [2, 3, 4, 5, 7, 8, 9, 11, 12, 16, 17, 23, 24, 31, 32, 33, 48, 64];

test("single elimination: every size completes with one champion, N-1 matches, N-1 eliminated", () => {
  let runs = 0;
  for (const n of SIZES)
    for (const tables of [1, 2, 3, 8, 40])
      for (const mode of MODES) {
        const r = runTournament({ n, dbl: false, tables, mode, seed: n * 1000 + tables * 10 + MODES.indexOf(mode) });
        assert.ok(r.champion != null, `no champion n=${n}`);
        assert.equal(r.played, n - 1, `SE n=${n}: expected ${n - 1} matches, played ${r.played}`);
        assert.equal(r.eliminated.length, n - 1, `SE n=${n}: eliminated ${r.eliminated.length}`);
        assert.ok(!r.eliminated.includes(r.champion!), "champion eliminated");
        assert.ok(r.maxConcurrent <= tables, `more live matches (${r.maxConcurrent}) than tables (${tables})`);
        runs++;
      }
  assert.ok(runs >= 400, `ran ${runs}`);
});

test("double elimination: 2N-2 or 2N-1 (reset) matches, eliminated only on the second loss, one champion", () => {
  let runs = 0;
  let resets = 0;
  for (const n of SIZES)
    for (const tables of [1, 2, 4, 40])
      for (const mode of MODES) {
        const r = runTournament({ n, dbl: true, tables, mode, seed: 77 + n * 1000 + tables * 10 + MODES.indexOf(mode) });
        assert.ok(r.champion != null);
        if (n === 2) {
          // 2 entrants in an 8 bracket: WB final is the only WB match; the loser drops to an LB
          // with nobody else, so the GF is the rematch (2 or 3 matches).
          assert.ok(r.played === 2 || r.played === 3, `DE n=2 played ${r.played}`);
        } else {
          assert.ok(r.played === 2 * n - 2 || r.played === 2 * n - 1, `DE n=${n}: played ${r.played}, expected ${2 * n - 2}|${2 * n - 1}`);
        }
        if (r.played === 2 * n - 1) resets++;
        assert.equal(r.eliminated.length, n - 1, `DE n=${n}: eliminated ${r.eliminated.length}`);
        assert.ok(!r.eliminated.includes(r.champion!));
        runs++;
      }
  assert.ok(runs >= 300 && resets > 0, `runs=${runs} resets=${resets}`);
});

test("forfeits behave as ordinary losses; withdrawals remove the player without a drop (no deadlock, one champion)", () => {
  for (const dbl of [false, true])
    for (const n of [5, 8, 13, 16, 27, 32])
      for (let seed = 1; seed <= 12; seed++) {
        const r = runTournament({ n, dbl, tables: 3, mode: "balanced", seed: seed * 31 + n, withdrawRate: 0.12, forfeitRate: 0.1 });
        assert.ok(r.champion != null, `no champion dbl=${dbl} n=${n} seed=${seed}`);
        if (!dbl) assert.equal(r.played, n - 1, `SE with withdrawals still N-1 matches`);
        else assert.ok(r.played <= 2 * n - 1 && r.played >= n - 1, `DE played ${r.played}`);
        // Dashboard "Remaining" = entrants - eliminated must reach exactly 1 (the champion), so
        // every withdrawal — including a double-elim winners-side one — counts as eliminated.
        assert.equal(r.eliminated.length, n - 1, `dbl=${dbl} n=${n} seed=${seed}: eliminated ${r.eliminated.length} (withdrawals ${r.withdrawals})`);
      }
});

test("unavailable tables are never planned and a single available table still finishes the event", () => {
  for (const dbl of [false, true]) {
    const r = runTournament({ n: 16, dbl, tables: 4, unavailable: [1, 2, 3], mode: "balanced", seed: 5 });
    assert.ok(r.champion != null);
    assert.equal(r.maxConcurrent, 1);
  }
});

test("standings: every entrant placed once (no withdrawals), unique 1st/2nd, champion is 1st", () => {
  for (const dbl of [false, true])
    for (const n of [4, 5, 7, 8, 11, 16, 17, 32]) {
      const r = runTournament({ n, dbl, tables: 4, mode: "balanced", seed: 900 + n });
      const st = computeStandings(r.matches);
      const keys = st.map((e) => e.key);
      assert.equal(new Set(keys).size, keys.length, `duplicate standing rows dbl=${dbl} n=${n}`);
      assert.equal(st.length, n, `standings rows ${st.length} != ${n} dbl=${dbl}`);
      assert.equal(st.filter((e) => e.place === 1).length, 1);
      assert.equal(st.filter((e) => e.place === 2).length, 1);
      assert.equal(st[0].key, `r${r.champion}`);
      // Wins/losses reconcile: total wins == total losses == matches played.
      const w = st.reduce((a, e) => a + e.wins, 0);
      const l = st.reduce((a, e) => a + e.losses, 0);
      assert.equal(w, r.played);
      assert.equal(l, r.played);
    }
});

test("double elim: a winners-side withdrawal is eliminated (no drop), an ordinary WB loss is not", () => {
  const seeds = Array.from({ length: 8 }, (_, i) => ({ registrationId: i + 1, name: `P${i + 1}`, fargo: 500 }));
  const bracket: any = { graph: buildBracketGraph(8, true), seeds };
  const live = (ms: Record<string, MatchLiveState>) => buildLiveMatches(bracket, ms, [], "9-ball", CFG);
  // W1M1 = seeds[0] vs seeds[1]
  assert.deepEqual(computeEliminatedRegIds(live({ W1M1: { status: "completed", winner: 1, result: "normal" } })), []);
  assert.deepEqual(computeEliminatedRegIds(live({ W1M1: { status: "completed", winner: 1, result: "withdraw" } })), [2]);
  // ...and the losers-bracket slot the withdrawn player would have dropped into stays empty.
  const l1 = live({ W1M1: { status: "completed", winner: 1, result: "withdraw" }, W1M2: { status: "completed", winner: 1 } }).find((m) => m.id === "L1M1")!;
  assert.equal(l1.bye, true);
});

test("double elim standings: nobody is crowned while a needed grand-final reset is unplayed", () => {
  const seeds = Array.from({ length: 4 }, (_, i) => ({ registrationId: i + 1, name: `P${i + 1}`, fargo: 500 }));
  const bracket: any = { graph: buildBracketGraph(8, true), seeds: [seeds[0], null, seeds[1], null, seeds[2], null, seeds[3], null] };
  const ms: Record<string, MatchLiveState> = {};
  for (let k = 0; k < 50; k++) {
    const m = buildLiveMatches(bracket, ms, [], "9-ball", CFG).find((x) => !x.pending && !x.bye && !x.empty && x.status !== "completed");
    if (!m || m.id === "GF") break;
    ms[m.id] = { status: "completed", winner: 1 };
  }
  ms.GF = { status: "completed", winner: 2 }; // losers finalist wins GF → reset needed
  let st = computeStandings(buildLiveMatches(bracket, ms, [], "9-ball", CFG));
  assert.equal(st.filter((e) => e.place <= 2).length, 0, "no 1st/2nd before GF2");
  ms.GF2 = { status: "completed", winner: 2 }; // the winners finalist (now slot 2) wins the reset
  st = computeStandings(buildLiveMatches(bracket, ms, [], "9-ball", CFG));
  const gf = buildLiveMatches(bracket, ms, [], "9-ball", CFG).find((m) => m.id === "GF")!;
  assert.equal(st.find((e) => e.place === 1)?.key, `r${gf.p1RegId}`, "winners finalist champion after the reset");
  assert.equal(st.find((e) => e.place === 2)?.key, `r${gf.p2RegId}`);
  // Without a reset (winners finalist wins GF) the GF decides.
  const ms2 = { ...ms, GF: { status: "completed" as const, winner: 1 as const } };
  delete (ms2 as any).GF2;
  st = computeStandings(buildLiveMatches(bracket, ms2, [], "9-ball", CFG));
  assert.equal(st.find((e) => e.place === 1)?.key, `r${gf.p1RegId}`);
});

test("standings place labels never run past the field size when byes pad the bracket", () => {
  for (const dbl of [false, true])
    for (const n of [3, 5, 9, 17, 33]) {
      const r = runTournament({ n, dbl, tables: 4, mode: "balanced", seed: 300 + n });
      for (const e of computeStandings(r.matches)) {
        const hi = Number((e.placeLabel.match(/(\d+)(st|nd|rd|th)$/) ?? [])[1]);
        assert.ok(hi <= n, `dbl=${dbl} n=${n}: label ${e.placeLabel} exceeds field`);
        assert.ok(e.place <= n);
      }
    }
});

test("Players Remaining = drawn field minus eliminated (TD dashboard + spectator share it)", () => {
  const seeds = Array.from({ length: 8 }, (_, i) => (i < 6 ? { registrationId: i + 1, name: `P${i + 1}`, fargo: 500 } : null));
  const bracket: any = { graph: buildBracketGraph(8, true), seeds };
  assert.equal(elimPlayersRemaining(null, []), null, "no draw → caller keeps its own count");
  assert.equal(elimPlayersRemaining(bracket, buildLiveMatches(bracket, {}, [], "9-ball", CFG)), 6);
  const r = runTournament({ n: 13, dbl: true, tables: 3, mode: "balanced", seed: 4711 });
  const drawn: any = { seeds: Array.from(new Set(r.matches.flatMap((m) => [m.p1RegId, m.p2RegId]).filter((x): x is number => x != null))).map((id) => ({ registrationId: id })) };
  assert.equal(elimPlayersRemaining(drawn, r.matches), 1, "only the champion remains at the end");
});
