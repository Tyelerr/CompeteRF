// src/utils/__tests__/chip-finals-seating.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-finals-seating.test.ts
// Invariant: ONE LIVE ENTRY (a singles player OR a Scotch Doubles team) → AT MOST ONE TABLE.
// Regression: when the field drops to two, assignFinals seats the finals on a usable table —
// but a finalist still holding a LOCKED (or closing/inactive) table kept that seat too, so the
// same entry sat on two tables at once. Covers singles + Scotch Doubles, locked + unlocked old
// table, one-table and multi-table events, and winner-stays through the finals match.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  emptyChipState,
  newId,
  chipFinalsState,
  recordWinner,
  seatFinals,
  setTableLocked,
  startAllMatches,
  startPendingMatch,
  startChipTournament,
} from "../../models/services/chip.engine";
import { healLoadedChip } from "../../models/services/chip.load-heal";
import { ChipEntry, ChipFormat, ChipState } from "../../models/types/chip.types";

const entry = (name: string, doubles: boolean): ChipEntry =>
  ({
    id: newId("e"), p1Name: `${name}1`, p1Fargo: 500, p1Phone: "",
    p2Name: doubles ? `${name}2` : "", p2Fargo: doubles ? 500 : null, teamFargo: doubles ? 1000 : 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;

// The VM's update() pipeline after every action (the same chain the load self-heal runs).
const pipeline = healLoadedChip;

// n entries with ONE chip each (every loss eliminates), `tables` tables, all matches started.
const live = (format: ChipFormat, n: number, tables: number): ChipState => {
  const doubles = format === "scotch_doubles";
  let s = emptyChipState(format);
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 1 }] } };
  s = { ...s, entries: "ABCDEFGH".slice(0, n).split("").map((c) => entry(c, doubles)) };
  s = addTables(s, tables);
  return pipeline(startAllMatches(startChipTournament(s)));
};

// Every table an entry occupies: holder, pending challenger, or a side of the live match.
const seatsOf = (s: ChipState, entryId: string): string[] =>
  s.tables
    .filter((t) => {
      const m = t.matchId ? s.matches.find((x) => x.id === t.matchId) : null;
      return t.holderId === entryId || t.pendingChallengerId === entryId || m?.aId === entryId || m?.bId === entryId;
    })
    .map((t) => t.label);

const assertOneTablePerEntry = (s: ChipState, where: string) => {
  for (const e of s.entries) {
    const seats = seatsOf(s, e.id);
    const who = `${e.p1Name}${e.p2Name ? "/" + e.p2Name : ""}`;
    assert.ok(seats.length <= 1, `${where}: ${who} seated on ${seats.join(" + ")}`);
    if (seats.length) assert.ok(!s.queue.includes(e.id), `${where}: ${who} seated AND queued`);
  }
};

const alive = (s: ChipState) => s.entries.filter((e) => e.status !== "eliminated");
const finalsTable = (s: ChipState) => s.tables.find((t) => t.holderId && t.pendingChallengerId && !t.matchId);
const tableOfMatch = (s: ChipState) => s.tables.find((t) => t.matchId)!;
const matchOn = (s: ChipState, tableId: string) =>
  s.matches.find((m) => m.id === s.tables.find((t) => t.id === tableId)!.matchId)!;

