// src/utils/__tests__/queue-drag-model.test.ts
// Run: npx tsx --test src/utils/__tests__/queue-drag-model.test.ts
// Regression tests for the Chip queue DROP LIFECYCLE (QueueDragList + utils/queue-drag-model),
// written after "row disappears after drop" on device: ranks read 1, 2, 4, 5 and one player
// was missing — the moved row was drawn on top of another row because its landing offset
// survived the swap to the new order.
//
// Each test simulates the component lifecycle with the real geometry model and the REAL
// engine commit (moveQueueEntry via the VM-equivalent pipeline):
//   press → move (dy) → release → target index → commit → settle offsets
//   → swap to the authoritative queue with ALL offsets fresh (0) → drag state cleared.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayIndex,
  dragTargetIndex,
  droppedOrder,
  landingOffset,
  settledOffsets,
  slotTops,
  visualTops,
} from "../queue-drag-model";
import {
  addTables,
  emptyChipState,
  moveQueueEntry,
  newId,
  reconcileQueue,
  startAllMatches,
  startChipTournament,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

const ROW = 145; // row height seen on device (rank / name / Fargo / status)
const mkEntry = (name: string): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
// 5 queued + 2 seated (one live match) — the device screenshot had a 5-player queue.
const liveChip = (): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFG".split("").map(mkEntry) };
  s = addTables(s, 1);
  return reconcileQueue(startAllMatches(startChipTournament(s)));
};

// The list component's state, as the lifecycle sees it.
interface ListState {
  rendered: string[]; // order currently rendered
  offsets: Record<string, number>; // translateY per row
  drag: { id: string; from: number; to: number; ids: string[] } | null;
  preview: { id: string; from: number; to: number } | null;
  offsetGeneration: number; // bumps when offsets are replaced by fresh values
}
const heightsFor = (ids: string[], h = ROW, overrides: Record<string, number> = {}) =>
  Object.fromEntries(ids.map((id) => [id, overrides[id] ?? h]));

// One full drag: returns the list state after the settle + swap, the new chip state, and
// the visual positions right BEFORE and right AFTER the swap (must be identical).
const runDrag = (
  chip: ChipState,
  list: ListState,
  heights: Record<string, number>,
  fromIndex: number,
  dy: number,
  commit = true,
) => {
  const id = list.rendered[fromIndex];
  // press
  list.drag = { id, from: fromIndex, to: fromIndex, ids: list.rendered.slice() };
  list.preview = { id, from: fromIndex, to: fromIndex };
  // move (target tracked continuously)
  const to = dragTargetIndex(list.drag.ids, heights, fromIndex, dy);
  list.drag.to = to;
  list.preview = { id, from: fromIndex, to };
  list.offsets = { ...list.offsets, [id]: dy };
  // release → final target (cancel returns home)
  const target = commit ? to : fromIndex;
  let next = chip;
  if (target !== fromIndex) next = moveQueueEntry(chip, id, target); // the VM's commit
  // settle: offsets animate to their landing positions (still the ORIGINAL rendered order)
  list.offsets = settledOffsets(list.drag.ids, heights, fromIndex, target);
  const before = visualTops(list.rendered, heights, list.offsets);
  // finish: drag cleared, authoritative order swapped in with FRESH zero offsets
  list.drag = null;
  list.preview = null;
  list.rendered = next.queue.slice();
  list.offsets = {};
  list.offsetGeneration += 1;
  const after = visualTops(list.rendered, heights, list.offsets);
  return { chip: next, before, after, target };
};

const assertCleanList = (list: ListState, chip: ChipState, heights: Record<string, number>) => {
  // every queue id rendered exactly once, in the authoritative order
  assert.deepEqual(list.rendered, chip.queue);
  assert.equal(new Set(list.rendered).size, chip.queue.length);
  // no row hidden / displaced: every row sits exactly in its slot
  const tops = slotTops(list.rendered, heights);
  const vis = visualTops(list.rendered, heights, list.offsets);
  list.rendered.forEach((id, i) => assert.equal(vis[id], tops[i], `${id} is displaced`));
  // ranks contiguous 1..N
  const ranks = list.rendered.map((id, i) => displayIndex(id, i, list.preview) + 1);
  assert.deepEqual(ranks, list.rendered.map((_, i) => i + 1));
  // drag state fully cleared
  assert.equal(list.drag, null);
  assert.equal(list.preview, null);
  assert.ok(Object.values(list.offsets).every((v) => v === 0));
};

const freshList = (chip: ChipState): ListState => ({
  rendered: chip.queue.slice(),
  offsets: {},
  drag: null,
  preview: null,
  offsetGeneration: 0,
});

