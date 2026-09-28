// src/utils/__tests__/chip-queue-move.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-queue-move.test.ts
// Native ☰ drag-to-reorder for the Chip queue goes through engine moveQueueEntry, which
// shares ONE splice primitive with reorderQueue (Move Up/Down/Top/Bottom). A drag must give
// exactly the order the equivalent menu moves give, only queued entries can move, the order
// is never re-sorted by the reconcile pipeline, it survives a save/reload round trip, and a
// drag is ONE undo step.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  assignFinals,
  emptyChipState,
  moveQueueEntry,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  reorderQueue,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipState } from "../../models/types/chip.types";
import { toPublicActivityFeed } from "../chip-activity";

const entry = (name: string): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
// The VM's update() pipeline (materializeLive is a no-op for non-registration entries).
const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s)))));
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  const next = pipeline(fn(c));
  if (next === c) return c;
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[ev.length - 1].text);
};
const live = (): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGHIJ".split("").map(entry) };
  s = addTables(s, 1);
  return pipeline(startAllMatches(startChipTournament(s)));
};

test("drag one position == Move Up / Move Down", () => {
  const s = live();
  assert.ok(s.queue.length >= 6);
  const id = s.queue[3];
  assert.deepEqual(moveQueueEntry(s, id, 2).queue, reorderQueue(s, id, "up").queue);
  assert.deepEqual(moveQueueEntry(s, id, 4).queue, reorderQueue(s, id, "down").queue);
});

test("drag several positions == the same number of repeated menu moves; ends == Top/Bottom", () => {
  const s = live();
  const id = s.queue[4];
  let up = s;
  for (let k = 0; k < 3; k++) up = reorderQueue(up, id, "up");
  assert.deepEqual(moveQueueEntry(s, id, 1).queue, up.queue);
  let down = s;
  for (let k = 0; k < 2; k++) down = reorderQueue(down, id, "down");
  assert.deepEqual(moveQueueEntry(s, id, 6).queue, down.queue);
  assert.deepEqual(moveQueueEntry(s, id, 0).queue, reorderQueue(s, id, "top").queue);
  assert.deepEqual(moveQueueEntry(s, id, s.queue.length - 1).queue, reorderQueue(s, id, "bottom").queue);
  assert.deepEqual(moveQueueEntry(s, id, 999).queue, reorderQueue(s, id, "bottom").queue, "clamped");
});

test("drop in place / not-in-queue entry: unchanged state, no event", () => {
  const s = live();
  assert.equal(moveQueueEntry(s, s.queue[2], 2), s);
  const seated = s.entries.find((e) => !s.queue.includes(e.id))!; // on the table
  assert.equal(moveQueueEntry(s, seated.id, 0), s);
  assert.equal(moveQueueEntry(s, "nope", 0), s);
});

test("the reconcile pipeline never re-sorts a dragged queue (no snap-back)", () => {
  const s = live();
  const id = s.queue[5];
  const moved = act(s, (c) => moveQueueEntry(c, id, 0));
  assert.equal(moved.queue[0], id);
  assert.deepEqual(pipeline(moved).queue, moved.queue);
});

