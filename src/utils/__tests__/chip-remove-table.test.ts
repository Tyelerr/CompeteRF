// src/utils/__tests__/chip-remove-table.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-remove-table.test.ts
// Remove Table must leave every entry in a valid state IMMEDIATELY (no reload repair):
// a waiting holder + pending challenger go through Clear Table semantics (front of the queue, no
// result, no chip / W-L change, Shuffle turn given back), a live match is never interrupted or
// turned into a result (the table closes after the match), and the finals / Shuffle flows keep
// working through the shared settle. Singles + Scotch Doubles.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  beginShuffle,
  chipFinalsState,
  emptyChipState,
  finalizeReshuffle,
  newId,
  recordWinner,
  removeTable,
  returnActiveMatchesToQueue,
  seatFinals,
  setTableLocked,
  settleChipState,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { healLoadedChip, loadRepairChanged } from "../../models/services/chip.load-heal";
import { chipRoundPlayedIds } from "../chip-round-participation";
import { numberChipMatches } from "../chip-match-numbers";
import { ChipEntry, ChipFormat, ChipState } from "../../models/types/chip.types";

const entry = (name: string, doubles: boolean): ChipEntry =>
  ({
    id: newId("e"), p1Name: `${name}1`, p1Fargo: 500, p1Phone: "",
    p2Name: doubles ? `${name}2` : "", p2Fargo: doubles ? 500 : null, teamFargo: doubles ? 1000 : 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
const P = settleChipState;
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  const next = P(fn(c));
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[ev.length - 1].text);
};
const tick = () => new Promise((r) => setTimeout(r, 3));

const live = (format: ChipFormat, n: number, tables: number, chips = 3): ChipState => {
  const doubles = format === "scotch_doubles";
  let s = emptyChipState(format);
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips }] } };
  s = { ...s, entries: "ABCDEFGH".slice(0, n).split("").map((c) => entry(c, doubles)) };
  s = addTables(s, tables);
  return P(startAllMatches(startChipTournament(s)));
};
// A table holding a waiting winner + an assigned (not started) challenger.
const holderAndPending = (format: ChipFormat) => {
  const s0 = live(format, 6, 2);
  const t = s0.tables.find((x) => x.matchId)!;
  const m = s0.matches.find((x) => x.id === t.matchId)!;
  const s = act(s0, (c) => recordWinner(c, m.id, m.aId));
  const tt = s.tables.find((x) => x.id === t.id)!;
  assert.ok(tt.holderId && tt.pendingChallengerId, "holder + pending challenger");
  return { s, tableId: t.id, holder: tt.holderId!, pending: tt.pendingChallengerId! };
};

// Every alive field entry is in EXACTLY one place: the queue once, or one table seat.
const assertNoGhosts = (s: ChipState, where: string) => {
  const tableIds = new Set(s.tables.map((t) => t.id));
  for (const e of s.entries) {
    if (e.status === "eliminated" || !e.checkedIn) continue;
    const q = s.queue.filter((id) => id === e.id).length;
    const seats = s.tables.filter((t) => {
      const m = t.matchId ? s.matches.find((x) => x.id === t.matchId && x.status === "in_progress") : null;
      return t.holderId === e.id || t.pendingChallengerId === e.id || m?.aId === e.id || m?.bId === e.id;
    }).length;
    assert.equal(q + seats, 1, `${where}: ${e.p1Name} queue×${q} seats×${seats}`);
    if (q) assert.equal(e.status, "queued", `${where}: ${e.p1Name} queued but status ${e.status}`);
    if (e.tableId) assert.ok(tableIds.has(e.tableId), `${where}: ${e.p1Name} points at a removed table`);
  }
  for (const m of s.matches) {
    if (m.status === "in_progress") assert.ok(tableIds.has(m.tableId), `${where}: live match on a removed table`);
  }
};
// A reload of the saved board needs no repair (the action already left it valid).
const assertReloadClean = (s: ChipState, where: string) => {
  const cloud: ChipState = JSON.parse(JSON.stringify(s));
  assert.equal(loadRepairChanged(cloud, healLoadedChip(cloud)), false, `${where}: reload had to repair`);
};
const results = (s: ChipState) => numberChipMatches(s).list.length;
const record = (s: ChipState) =>
  s.entries.map((e) => `${e.id}:${e.chips}:${e.wins}:${e.losses}`).sort().join("|");

