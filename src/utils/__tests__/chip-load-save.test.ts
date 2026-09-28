// src/utils/__tests__/chip-load-save.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-load-save.test.ts
// Save-on-load regression. Loading a board (first open, refresh, the silent reload a
// registration change triggers) must NOT write it back unless the load-time self-heal actually
// changed something that is persisted. The VM marks the board a no-repair load applied
// (cleanLoadedChipRef) and its auto-save skips exactly that board; a real TD action produces a
// new board and saves as always. `LoadSaveModel` below mirrors those VM rules 1:1 (load(),
// setChip, the auto-save effect) using the same helpers the VM calls.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  beginShuffle,
  emptyChipState,
  finalizeReshuffle,
  newId,
  recordWinner,
  returnActiveMatchesToQueue,
  startAllMatches,
  startChipTournament,
} from "../../models/services/chip.engine";
import { chipAutoSaveNeeded, healLoadedChip, loadRepairChanged } from "../../models/services/chip.load-heal";
import { ChipEntry, ChipFormat, ChipState } from "../../models/types/chip.types";

const entry = (name: string, doubles: boolean): ChipEntry =>
  ({
    id: newId("e"), p1Name: `${name}1`, p1Fargo: 500, p1Phone: "",
    p2Name: doubles ? `${name}2` : "", p2Fargo: doubles ? 500 : null, teamFargo: doubles ? 1000 : 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;

const live = (format: ChipFormat = "singles"): ChipState => {
  const doubles = format === "scotch_doubles";
  let s = emptyChipState(format);
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGH".split("").map((c) => entry(c, doubles)) };
  s = addTables(s, 3);
  return healLoadedChip(startAllMatches(startChipTournament(s)));
};
const act = (s: ChipState, fn: (c: ChipState) => ChipState) => healLoadedChip(fn(s));
const winOne = (s: ChipState) => {
  const m = s.matches.find((x) => x.status === "in_progress")!;
  return act(s, (c) => recordWinner(c, m.id, m.aId));
};
// What chipService.load hands back: a fresh object graph with the saved content.
const fromCloud = (s: ChipState): ChipState => JSON.parse(JSON.stringify(s));

// ── VM load / auto-save model ───────────────────────────────────────────────
class LoadSaveModel {
  chip: ChipState | null = null;
  cleanLoaded: ChipState | null = null;
  saves: ChipState[] = [];
  // load(): heal, mark the board clean when the repair changed nothing, setChip.
  load(cloud: ChipState) {
    const healed = healLoadedChip(cloud);
    this.cleanLoaded = loadRepairChanged(cloud, healed) ? null : healed;
    this.setChip(healed);
  }
  // A TD action (update()).
  action(fn: (c: ChipState) => ChipState) {
    this.setChip(act(this.chip!, fn));
  }
  private setChip(next: ChipState) {
    if (next === this.chip) return; // React bails out: no effect run
    this.chip = next;
    // the auto-save effect
    if (chipAutoSaveNeeded(next, this.cleanLoaded)) this.saves.push(next);
  }
}

const states: [string, () => ChipState][] = [
  ["fresh live board", () => live()],
  ["after results", () => winOne(winOne(live()))],
  ["Scotch Doubles after results", () => winOne(live("scotch_doubles"))],
  [
    "mid Shuffle round",
    () => {
      let s = live();
      s = act(s, returnActiveMatchesToQueue);
      s = act(s, beginShuffle);
      return act(s, (c) => finalizeReshuffle(c, null));
    },
  ],
];

for (const [name, make] of states) {
  test(`A. unchanged load does not save — ${name}`, () => {
    const saved = make();
    const cloud = fromCloud(saved);
    assert.equal(loadRepairChanged(cloud, healLoadedChip(cloud)), false, "a consistent board needs no repair");
    const vm = new LoadSaveModel();
    vm.load(cloud);
    assert.equal(vm.saves.length, 0, "load / refresh never writes an unchanged board");
  });
}

test("A. a real TD action after a clean load saves exactly once", () => {
  const vm = new LoadSaveModel();
  vm.load(fromCloud(live()));
  assert.equal(vm.saves.length, 0);
  const m = vm.chip!.matches.find((x) => x.status === "in_progress")!;
  vm.action((c) => recordWinner(c, m.id, m.aId));
  assert.equal(vm.saves.length, 1, "the action's board is saved");
  assert.equal(vm.saves[0].matches.find((x) => x.id === m.id)!.status, "finished");
});

test("B. a load whose self-heal repairs the board saves the repaired board", () => {
  const saved = winOne(live());
  // (1) an alive entry dropped out of the queue (stale config write)
  const lost = saved.queue[0];
  const missingFromQueue = fromCloud({ ...saved, queue: saved.queue.filter((id) => id !== lost) });
  // (2) a 0-chip entry that was never eliminated (manual adjust / seeded data)
  const zero = saved.entries.find((e) => e.status === "queued")!;
  const zeroChips = fromCloud({
    ...saved,
    entries: saved.entries.map((e) => (e.id === zero.id ? { ...e, chips: 0 } : e)),
  });
  for (const [label, cloud, check] of [
    ["missing queue entry", missingFromQueue, (s: ChipState) => s.queue.includes(lost)],
    ["0-chip entry", zeroChips, (s: ChipState) => s.entries.find((e) => e.id === zero.id)!.status === "eliminated"],
  ] as [string, ChipState, (s: ChipState) => boolean][]) {
    const healed = healLoadedChip(cloud);
    assert.equal(loadRepairChanged(cloud, healed), true, `${label}: repair detected`);
    const vm = new LoadSaveModel();
    vm.load(cloud);
    assert.equal(vm.saves.length, 1, `${label}: the repaired board is saved once`);
    assert.ok(check(vm.saves[0]), `${label}: the saved board carries the repair`);
    // Reloading the now-repaired cloud board is clean again.
    const vm2 = new LoadSaveModel();
    vm2.load(fromCloud(vm.saves[0]));
    assert.equal(vm2.saves.length, 0, `${label}: next load of the repaired board does not save`);
  }
});

test("C. registration-triggered refetch of an unchanged board does not re-save", () => {
  const saved = winOne(live());
  const vm = new LoadSaveModel();
  vm.load(fromCloud(saved));
  // Registration Realtime → silent reload(s) of the same cloud content (new object each time).
  vm.load(fromCloud(saved));
  vm.load(fromCloud(saved));
  assert.equal(vm.saves.length, 0, "no refetch writes the unchanged snapshot back");
  // A refetch AFTER a TD action (whose save landed) is also clean.
  const m = vm.chip!.matches.find((x) => x.status === "in_progress")!;
  vm.action((c) => recordWinner(c, m.id, m.aId));
  assert.equal(vm.saves.length, 1);
  vm.load(fromCloud(vm.saves[0]));
  assert.equal(vm.saves.length, 1, "refetch of the just-saved board does not save it again");
});

test("chipAutoSaveNeeded: skips only the exact clean loaded board", () => {
  const s = live();
  assert.equal(chipAutoSaveNeeded(s, s), false);
  assert.equal(chipAutoSaveNeeded(s, null), true, "a repaired / non-load board saves");
  assert.equal(chipAutoSaveNeeded({ ...s }, s), true, "any new board (a TD action) saves");
});