test("save/reload round trip keeps the dragged order; one audit event (TD-only manual)", () => {
  const s = live();
  const id = s.queue[1];
  const moved = act(s, (c) => moveQueueEntry(c, id, 4));
  const reloaded = pipeline(JSON.parse(JSON.stringify(moved)));
  assert.deepEqual(reloaded.queue, moved.queue);
  const added = moved.events.slice(0, moved.events.length - s.events.length);
  assert.equal(added.length, 1);
  assert.equal(added[0].type, "manual");
  assert.match(added[0].text, /moved from #2 to #5 in the queue/);
});

test("a drag is ONE undo step back to the exact previous order", () => {
  const s = live();
  const before = s.queue.slice();
  const moved = act(s, (c) => moveQueueEntry(c, s.queue[6], 1));
  assert.notDeepEqual(moved.queue, before);
  assert.deepEqual(undoLastActions(moved, 1, { reason: "test" }).queue, before);
});

test("Move Up/Down/Top/Bottom output is unchanged by the shared primitive", () => {
  const s = live();
  const q = s.queue;
  const id = q[2];
  const expect = (to: "up" | "down" | "top" | "bottom") => {
    const rest = q.filter((x) => x !== id);
    const j = to === "up" ? 1 : to === "down" ? 3 : to === "top" ? 0 : rest.length;
    return [...rest.slice(0, j), id, ...rest.slice(j)];
  };
  for (const to of ["up", "down", "top", "bottom"] as const) assert.deepEqual(reorderQueue(s, id, to).queue, expect(to));
  assert.deepEqual(reorderQueue(s, q[0], "up").queue, q, "top row Move Up stays put");
});

// ── Spectator activity feed: manual queue reorders are PUBLIC (one line per action) ─────────

const publicQueueLines = (s: ChipState) =>
  toPublicActivityFeed(s.events, Infinity).filter((a) => a.kind === "queue");

test("spectator feed: a drag shows ONE compact public line", () => {
  const s = live();
  const id = s.queue[1];
  const name = s.entries.find((e) => e.id === id)!.p1Name;
  const moved = act(s, (c) => moveQueueEntry(c, id, 4));
  const lines = publicQueueLines(moved);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, `${name} moved from #2 to #5 in the queue`);
  assert.equal(lines[0].actor ?? null, null, "no admin identity");
  assert.ok(!lines[0].text.includes(id), "no internal ids");
});

test("spectator feed: Move Up / Move to Bottom render in the SAME format as a drag", () => {
  const s = live();
  const id = s.queue[3];
  const name = s.entries.find((e) => e.id === id)!.p1Name;
  const up = act(s, (c) => reorderQueue(c, id, "up"));
  assert.deepEqual(publicQueueLines(up).map((a) => a.text), [`${name} moved from #4 to #3 in the queue`]);
  const bottom = act(up, (c) => reorderQueue(c, id, "bottom"));
  const n = bottom.queue.length;
  assert.deepEqual(publicQueueLines(bottom).map((a) => a.text), [
    `${name} moved from #3 to #${n} in the queue`,
    `${name} moved from #4 to #3 in the queue`,
  ]);
});

test("spectator feed: no-op moves and undone moves are hidden; other events unaffected", () => {
  const s = live();
  const noop = reorderQueue(s, s.queue[0], "up"); // top row Move Up (engine logs it, no change)
  assert.equal(publicQueueLines(noop).length, 0);
  const moved = act(s, (c) => moveQueueEntry(c, s.queue[2], 0));
  const undone = undoLastActions(moved, 1, { reason: "test" });
  assert.equal(publicQueueLines(undone).length, 0, "reverted reorder leaves the public story");
  // the rest of the public feed is unchanged by the reorder
  const others = (x: ChipState) => toPublicActivityFeed(x.events, Infinity).filter((a) => a.kind !== "queue").map((a) => a.id);
  assert.deepEqual(others(moved), others(s));
});

test("spectator feed: legacy (pre-tag) reorder events are recognised by wording", () => {
  const s = live();
  const legacy = (text: string) => ({ id: newId("ev"), type: "manual" as const, text, at: new Date().toISOString() });
  const withLegacy: ChipState = {
    ...s,
    events: [legacy("Ann Lee moved from #2 to #5 in the queue"), legacy("Bo Park moved down in the queue"), legacy("Table 1 timer reset"), ...s.events],
  };
  assert.deepEqual(publicQueueLines(withLegacy).map((a) => a.text), [
    "Ann Lee moved from #2 to #5 in the queue",
    "Bo Park moved down in the queue",
  ]);
});

test("dashboard PREVIEW drag (first N of the queue) reorders the FULL queue", () => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGHI".split("").map(entry) }; // 9 entries, 1 table → 7 queued
  s = addTables(s, 1);
  s = pipeline(startAllMatches(startChipTournament(s)));
  const full = s.queue.slice();
  assert.equal(full.length, 7);
  const preview = full.slice(0, 5); // what the mobile dashboard card shows
  // library reports from/to within the preview; the preview is a prefix → same indexes.
  const from = 4, to = 1; // displayed #5 → #2
  const moved = moveQueueEntry(s, preview[from], to);
  assert.deepEqual(moved.queue, [full[0], full[4], full[1], full[2], full[3], full[5], full[6]]);
});
