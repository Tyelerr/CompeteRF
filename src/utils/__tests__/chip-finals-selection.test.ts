// src/utils/__tests__/chip-finals-selection.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-finals-selection.test.ts
// Finals table selection. Once the field is down to two, the finals are seated on a table the
// TD CHOOSES when several are usable (chipFinalsState "select" → seatFinals); automatically only
// when there is no choice (exactly one eligible table, or between finals games on the finals
// table); never on a locked / closing / inactive / busy table; never half-seated when no table
// is usable ("no_table"). Singles and Scotch Doubles; survives a reload.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  beginShuffle,
  chipFinalsState,
  closeTables,
  emptyChipState,
  finalizeReshuffle,
  finalsEligibleTables,
  newId,
  recordWinner,
  returnActiveMatchesToQueue,
  seatFinals,
  setAllTablesLocked,
  setTableLocked,
  settleChipState,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
} from "../../models/services/chip.engine";
import { healLoadedChip, loadRepairChanged } from "../../models/services/chip.load-heal";
import { ChipEntry, ChipFormat, ChipState } from "../../models/types/chip.types";

const entry = (name: string, doubles: boolean, chips = 1): ChipEntry =>
  ({
    id: newId("e"), p1Name: `${name}1`, p1Fargo: 500, p1Phone: "",
    p2Name: doubles ? `${name}2` : "", p2Fargo: doubles ? 500 : null, teamFargo: doubles ? 1000 : 500,
    startChips: 0, chips, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
const P = settleChipState;
const tick = () => new Promise((r) => setTimeout(r, 3));

// n teams, `chips` each, `tables` tables, opening matches started.
const live = (format: ChipFormat, n: number, tables: number, chips = 1): ChipState => {
  const doubles = format === "scotch_doubles";
  let s = emptyChipState(format);
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips }] } };
  s = { ...s, entries: "ABCDEFGH".slice(0, n).split("").map((c) => entry(c, doubles)) };
  s = addTables(s, tables);
  return P(startAllMatches(startChipTournament(s)));
};
// 3 teams → one result leaves the final two. Optional hook runs before the deciding result.
const toFinalTwo = (s0: ChipState, before?: (s: ChipState, tableId: string) => ChipState) => {
  let s = s0;
  const t = s.tables.find((x) => x.matchId)!;
  if (before) s = P(before(s, t.id));
  const m = s.matches.find((x) => x.id === s.tables.find((y) => y.id === t.id)!.matchId)!;
  s = P(recordWinner(s, m.id, m.aId));
  assert.equal(s.entries.filter((e) => e.status !== "eliminated").length, 2, "final two");
  return { s, deciderTable: t.id, winner: m.aId };
};
const finalists = (s: ChipState) => s.entries.filter((e) => e.status !== "eliminated").map((e) => e.id);
const seatsOf = (s: ChipState, id: string) =>
  s.tables.filter((t) => t.holderId === id || t.pendingChallengerId === id).map((t) => t.id);
const assertNoPartialSeat = (s: ChipState) => {
  assert.ok(!s.tables.some((t) => t.pendingChallengerId), "nobody seated as a finals challenger");
  for (const id of finalists(s)) assert.ok(seatsOf(s, id).length <= 1, "never on two tables");
};