for (const format of ["singles", "scotch_doubles"] as ChipFormat[]) {
  test(`${format}: finalist on a LOCKED old table is not also seated for the finals (2 tables)`, () => {
    // 3 teams, 2 tables: T1 plays, the 3rd team waits. Lock T1, then its match decides the field.
    let s = live(format, 3, 2);
    const t1 = tableOfMatch(s);
    const m = matchOn(s, t1.id);
    s = pipeline(setTableLocked(s, t1.id, true));
    s = pipeline(recordWinner(s, m.id, m.aId));
    assert.equal(alive(s).length, 2);
    assertOneTablePerEntry(s, "after the deciding match");
    const ft = finalsTable(s);
    assert.ok(ft, "finals seated on the free table");
    assert.notEqual(ft!.id, t1.id, "never on the locked table");
    const locked = s.tables.find((t) => t.id === t1.id)!;
    assert.equal(locked.holderId ?? null, null, "the winner's seat on the locked table was vacated");
    assert.equal(locked.status, "open");
    assert.equal(locked.locked, true, "the TD's lock is kept");
    assert.deepEqual(new Set([ft!.holderId, ft!.pendingChallengerId]), new Set(alive(s).map((e) => e.id)));
    // Re-running the pipeline (a reload) is stable and still one seat each.
    const again = pipeline(s);
    assertOneTablePerEntry(again, "after a reload");
    assert.equal(finalsTable(again)!.id, ft!.id);
  });

  test(`${format}: UNLOCKED old table + a free table — the TD picks; either choice seats once`, () => {
    let s = live(format, 3, 2);
    const t1 = tableOfMatch(s);
    const m = matchOn(s, t1.id);
    s = pipeline(recordWinner(s, m.id, m.aId));
    assertOneTablePerEntry(s, "after the deciding match");
    assert.equal(finalsTable(s), undefined, "two usable tables → no silent choice");
    const st = chipFinalsState(s);
    assert.equal(st.kind, "select");
    // Keep the winner's own table: the winner stays holder there.
    const onOwn = pipeline(seatFinals(s, t1.id));
    assert.equal(finalsTable(onOwn)!.id, t1.id);
    assert.equal(finalsTable(onOwn)!.holderId, m.aId, "the winner is the holder");
    assertOneTablePerEntry(onOwn, "finals on the winner's table");
    // Or the other table: the winner leaves Table 1 (never on two tables).
    const other = s.tables.find((t) => t.id !== t1.id)!;
    const moved = pipeline(seatFinals(s, other.id));
    assert.equal(finalsTable(moved)!.id, other.id);
    assert.equal(moved.tables.find((t) => t.id === t1.id)!.holderId ?? null, null);
    assertOneTablePerEntry(moved, "finals moved to the other table");
  });

  test(`${format}: ONE table, locked — finals wait for a table, no duplicate seat`, () => {
    let s = live(format, 3, 1);
    const t1 = tableOfMatch(s);
    const m = matchOn(s, t1.id);
    s = pipeline(setTableLocked(s, t1.id, true));
    s = pipeline(recordWinner(s, m.id, m.aId));
    assert.equal(alive(s).length, 2);
    assertOneTablePerEntry(s, "one locked table");
    assert.equal(finalsTable(s), undefined, "no seatable table → not assigned (waiting for a table)");
    // Unlocking the table lets the finals seat there, once.
    s = pipeline(setTableLocked(s, t1.id, false));
    assertOneTablePerEntry(s, "after unlock");
    assert.equal(finalsTable(s)?.id, t1.id);
  });

  test(`${format}: multi-table (3 tables) — a finalist holding a locked table is moved, not duplicated`, () => {
    // 4 teams, 3 tables: two tables play. One decides first (3 alive); lock the other, then it decides.
    let s = live(format, 4, 3);
    const [ta, tb] = s.tables.filter((t) => t.matchId);
    const ma = matchOn(s, ta.id);
    s = pipeline(recordWinner(s, ma.id, ma.aId));
    assertOneTablePerEntry(s, "3 alive");
    const mb = matchOn(s, tb.id);
    s = pipeline(setTableLocked(s, tb.id, true));
    s = pipeline(recordWinner(s, mb.id, mb.aId));
    assert.equal(alive(s).length, 2);
    assertOneTablePerEntry(s, "finals, multi-table");
    const st = chipFinalsState(s);
    assert.equal(st.kind, "select", "two usable tables remain → the TD picks");
    assert.ok(st.kind === "select" && !st.tableIds.includes(tb.id), "the locked table is never offered");
    const pick = st.kind === "select" ? st.tableIds.find((id) => id !== ta.id)! : "";
    s = pipeline(seatFinals(s, pick));
    assertOneTablePerEntry(s, "finals seated, multi-table");
    const ft = finalsTable(s)!;
    assert.ok(ft && ft.id === pick, "finals on the chosen table");
    assert.equal(s.tables.find((t) => t.id === tb.id)!.holderId ?? null, null, "locked table vacated");
    assert.equal(s.tables.find((t) => t.id === ta.id)!.holderId ?? null, null, "other table holds neither finalist");
  });

  test(`${format}: the finals match plays out on one table and crowns a champion`, () => {
    let s = live(format, 3, 2);
    const t1 = tableOfMatch(s);
    const m = matchOn(s, t1.id);
    s = pipeline(setTableLocked(s, t1.id, true));
    s = pipeline(recordWinner(s, m.id, m.aId));
    const ft = finalsTable(s)!;
    // Finals is a winner-stays pending matchup (or a fresh one): the TD starts it on its table.
    s = pipeline(startPendingMatch(s, ft.id));
    assertOneTablePerEntry(s, "finals in progress");
    const fm = matchOn(s, ft.id);
    assert.ok(fm && fm.status === "in_progress", "finals started on the finals table");
    s = pipeline(recordWinner(s, fm.id, fm.aId));
    assertOneTablePerEntry(s, "after the finals");
    assert.equal(alive(s).length, 1);
  });
}

test("general sweep: no entry is ever on two tables through full 1-chip events (both formats)", () => {
  for (const format of ["singles", "scotch_doubles"] as ChipFormat[]) {
    for (const [n, tables] of [[3, 2], [4, 2], [4, 3], [5, 2], [6, 3], [8, 4]] as [number, number][]) {
      for (let lockMask = 0; lockMask < 4; lockMask++) {
        const where = `${format} n=${n} t=${tables} mask=${lockMask}`;
        let s = live(format, n, tables);
        for (let step = 0; step < 40 && alive(s).length > 1; step++) {
          assertOneTablePerEntry(s, `${where} step=${step}`);
          const fin = chipFinalsState(s);
          if (fin.kind === "select") {
            s = pipeline(seatFinals(s, fin.tableIds[step % fin.tableIds.length]));
            assertOneTablePerEntry(s, `${where} step=${step} finals seated`);
          }
          if (!s.tables.some((t) => t.matchId)) {
            // Nothing playing: unlock every table (a lock can hold the only seatable table) and start.
            s = pipeline(s.tables.reduce((acc, t) => (t.locked ? setTableLocked(acc, t.id, false) : acc), s));
            s = pipeline(s.tables.reduce((acc, t) => startPendingMatch(acc, t.id), startAllMatches(s)));
            if (!s.tables.some((t) => t.matchId)) break;
            continue;
          }
          const playing = s.tables.filter((t) => t.matchId);
          const t = playing[step % playing.length];
          // Lock the deciding table on some steps (bit 0: even steps, bit 1: odd steps).
          if (lockMask & (1 << (step % 2))) s = pipeline(setTableLocked(s, t.id, true));
          const m = matchOn(s, t.id);
          s = pipeline(recordWinner(s, m.id, step % 3 === 0 ? m.bId : m.aId));
        }
        assertOneTablePerEntry(s, `${where} end`);
      }
    }
  }
});