test("the device bug: drag index 2 → 4, commit, settle, swap — every row visible once, ranks 1..5", () => {
  let chip = liveChip();
  assert.equal(chip.queue.length, 5);
  const list = freshList(chip);
  const heights = heightsFor(chip.queue);
  const moving = chip.queue[2];
  const r = runDrag(chip, list, heights, 2, 2 * ROW + 20); // down two rows
  chip = r.chip;
  assert.equal(r.target, 4);
  assert.equal(chip.queue[4], moving);
  assertCleanList(list, chip, heights);
  // no visual jump across the swap: every row is where the settle left it
  for (const id of chip.queue) assert.equal(r.after[id], r.before[id], `${id} jumped at the swap`);
});

test("the ROOT CAUSE, pinned: a landing offset carried across the swap hides a slot", () => {
  const chip = liveChip();
  const heights = heightsFor(chip.queue);
  const moving = chip.queue[2];
  const next = moveQueueEntry(chip, moving, 4);
  const stale = settledOffsets(chip.queue, heights, 2, 4); // what the old reset failed to clear
  const vis = visualTops(next.queue, heights, stale);
  // the moved row is drawn two rows below its new slot, on top of another row…
  const tops = slotTops(next.queue, heights);
  assert.equal(vis[moving], tops[4] + 2 * ROW);
  // …so some slot has no row drawn in it (the "missing" player / skipped rank).
  const occupied = new Set(Object.values(vis));
  assert.ok(tops.some((t) => !occupied.has(t)), "a slot is empty with stale offsets");
});

for (const [label, from, dy, expectTo] of [
  ["drag up one", 3, -(ROW + 5), 2],
  ["drag down one", 1, ROW + 5, 2],
  ["drag to top", 4, -(4 * ROW + 50), 0],
  ["drag to bottom", 0, 4 * ROW + 50, 4],
  ["drag up several", 4, -(2 * ROW + 10), 2],
] as const) {
  test(`${label}: lands at ${expectTo}, list clean, no jump`, () => {
    let chip = liveChip();
    const list = freshList(chip);
    const heights = heightsFor(chip.queue);
    const original = chip.queue.slice();
    const moving = chip.queue[from];
    const r = runDrag(chip, list, heights, from, dy);
    chip = r.chip;
    assert.equal(r.target, expectTo);
    assert.equal(chip.queue[expectTo], moving);
    assert.deepEqual(chip.queue, droppedOrder(original, from, expectTo), "engine order == list's dropped order");
    assertCleanList(list, chip, heights);
    for (const id of chip.queue) assert.equal(r.after[id], r.before[id]);
  });
}

test("drop in place: no commit, nothing moves, list clean", () => {
  const chip = liveChip();
  const list = freshList(chip);
  const heights = heightsFor(chip.queue);
  const r = runDrag(chip, list, heights, 2, 20); // wiggle, not past a midpoint
  assert.equal(r.target, 2);
  assert.equal(r.chip, chip, "no engine change → no save / no audit");
  assertCleanList(list, r.chip, heights);
  for (const id of chip.queue) assert.equal(r.after[id], r.before[id]);
});

test("cancelled drag (OS took the touch / window blur): returns home, no commit, list clean", () => {
  const chip = liveChip();
  const list = freshList(chip);
  const heights = heightsFor(chip.queue);
  const r = runDrag(chip, list, heights, 1, 3 * ROW, false);
  assert.equal(r.target, 1);
  assert.equal(r.chip, chip);
  assertCleanList(list, r.chip, heights);
});

test("a second drag immediately after a drop works from the new order", () => {
  let chip = liveChip();
  const list = freshList(chip);
  const heights = heightsFor(chip.queue);
  const first = runDrag(chip, list, heights, 2, 2 * ROW + 20);
  chip = first.chip;
  assertCleanList(list, chip, heights);
  const moving = chip.queue[4]; // the row we just dropped
  const second = runDrag(chip, list, heights, 4, -(4 * ROW + 40)); // straight to the top
  chip = second.chip;
  assert.equal(chip.queue[0], moving);
  assertCleanList(list, chip, heights);
  assert.equal(list.offsetGeneration, 2, "offsets were replaced (fresh) at every swap");
});

test("variable row heights (rematch-skipped line etc.): landing = exact slot, no jump", () => {
  let chip = liveChip();
  const list = freshList(chip);
  const heights = heightsFor(chip.queue, ROW, { [chip.queue[1]]: ROW + 30, [chip.queue[3]]: ROW + 18 });
  const r = runDrag(chip, list, heights, 0, ROW * 3 + 60);
  chip = r.chip;
  assertCleanList(list, chip, heights);
  for (const id of chip.queue) assert.equal(r.after[id], r.before[id], `${id} jumped`);
  assert.equal(landingOffset(r.chip.queue, heights, 0, 0), 0);
});

test("live rank preview while dragging is contiguous (never 1, 2, 4, 5)", () => {
  const chip = liveChip();
  const q = chip.queue;
  for (let from = 0; from < q.length; from++) {
    for (let to = 0; to < q.length; to++) {
      const pv = { id: q[from], from, to };
      const ranks = q.map((id, i) => displayIndex(id, i, pv)).sort((a, b) => a - b);
      assert.deepEqual(ranks, q.map((_, i) => i), `from ${from} to ${to}`);
    }
  }
});