for (const format of ["singles", "scotch_doubles"] as ChipFormat[]) {
  test(`${format}: several eligible tables → the TD must choose (nothing auto-seated)`, () => {
    const { s } = toFinalTwo(live(format, 3, 3));
    const st = chipFinalsState(s);
    assert.equal(st.kind, "select");
    assert.equal(st.kind === "select" && st.tableIds.length, 3, "all three tables offered");
    assertNoPartialSeat(s);
    assert.equal(P(s), s, "the settle never picks a table on its own");
  });

  test(`${format}: the selected table gets both finalists; other tables hold neither`, () => {
    const { s, deciderTable } = toFinalTwo(live(format, 3, 3));
    const pick = s.tables.find((t) => t.id !== deciderTable)!.id;
    const seated = P(seatFinals(s, pick));
    const ft = seated.tables.find((t) => t.id === pick)!;
    assert.deepEqual(new Set([ft.holderId, ft.pendingChallengerId]), new Set(finalists(s)));
    for (const t of seated.tables) {
      if (t.id === pick) continue;
      assert.ok(!finalists(s).includes(t.holderId ?? "") && !finalists(s).includes(t.pendingChallengerId ?? ""));
    }
    assert.deepEqual(chipFinalsState(seated), { kind: "seated", tableId: pick });
    assert.equal(seated.queue.length, 0);
    assert.ok(seated.events.some((e) => e.payload?.act === "finals" && e.payload?.tableId === pick));
    // Start Match works normally from here.
    const started = P(startPendingMatch(seated, pick));
    assert.equal(chipFinalsState(started).kind, "live");
  });

  test(`${format}: a locked / closing / inactive table is never used or offered`, () => {
    let base = live(format, 3, 4);
    const [, t2, t3, t4] = base.tables;
    base = P(setTableLocked(base, t2.id, true));
    base = P(closeTables(base, [t3.id])); // empty → inactive
    const { s } = toFinalTwo(base);
    const offered = finalsEligibleTables(s).map((t) => t.id);
    assert.ok(!offered.includes(t2.id) && !offered.includes(t3.id));
    assert.equal(seatFinals(s, t2.id), s, "locked table refused");
    assert.equal(seatFinals(s, t3.id), s, "inactive table refused");
    assert.ok(offered.includes(t4.id));
    assert.equal(s.tables.find((t) => t.id === t2.id)!.locked, true, "lock untouched");
  });

  test(`${format}: zero eligible tables → nothing is half-seated; the TD is told`, () => {
    const { s } = toFinalTwo(live(format, 3, 2), (c) => setAllTablesLocked(c, true));
    assert.equal(chipFinalsState(s).kind, "no_table");
    assertNoPartialSeat(s);
    for (const t of s.tables) assert.equal(seatFinals(s, t.id), s);
    // Unlocking makes tables eligible again (then the TD chooses between them).
    const unlocked = P(setAllTablesLocked(s, false));
    assert.equal(chipFinalsState(unlocked).kind, "select");
  });

  test(`${format}: exactly ONE eligible table → seated there automatically`, () => {
    const { s, deciderTable } = toFinalTwo(live(format, 3, 2), (c, tid) =>
      setTableLocked(c, c.tables.find((t) => t.id !== tid)!.id, true),
    );
    const st = chipFinalsState(s);
    assert.deepEqual(st, { kind: "seated", tableId: deciderTable });
    // One-table event: same.
    const one = toFinalTwo(live(format, 3, 1)).s;
    assert.equal(chipFinalsState(one).kind, "seated");
  });

  test(`${format}: reload after the finals table was chosen keeps that table (no save needed)`, () => {
    const { s, deciderTable } = toFinalTwo(live(format, 3, 3));
    const pick = s.tables.find((t) => t.id !== deciderTable)!.id;
    const seated = P(seatFinals(s, pick));
    const cloud: ChipState = JSON.parse(JSON.stringify(seated));
    const healed = healLoadedChip(cloud);
    assert.deepEqual(chipFinalsState(healed), { kind: "seated", tableId: pick });
    assert.equal(loadRepairChanged(cloud, healed), false, "an unchanged load, no save");
    // And a reload while still choosing stays "select" (never auto-picks on load).
    const pendingCloud: ChipState = JSON.parse(JSON.stringify(s));
    assert.equal(chipFinalsState(healLoadedChip(pendingCloud)).kind, "select");
  });

  test(`${format}: between finals games the finals continue on the finals table (no re-prompt)`, async () => {
    // 3 teams with 2 chips: the finals take more than one game.
    let s = live(format, 3, 3, 2);
    // Play until two remain.
    for (let i = 0; i < 20 && s.entries.filter((e) => e.status !== "eliminated").length > 2; i++) {
      const fin = chipFinalsState(s);
      if (fin.kind === "select") s = P(seatFinals(s, fin.tableIds[0]));
      const t = s.tables.find((x) => x.matchId) ?? s.tables.find((x) => x.holderId && x.pendingChallengerId);
      if (!t) break;
      if (!t.matchId) s = P(startPendingMatch(s, t.id));
      await tick();
      const m = s.matches.find((x) => x.status === "in_progress")!;
      s = P(recordWinner(s, m.id, m.aId));
      await tick();
    }
    let fin = chipFinalsState(s);
    if (fin.kind === "select") s = P(seatFinals(s, fin.tableIds[fin.tableIds.length - 1]));
    fin = chipFinalsState(s);
    assert.equal(fin.kind, "seated");
    const finalsTable = fin.kind === "seated" ? fin.tableId : "";
    s = P(startPendingMatch(s, finalsTable));
    await tick();
    const m = s.matches.find((x) => x.status === "in_progress")!;
    const loser = m.bId;
    s = P(recordWinner(s, m.id, m.aId));
    if (s.entries.find((e) => e.id === loser)!.status !== "eliminated") {
      assert.deepEqual(chipFinalsState(s), { kind: "seated", tableId: finalsTable }, "next finals game, same table");
    } else {
      assert.ok(s.winnerId, "finals decided");
    }
  });

  test(`${format}: finals reached during a Shuffle round — round/drain state cleared, TD chooses`, async () => {
    let s = live(format, 3, 3, 2);
    s = P(returnActiveMatchesToQueue(s));
    s = P(beginShuffle(s));
    s = P(finalizeReshuffle(s, null));
    assert.equal(s.shuffleRound, true);
    s = P(startAllMatches(s));
    await tick();
    // Knock a team out with results until two remain.
    for (let i = 0; i < 20 && s.entries.filter((e) => e.status !== "eliminated").length > 2; i++) {
      const t = s.tables.find((x) => x.matchId) ?? s.tables.find((x) => x.holderId && x.pendingChallengerId);
      if (!t) {
        if (s.shuffleReady) s = P(finalizeReshuffle(s, null));
        s = P(startAllMatches(s));
        continue;
      }
      if (!t.matchId) s = P(startPendingMatch(s, t.id));
      await tick();
      const m = s.matches.find((x) => x.status === "in_progress")!;
      s = P(recordWinner(s, m.id, m.aId));
      await tick();
    }
    assert.equal(s.entries.filter((e) => e.status !== "eliminated").length, 2);
    assert.equal(!!s.shuffleRound || !!s.reshufflePending || !!s.shuffleReady, false, "finals supersede Shuffle");
    assert.ok(["select", "seated"].includes(chipFinalsState(s).kind));
    for (const id of finalists(s)) assert.ok(seatsOf(s, id).length <= 1);
  });
}
