// src/utils/__tests__/chip-round-idle-table.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-round-idle-table.test.ts
// Table-card display state during a Shuffle round (engine isShuffleRoundIdleTable, alongside
// canAssignNextTeam): an EMPTY table that cannot be filled because fewer than two current-round
// teams are owed a turn shows "Waiting for Next Round" (not "No team assigned" / no button).
// Eligibility is TEAM-level — one Chip entry = one singles player OR one Scotch Doubles pair —
// so both formats must behave identically.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  assignFinals,
  beginShuffle,
  canAssignNextTeam,
  clearTable,
  emptyChipState,
  finalizeReshuffle,
  isShuffleRoundIdleTable,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  reconcileShuffleRound,
  returnActiveMatchesToQueue,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipFormat, ChipState } from "../../models/types/chip.types";

const entry = (name: string, doubles: boolean): ChipEntry =>
  ({
    id: newId("e"), p1Name: `${name}1`, p1Fargo: 500, p1Phone: "",
    p2Name: doubles ? `${name}2` : "", p2Fargo: doubles ? 500 : null, teamFargo: doubles ? 1000 : 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileShuffleRound(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s))))));
const live = (format: ChipFormat, n = 8, tables = 2): ChipState => {
  const doubles = format === "scotch_doubles";
  let s = emptyChipState(format);
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGHIJ".slice(0, n).split("").map((c) => entry(c, doubles)) };
  s = addTables(s, tables);
  return pipeline(startAllMatches(startChipTournament(s)));
};
// Active Shuffle round with one table cleared (both teams back, owed a turn).
const roundWithEmptyTable = (format: ChipFormat) => {
  let s = live(format);
  s = pipeline(returnActiveMatchesToQueue(s));
  s = pipeline(beginShuffle(s));
  s = pipeline(finalizeReshuffle(s, null));
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  s = pipeline(clearTable(s, t.id, "end"));
  return { s, t };
};
// Leave exactly `k` round-eligible TEAMS queued (the rest already played this round).
const withEligible = (s: ChipState, k: number): ChipState => {
  const owed = s.queue.filter((id) => s.roundRemaining!.includes(id)).slice(0, k);
  return { ...s, roundRemaining: owed };
};

for (const format of ["singles", "scotch_doubles"] as ChipFormat[]) {
  test(`${format}: empty table, 3 or 2 eligible teams → Assign Next Match (not idle)`, () => {
    const { s, t } = roundWithEmptyTable(format);
    for (const k of [3, 2]) {
      const st = withEligible(s, k);
      assert.equal(canAssignNextTeam(st, t.id), true, `${k} eligible → button`);
      assert.equal(isShuffleRoundIdleTable(st, t.id), false);
    }
  });

  test(`${format}: empty table, only 1 eligible team → Waiting for Next Round`, () => {
    const { s, t } = roundWithEmptyTable(format);
    const one = withEligible(s, 1);
    assert.ok(one.queue.length >= 2, "more teams are queued, but only one is owed a turn");
    assert.equal(canAssignNextTeam(one, t.id), false);
    assert.equal(isShuffleRoundIdleTable(one, t.id), true);
    const none = withEligible(s, 0);
    assert.equal(isShuffleRoundIdleTable(none, t.id), true, "nobody owed a turn → idle too");
  });

  test(`${format}: one team seated + one eligible challenger → Assign Next Team, never idle`, () => {
    const { s, t } = roundWithEmptyTable(format);
    const one = withEligible(s, 1);
    const holderId = one.queue.find((id) => !one.roundRemaining!.includes(id))!; // a team that played
    const seated: ChipState = {
      ...one,
      queue: one.queue.filter((id) => id !== holderId),
      tables: one.tables.map((x) => (x.id === t.id ? { ...x, holderId } : x)),
      entries: one.entries.map((e) => (e.id === holderId ? { ...e, status: "playing" as const, tableId: t.id } : e)),
    };
    assert.equal(canAssignNextTeam(seated, t.id), true);
    assert.equal(isShuffleRoundIdleTable(seated, t.id), false, "a seated table is never 'next round'");
  });

  test(`${format}: next round starts → the empty table is assignable again`, () => {
    const { s, t } = roundWithEmptyTable(format);
    const one = withEligible(s, 1);
    assert.equal(isShuffleRoundIdleTable(one, t.id), true);
    // a new round owes every surviving team a turn again
    const nextRound: ChipState = { ...one, roundRemaining: [...one.queue] };
    assert.equal(canAssignNextTeam(nextRound, t.id), true);
    assert.equal(isShuffleRoundIdleTable(nextRound, t.id), false);
  });

  test(`${format}: outside an active round the existing wording is kept (never idle)`, () => {
    const s = live(format);
    const t = s.tables.find((x) => x.matchId)!;
    const cleared = pipeline(clearTable(s, t.id, "end"));
    const oneQueued: ChipState = { ...cleared, queue: cleared.queue.slice(0, 1) };
    assert.equal(canAssignNextTeam(oneQueued, t.id), false);
    assert.equal(isShuffleRoundIdleTable(oneQueued, t.id), false, "normal play → 'No team assigned'");
    // draining for a reshuffle → "Waiting for Shuffle", not "next round"
    const { s: round, t: rt } = roundWithEmptyTable(format);
    assert.equal(isShuffleRoundIdleTable({ ...withEligible(round, 1), reshufflePending: true }, rt.id), false);
  });
}

test("Scotch Doubles counts TEAMS, not partners: one team = one eligible entry", () => {
  const { s, t } = roundWithEmptyTable("scotch_doubles");
  const one = withEligible(s, 1);
  const team = one.entries.find((e) => e.id === one.roundRemaining![0])!;
  assert.ok(team.p1Name && team.p2Name, "the one eligible entry is a two-person team");
  assert.equal(canAssignNextTeam(one, t.id), false, "two partners of one team never form a match");
  assert.equal(isShuffleRoundIdleTable(one, t.id), true);
});
