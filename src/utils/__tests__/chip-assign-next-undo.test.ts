// src/utils/__tests__/chip-assign-next-undo.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-assign-next-undo.test.ts
// Manual Assign Next Team / Assign Next Match (engine assignNextTeam via vm.assignNextTeam)
// logs ONE TD-only audit event (manual / act "assign_next", mode fill_opponent | full_match),
// which gives the action its own restore point — so Undo returns the table, queue, entry
// states and Shuffle round state (roundRemaining) exactly to what they were, with no
// chip / W-L change and no spectator activity line.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  assignNextTeam,
  beginShuffle,
  canAssignNextTeam,
  clearTable,
  emptyChipState,
  finalizeReshuffle,
  newId,
  recordWinner,
  removeFromTable,
  returnActiveMatchesToQueue,
  settleChipState,
  setTableLocked,
  startAllMatches,
  startChipTournament,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { sanitizeChipForBackup } from "../../models/services/chip.local-recovery";
import { chipConfigPayload } from "../../models/services/chip.rows";
import { toPublicActivityFeed } from "../chip-activity";
import { ChipEntry, ChipFormat, ChipState } from "../../models/types/chip.types";

const entry = (name: string, doubles: boolean): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: 500, p1Phone: "", p2Name: doubles ? `${name}2` : "", p2Fargo: doubles ? 450 : null,
    teamFargo: doubles ? 950 : 500, startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
// Mirrors the VM update(): the shared settle, then a restore point for any action that logged
// events (pre-action snapshot), with a shared txId for multi-event actions.
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  let next = settleChipState(fn(c));
  if (next === c) return c;
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  if (added > 1) {
    const tx = newId("tx");
    next = { ...next, events: next.events.map((e, i) => (i < added ? { ...e, txId: tx } : e)) };
  }
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[ev.length - 1].text);
};
const undo = (s: ChipState) => settleChipState(undoLastActions(s, 1, { reason: "test" }));
const live = (format: ChipFormat = "singles", n = 8, tables = 2): ChipState => {
  let s = emptyChipState(format);
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGHIJ".slice(0, n).split("").map((c) => entry(c, format === "scotch_doubles")) };
  s = addTables(s, tables);
  return settleChipState(startAllMatches(startChipTournament(s)));
};
// Everything assignment touches (and everything that must NOT change).
const board = (s: ChipState) => ({
  queue: [...s.queue],
  tables: s.tables.map((t) => ({
    id: t.id, holderId: t.holderId ?? null, pendingChallengerId: t.pendingChallengerId ?? null,
    matchId: t.matchId ?? null, status: t.status, lastLoserId: t.lastLoserId ?? null, rematchSkipped: [...(t.rematchSkipped ?? [])],
  })),
  entries: s.entries.map((e) => ({ id: e.id, status: e.status, tableId: e.tableId ?? null, chips: e.chips, wins: e.wins, losses: e.losses, streak: e.streak })),
  live: s.matches.filter((m) => m.status === "in_progress").map((m) => [m.id, m.tableId, m.aId, m.bId]).sort(),
  // unset ≡ empty / false (a restore writes the snapshot's explicit defaults)
  roundRemaining: s.roundRemaining?.length ? [...s.roundRemaining] : [],
  shuffleRound: !!s.shuffleRound,
});
const liveTable = (s: ChipState) => s.tables.find((t) => t.matchId)!;
const assignEvents = (s: ChipState) => s.events.filter((e) => e.payload?.act === "assign_next");
// A table left with one seated team (Remove Player of the challenger).
const holderOnly = (s: ChipState) => {
  const t = liveTable(s);
  const m = s.matches.find((x) => x.id === t.matchId)!;
  return { s: act(s, (c) => removeFromTable(c, t.id, m.bId, "end")), tableId: t.id, holder: m.aId };
};