for (const format of ["singles", "scotch_doubles"] as ChipFormat[]) {
  test(`${format} A–F,O: holder + pending challenger → no ghost, no result, no chip/W-L change`, () => {
    const { s, tableId, holder, pending } = holderAndPending(format);
    const before = { results: results(s), record: record(s), finished: s.matches.filter((m) => m.status === "finished").length };
    const r = act(s, (c) => removeTable(c, tableId));
    assert.ok(!r.tables.some((t) => t.id === tableId), "table deleted");
    assertNoGhosts(r, "after remove");
    // B + C: both back in the queue immediately (front — Clear Table "next in queue").
    assert.ok(r.queue.slice(0, 2).includes(pending), "pending challenger at the front of the queue");
    assert.ok(r.queue.slice(0, 2).includes(holder), "holder at the front of the queue");
    for (const id of [holder, pending]) {
      const e = r.entries.find((x) => x.id === id)!;
      assert.equal(e.status, "queued");
      assert.equal(e.tableId ?? null, null);
    }
    // D + E + F: nothing counted.
    assert.equal(results(r), before.results, "Match # unchanged");
    assert.equal(r.matches.filter((m) => m.status === "finished").length, before.finished, "no finished match created");
    assert.equal(record(r), before.record, "chips / W-L unchanged");
    assert.ok(r.events.some((e) => e.type === "table_removed"));
    assertReloadClean(r, "O");
  });

  test(`${format} I: a LIVE match is never interrupted or turned into a result`, () => {
    const s = live(format, 6, 2);
    const t = s.tables.find((x) => x.matchId)!;
    const before = { results: results(s), record: record(s) };
    const r = act(s, (c) => removeTable(c, t.id));
    const tt = r.tables.find((x) => x.id === t.id)!;
    assert.ok(tt, "table kept until its match ends");
    assert.equal(tt.closing, true, "scheduled to close after the match (Remove After Match)");
    assert.ok(r.matches.some((m) => m.id === t.matchId && m.status === "in_progress"), "match still live");
    assert.equal(results(r), before.results);
    assert.equal(record(r), before.record);
    assertNoGhosts(r, "live removal");
    assert.equal(act(r, (c) => removeTable(c, t.id)), r, "second removal of a closing table is a no-op");
    // The match finishes normally → the table closes; the winner rejoins the queue.
    const m = r.matches.find((x) => x.id === t.matchId)!;
    const done = act(r, (c) => recordWinner(c, m.id, m.aId));
    assert.equal(done.tables.find((x) => x.id === t.id)!.inactive, true);
    assert.equal(results(done), before.results + 1, "only the recorded result counts");
    assertNoGhosts(done, "after the match");
    assertReloadClean(done, "live O");
  });

  test(`${format} J+K: locked table and empty tables`, () => {
    const { s, tableId, holder, pending } = holderAndPending(format);
    const locked = act(s, (c) => setTableLocked(c, tableId, true));
    const r = act(locked, (c) => removeTable(c, tableId));
    assertNoGhosts(r, "locked");
    assert.ok(r.queue.includes(holder) && r.queue.includes(pending));
    // Empty table (4 teams on 3 tables leaves Table 3 empty): lock it, remove it → just deleted.
    let e = live(format, 4, 3);
    const extra = e.tables.find((t) => !t.matchId && !t.holderId && !t.pendingChallengerId)!;
    assert.ok(extra, "an empty table");
    e = act(e, (c) => setTableLocked(c, extra.id, true));
    const gone = act(e, (c) => removeTable(c, extra.id));
    assert.ok(!gone.tables.some((t) => t.id === extra.id));
    assert.deepEqual(gone.queue, e.queue, "queue untouched");
    assertNoGhosts(gone, "empty");
    assertReloadClean(gone, "empty O");
  });

  test(`${format} G+H: Shuffle — removed-before-result keeps the turn; the round still settles`, async () => {
    let s = live(format, 4, 2);
    s = act(s, returnActiveMatchesToQueue);
    s = act(s, (c) => beginShuffle(c));
    s = act(s, (c) => finalizeReshuffle(c, null));
    await tick();
    const [t1, t2] = s.tables;
    const seated = [t1.holderId!, t1.pendingChallengerId!];
    const playedBefore = [...chipRoundPlayedIds(s)].sort();
    s = act(s, (c) => removeTable(c, t1.id));
    assertNoGhosts(s, "round remove");
    assert.deepEqual([...chipRoundPlayedIds(s)].sort(), playedBefore, "Played This Round unchanged");
    for (const id of seated) assert.ok((s.roundRemaining ?? []).includes(id), "still owed a turn");
    assert.equal(!!s.reshufflePending, false, "round not ended early");
    // Play the round out on the remaining table: everyone gets a turn, then it completes.
    for (let i = 0; i < 10 && !s.reshufflePending; i++) {
      const t = s.tables.find((x) => x.id === t2.id)!;
      if (!t.matchId && t.holderId && t.pendingChallengerId) s = act(s, (c) => startPendingMatch(c, t2.id));
      await tick();
      const m = s.matches.find((x) => x.status === "in_progress");
      if (!m) break;
      s = act(s, (c) => recordWinner(c, m.id, m.aId));
      await tick();
      assertNoGhosts(s, `round step ${i}`);
    }
    assert.equal(!!s.reshufflePending, true, "round completed (not stuck)");
    for (const id of seated) assert.ok(chipRoundPlayedIds(s).has(id) || s.entries.find((e) => e.id === id)!.status === "eliminated");
  });

  test(`${format} L: finals waiting for a table — removing an unused table updates the choice`, () => {
    const s0 = live(format, 3, 3, 1);
    const t = s0.tables.find((x) => x.matchId)!;
    const m = s0.matches.find((x) => x.id === t.matchId)!;
    let s = act(s0, (c) => recordWinner(c, m.id, m.aId));
    const st = chipFinalsState(s);
    assert.equal(st.kind, "select");
    const unused = s.tables.find((x) => !x.holderId && !x.pendingChallengerId && !x.matchId)!;
    s = act(s, (c) => removeTable(c, unused.id));
    const st2 = chipFinalsState(s);
    assert.equal(st2.kind, "select", "still the TD's choice with two tables left");
    assert.ok(st2.kind === "select" && !st2.tableIds.includes(unused.id) && st2.tableIds.length === 2);
    assertNoGhosts(s, "finals select");
    assertReloadClean(s, "finals select O");
  });

  test(`${format} M: the chosen finals table removed before Start Match → back to a valid finals state`, () => {
    const s0 = live(format, 3, 3, 1);
    const t = s0.tables.find((x) => x.matchId)!;
    const m = s0.matches.find((x) => x.id === t.matchId)!;
    let s = act(s0, (c) => recordWinner(c, m.id, m.aId));
    const pick = s.tables.find((x) => x.id !== t.id)!.id;
    s = act(s, (c) => seatFinals(c, pick));
    assert.deepEqual(chipFinalsState(s), { kind: "seated", tableId: pick });
    // Three tables → two remain → the TD chooses again (never silently moved).
    const three = act(s, (c) => removeTable(c, pick));
    assert.equal(chipFinalsState(three).kind, "select");
    assert.ok(!three.tables.some((x) => x.pendingChallengerId), "nobody half-seated");
    assertNoGhosts(three, "finals removed (select)");
    assertReloadClean(three, "finals removed O");
    // Two tables → exactly one remains → the documented one-eligible-table rule seats it.
    const twoBase = live(format, 3, 2, 1);
    const t2 = twoBase.tables.find((x) => x.matchId)!;
    const m2 = twoBase.matches.find((x) => x.id === t2.matchId)!;
    let two = act(twoBase, (c) => recordWinner(c, m2.id, m2.aId));
    const other = two.tables.find((x) => x.id !== t2.id)!.id;
    two = act(two, (c) => seatFinals(c, other));
    two = act(two, (c) => removeTable(c, other));
    assert.deepEqual(chipFinalsState(two), { kind: "seated", tableId: t2.id });
    assertNoGhosts(two, "finals two tables");
  });

  test(`${format} Undo: removing a table is undone exactly (table + seats back)`, () => {
    const { s, tableId, holder, pending } = holderAndPending(format);
    const r = act(s, (c) => removeTable(c, tableId));
    const u = undoLastActions(r, 1, { reason: "test" });
    const t = u.tables.find((x) => x.id === tableId)!;
    assert.ok(t, "table restored");
    assert.equal(t.holderId, holder);
    assert.equal(t.pendingChallengerId, pending);
    assert.ok(!u.queue.includes(holder) && !u.queue.includes(pending));
    assertNoGhosts(u, "undo");
  });
}

test("Scotch Doubles: a team is removed from the table as ONE unit", () => {
  const { s, tableId, pending } = holderAndPending("scotch_doubles");
  const r = act(s, (c) => removeTable(c, tableId));
  const team = r.entries.find((e) => e.id === pending)!;
  assert.ok(team.p1Name && team.p2Name, "both partners on the one entry");
  assert.equal(r.queue.filter((id) => id === pending).length, 1, "one queue slot for the team");
});
