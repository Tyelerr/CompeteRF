// src/utils/__tests__/elim-correction-cascade.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-correction-cascade.test.ts
//
// NOTE (2026-10-02): the SERVER now clears downstream results whose players changed
// (elim_live_apply correction cascade, 20261018120000 — supabase/tests/elim_recovery_foundation.test.ts).
// These tests pin the raw client RESOLVER only (what an un-cascaded matchState would display).
//
// CHARACTERIZATION of result corrections (no new cascade rule): winners are stored as SLOTS,
// so changing an earlier result re-seats players downstream and any downstream result follows
// its slot. These tests pin today's behavior for each scenario and the invariants that must
// hold regardless (deterministic resolution, nobody in two live matches, one champion), and
// exercise correctionImpact — the report a confirmation/blocking UI would use.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { MatchLiveState } from "../../models/types/tournament-settings.types";
import { buildBracketGraph } from "../bracket.double";
import { RaceConfig } from "../bracket.utils";
import { buildLiveMatches, computeEliminatedRegIds } from "../match.utils";
import { computeStandings } from "../tournament.stats";
import { correctionImpact, downstreamMatchIds } from "../bracket.correction";

const CFG: RaceConfig = { mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null } as any;
const seeds = (n: number) => Array.from({ length: n }, (_, i) => ({ registrationId: i + 1, name: `P${i + 1}`, fargo: 500 }));
const W = (w: 1 | 2): MatchLiveState => ({ status: "completed", winner: w, result: "normal" });
const who = (b: any, ms: Record<string, MatchLiveState>, id: string) => {
  const m = buildLiveMatches(b, ms, [], "9-ball", CFG).find((x) => x.id === id)!;
  return { p1: m.p1RegId, p2: m.p2RegId, winner: m.winner == null ? null : m.winner === 1 ? m.p1RegId : m.p2RegId };
};
const invariants = (b: any, ms: Record<string, MatchLiveState>) => {
  const live = buildLiveMatches(b, ms, [], "9-ball", CFG);
  const again = buildLiveMatches(b, ms, [], "9-ball", CFG);
  assert.deepEqual(live.map((m) => [m.p1RegId, m.p2RegId]), again.map((m) => [m.p1RegId, m.p2RegId]), "deterministic");
  const st = computeStandings(live);
  assert.ok(st.filter((e) => e.place === 1).length <= 1, "at most one champion");
  assert.equal(new Set(st.map((e) => e.key)).size, st.length, "standings unique");
  return { live, st, elim: computeEliminatedRegIds(live) };
};

test("SE: change a semifinal winner AFTER the final was played → the final's result moves to the other semifinalist", () => {
  const b: any = { graph: buildBracketGraph(8, false), seeds: seeds(8) };
  const ms: Record<string, MatchLiveState> = { W1M1: W(1), W1M2: W(1), W1M3: W(1), W1M4: W(1), W2M1: W(1), W2M2: W(1), W3M1: W(1) };
  const before = who(b, ms, "W3M1");
  assert.equal(before.winner, 1, "P1 champion");
  assert.deepEqual(correctionImpact(b.graph, ms, "W2M1"), { affected: ["W3M1"], decided: ["W3M1"] });
  const fixed = { ...ms, W2M1: W(2) }; // SF1 really won by P3
  const after = who(b, fixed, "W3M1");
  assert.equal(after.p1, 3, "P3 now sits in the final");
  assert.equal(after.winner, 3, "and is credited with a final P1 actually played (slot semantics)");
  const { st } = invariants(b, fixed);
  assert.equal(st.find((e) => e.place === 1)?.key, "r3", "standings/payouts follow the moved result");
});

test("SE: change a quarterfinal winner after later rounds → every downstream decided match is reported", () => {
  const b: any = { graph: buildBracketGraph(8, false), seeds: seeds(8) };
  const ms: Record<string, MatchLiveState> = { W1M1: W(1), W1M2: W(1), W2M1: W(2), W3M1: { status: "in_progress", tableId: 1 } as any };
  assert.deepEqual(correctionImpact(b.graph, ms, "W1M1"), { affected: ["W2M1", "W3M1"], decided: ["W2M1"] });
  invariants(b, { ...ms, W1M1: W(2) });
});

test("DE: change a winners-side result after the loser already played in the losers bracket", () => {
  const b: any = { graph: buildBracketGraph(8, true), seeds: seeds(8) };
  const ms: Record<string, MatchLiveState> = { W1M1: W(1), W1M2: W(1), L1M1: W(1) }; // P2 (W1M1 loser) beat P4 in L1M1
  assert.equal(who(b, ms, "L1M1").winner, 2);
  const impact = correctionImpact(b.graph, ms, "W1M1");
  assert.ok(impact.decided.includes("L1M1"), "the losers-bracket result is reported");
  const fixed = { ...ms, W1M1: W(2) }; // P2 actually won W1M1
  assert.equal(who(b, fixed, "L1M1").p1, 1, "P1 now drops into L1M1…");
  assert.equal(who(b, fixed, "L1M1").winner, 1, "…and inherits P2's losers-bracket win (slot semantics)");
  invariants(b, fixed);
});

test("DE: change a losers-side result after downstream matches → reported; elimination follows the slot", () => {
  const b: any = { graph: buildBracketGraph(8, true), seeds: seeds(8) };
  const ms: Record<string, MatchLiveState> = { W1M1: W(1), W1M2: W(1), W1M3: W(1), W1M4: W(1), L1M1: W(1), L1M2: W(1), W2M1: W(1), W2M2: W(1), L2M1: W(1) };
  const imp = correctionImpact(b.graph, ms, "L1M1");
  assert.ok(imp.decided.includes("L2M1"));
  const before = invariants(b, ms).elim;
  const after = invariants(b, { ...ms, L1M1: W(2) }).elim;
  assert.notDeepEqual(before.sort(), after.sort(), "a different player is now eliminated");
});

test("DE: change the GF winner after GF2 exists → GF2 disappears (skipped) or its result re-attaches", () => {
  const b: any = { graph: buildBracketGraph(4, true), seeds: seeds(4) };
  const base: Record<string, MatchLiveState> = { W1M1: W(1), W1M2: W(1), W2M1: W(1), L1M1: W(1), L2M1: W(1) };
  const reset = { ...base, GF: W(2), GF2: W(1) }; // LB finalist won GF and the reset
  assert.deepEqual(correctionImpact(b.graph, reset, "GF"), { affected: ["GF2"], decided: ["GF2"] });
  const champBefore = invariants(b, reset).st.find((e) => e.place === 1)?.key;
  const corrected = { ...reset, GF: W(1) }; // the WB finalist actually won GF → no reset
  const { live, st } = invariants(b, corrected);
  assert.equal(live.some((m) => m.id === "GF2"), false, "GF2 no longer exists (skipped); its stale state is ignored");
  assert.notEqual(st.find((e) => e.place === 1)?.key, champBefore, "the champion changes");
});

test("downstream walk covers winner AND loser links transitively", () => {
  const g = buildBracketGraph(8, true);
  const d = downstreamMatchIds(g, "W1M1");
  for (const id of ["W2M1", "W3M1", "L1M1", "GF"]) assert.ok(d.includes(id), id);
  assert.equal(new Set(d).size, d.length);
});