for (const format of ["singles", "scotch_doubles"] as ChipFormat[]) {
  test(`[${format}] 1: one seated + Assign Next Team → front challenger pending; own audit event; Undo restores exactly`, () => {
    const h = holderOnly(live(format));
    let s = h.s;
    const before = board(s);
    const rpsBefore = s.restorePoints?.length ?? 0;
    const front = s.queue[0];
    s = act(s, (c) => assignNextTeam(c, h.tableId));
    const t = s.tables.find((x) => x.id === h.tableId)!;
    assert.equal(t.holderId, h.holder);
    assert.equal(t.pendingChallengerId, front);
    const ev = assignEvents(s);
    assert.equal(ev.length, 1, "one audit event");
    assert.equal(ev[0].type, "manual");
    assert.equal(ev[0].payload?.mode, "fill_opponent");
    assert.deepEqual(ev[0].payload?.entryIds, [h.holder, front]);
    assert.match(ev[0].text, /^Assign Next Team: .+ vs .+ assigned to Table \d+$/);
    assert.equal(s.restorePoints?.length, rpsBefore + 1, "dedicated Undo step");
    assert.deepEqual(s.restorePoints!.at(-1)!.eventIds, [ev[0].id]);
    const back = undo(s);
    assert.deepEqual(board(back), before, "table / queue / entries / round state exactly as before");
    assert.ok(assignEvents(back)[0].superseded, "audit keeps the undone assignment (superseded)");
  });

  test(`[${format}] 2: empty table + Assign Next Match → first pair starts; Undo empties the table and restores the queue`, () => {
    let s = live(format);
    const t = liveTable(s);
    s = act(s, (c) => clearTable(c, t.id, "end"));
    const before = board(s);
    const [q0, q1] = s.queue;
    s = act(s, (c) => assignNextTeam(c, t.id));
    const m = s.matches.find((x) => x.tableId === t.id && x.status === "in_progress")!;
    assert.deepEqual([m.aId, m.bId], [q0, q1]);
    const ev = assignEvents(s);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].payload?.mode, "full_match");
    assert.equal(ev[0].payload?.matchId, m.id);
    assert.match(ev[0].text, /^Assign Next Match: .+ vs .+ assigned to Table \d+$/);
    const back = undo(s);
    assert.deepEqual(board(back), before);
    const bt = back.tables.find((x) => x.id === t.id)!;
    assert.ok(!bt.matchId && !bt.holderId && !bt.pendingChallengerId, "table empty again");
    assert.equal(back.matches.some((x) => x.id === m.id && x.status === "in_progress"), false, "assigned match gone");
    assert.equal(new Set(back.queue).size, back.queue.length, "no duplicate queue entries");
  });

  test(`[${format}] 3: Shuffle round — seated player leaves the owed list; Undo makes them Waiting for turn again`, () => {
    let s = live(format, 8, 2);
    s = act(s, (c) => returnActiveMatchesToQueue(c));
    s = act(s, (c) => beginShuffle(c));
    s = act(s, (c) => finalizeReshuffle(c, null));
    assert.ok(s.shuffleRound, "round open");
    const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
    s = act(s, (c) => removeFromTable(c, t.id, t.pendingChallengerId!, "end")); // challenger back, still owed
    const before = board(s);
    const next = s.queue.find((id) => s.roundRemaining!.includes(id))!;
    assert.ok(next, "someone is Waiting for turn");
    s = act(s, (c) => assignNextTeam(c, t.id));
    assert.equal(s.tables.find((x) => x.id === t.id)!.pendingChallengerId, next);
    assert.equal(s.roundRemaining!.includes(next), false, "seated for the round (not Played)");
    const back = undo(s);
    assert.deepEqual(board(back), before);
    assert.ok(back.roundRemaining!.includes(next) && back.queue.includes(next), "Waiting for turn again");
    // Played this round is result-based: no result was logged by assign/undo
    assert.equal(back.events.filter((e) => e.type === "match_result" && !e.superseded).length, s.events.filter((e) => e.type === "match_result" && !e.superseded).length);
  });
}

test("6/7: queue order restored exactly; assign → Undo → assign again → same pairing, no duplicates or stale table", () => {
  let s = live("singles", 10, 2);
  const t = liveTable(s);
  s = act(s, (c) => clearTable(c, t.id, "next")); // requeued to the FRONT — a non-trivial order
  const order = [...s.queue];
  const first = act(s, (c) => assignNextTeam(c, t.id));
  const pair1 = first.matches.find((x) => x.tableId === t.id && x.status === "in_progress")!;
  const back = undo(first);
  assert.deepEqual(back.queue, order, "exact queue order");
  const again = act(back, (c) => assignNextTeam(c, t.id));
  const pair2 = again.matches.find((x) => x.tableId === t.id && x.status === "in_progress")!;
  assert.deepEqual([pair2.aId, pair2.bId], [pair1.aId, pair1.bId]);
  assert.equal(again.matches.filter((x) => x.tableId === t.id && x.status === "in_progress").length, 1, "one live match on the table");
  assert.equal(new Set(again.queue).size, again.queue.length);
  for (const id of [pair2.aId, pair2.bId]) assert.ok(!again.queue.includes(id), "seated team not also queued");
  const seated = again.entries.filter((e) => e.status !== "queued" && e.status !== "eliminated").length;
  assert.equal(seated + again.queue.length + again.entries.filter((e) => e.status === "eliminated").length, again.entries.length, "no one disappears");
  assert.equal(assignEvents(again).filter((e) => !e.superseded).length, 1, "only the live assignment is active");
});

test("8: the restore point survives persistence + local recovery (config payload / backup / JSON round trip) and Undo still works", () => {
  const h = holderOnly(live());
  const before = board(h.s);
  const s = act(h.s, (c) => assignNextTeam(c, h.tableId));
  assert.deepEqual(chipConfigPayload(s).restore_points, s.restorePoints, "saved with chip_config.restore_points");
  const recovered: ChipState = JSON.parse(JSON.stringify(sanitizeChipForBackup(s)));
  assert.deepEqual(board(undo(recovered)), before);
});

test("9: locked / draining / finished → no assignment, no event, no Undo step", () => {
  let s = live();
  const t = liveTable(s);
  s = act(s, (c) => clearTable(c, t.id, "end"));
  const cases: ChipState[] = [
    act(s, (c) => setTableLocked(c, t.id, true)),
    { ...s, reshufflePending: true },
    { ...s, finishedAt: new Date().toISOString() },
  ];
  for (const c of cases) {
    assert.equal(canAssignNextTeam(c, t.id), false);
    const out = act(c, (x) => assignNextTeam(x, t.id));
    assert.equal(assignEvents(out).length, 0);
    assert.equal(out.restorePoints?.length ?? 0, c.restorePoints?.length ?? 0);
  }
});

test("no-op assign (nobody eligible) logs nothing and adds no Undo step", () => {
  let s = live("singles", 4, 1);
  const t = liveTable(s);
  s = act(s, (c) => clearTable(c, t.id, "end"));
  const onlyOne: ChipState = { ...s, queue: s.queue.slice(0, 1) };
  const out = act(onlyOne, (c) => assignNextTeam(c, t.id));
  assert.equal(assignEvents(out).length, 0);
});

test("spectators: the assignment adds no public activity line; chips / W-L unchanged", () => {
  const h = holderOnly(live());
  const s = act(h.s, (c) => assignNextTeam(c, h.tableId));
  assert.equal(toPublicActivityFeed(s.events, Infinity).length, toPublicActivityFeed(h.s.events, Infinity).length);
  assert.deepEqual(board(s).entries.map((e) => [e.id, e.chips, e.wins, e.losses]), board(h.s).entries.map((e) => [e.id, e.chips, e.wins, e.losses]));
});

test("10: automatic seating (winner-stays after a result) is unchanged — no assign_next event", () => {
  let s = live("singles", 8, 2);
  const t = liveTable(s);
  const m = s.matches.find((x) => x.id === t.matchId)!;
  s = act(s, (c) => recordWinner(c, m.id, m.aId));
  assert.equal(assignEvents(s).length, 0, "auto seating logs no manual-assign event");
});
