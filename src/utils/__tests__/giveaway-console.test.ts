// src/utils/__tests__/giveaway-console.test.ts
// Run: npx tsx --test src/utils/__tests__/giveaway-console.test.ts
// Web desktop Giveaway Management console logic: corrected stats, filter/search/sort, the one
// primary action + ⋯ menu per status (must match the native card's rules), restore target, Ends.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConsoleGiveaway,
  capacityRatio,
  computeConsoleStats,
  countByStatus,
  filterAndSortGiveaways,
  getEndsLabel,
  getMenuActions,
  getPrimaryAction,
  getRestoreTarget,
} from "../giveaway-console";

const base: ConsoleGiveaway = {
  id: 1,
  name: "Base",
  description: null,
  status: "active",
  entry_mode: "legacy_single",
  prize_value: 10,
  max_entries: null,
  end_date: null,
  ended_at: null,
  created_at: "2026-03-01T00:00:00Z",
  published_at: "2026-03-01T00:00:00Z",
  winner_id: null,
  entry_count: 0,
};
const mk = (over: Partial<ConsoleGiveaway>): ConsoleGiveaway => ({ ...base, ...over });

// Mirrors production on 2026-10-01 (all legacy_single): 2 active, 1 awarded, archived incl. ones with winners.
const prodLike: ConsoleGiveaway[] = [
  mk({ id: 22, status: "active", prize_value: 28, max_entries: 50, entry_count: 39 }),
  mk({ id: 23, status: "active", prize_value: 569, max_entries: 1000, entry_count: 51 }),
  mk({ id: 28, status: "awarded", prize_value: 199, entry_count: 39, winner_id: 5 }),
  mk({ id: 9, status: "archived", prize_value: 50, entry_count: 1, winner_id: 6 }),
  mk({ id: 25, status: "archived", prize_value: 100, entry_count: 6, winner_id: 7 }),
  mk({ id: 27, status: "archived", prize_value: 23, entry_count: 41, winner_id: null }),
];

test("stats: entries count ACTIVE giveaways only; awarded includes archived winners; no duplicate active", () => {
  const s = computeConsoleStats(prodLike, 65);
  assert.equal(s.activeCount, 2);
  assert.equal(s.activePrizeValue, 597);
  assert.equal(s.activeEntries, 90); // not the all-time 177 in this fixture
  assert.equal(s.totalAwarded, 199 + 50 + 100); // archived winners included
  assert.equal(s.totalGiveaways, 6);
  assert.equal(s.uniqueParticipants, 65);
  assert.equal(Object.keys(s).length, 6);
});

test("stats: unknown unique participants stays null; empty list is all zeros", () => {
  const s = computeConsoleStats([], null);
  assert.deepEqual(s, {
    activeCount: 0, activePrizeValue: 0, activeEntries: 0, uniqueParticipants: null, totalAwarded: 0, totalGiveaways: 0,
  });
});

test("countByStatus covers every status filter", () => {
  const c = countByStatus([...prodLike, mk({ id: 2, status: "draft" }), mk({ id: 3, status: "cancelled" }), mk({ id: 4, status: "ended" })]);
  assert.deepEqual(c, { all: 9, draft: 1, active: 2, ended: 1, awarded: 1, archived: 3, cancelled: 1 });
});

test("filter by status, search by name/description/#id", () => {
  const list = [
    mk({ id: 10, name: "Axis Glove", status: "active" }),
    mk({ id: 11, name: "Cue Case", description: "Premium leather glove", status: "ended" }),
    mk({ id: 12, name: "Chalk", status: "archived" }),
  ];
  assert.deepEqual(filterAndSortGiveaways(list, "active", "", "newest").map((g) => g.id), [10]);
  assert.deepEqual(filterAndSortGiveaways(list, "all", "glove", "name").map((g) => g.id), [10, 11]);
  assert.deepEqual(filterAndSortGiveaways(list, "all", "#12", "newest").map((g) => g.id), [12]);
  assert.deepEqual(filterAndSortGiveaways(list, "archived", "glove", "newest"), []);
});

test("sorts: newest, oldest, name, entries, prize", () => {
  const list = [
    mk({ id: 1, name: "B", created_at: "2026-01-01T00:00:00Z", entry_count: 5, prize_value: 100 }),
    mk({ id: 2, name: "C", created_at: "2026-03-01T00:00:00Z", entry_count: 1, prize_value: 500 }),
    mk({ id: 3, name: "A", created_at: "2026-02-01T00:00:00Z", entry_count: 9, prize_value: 1 }),
  ];
  const ids = (s: Parameters<typeof filterAndSortGiveaways>[3]) => filterAndSortGiveaways(list, "all", "", s).map((g) => g.id);
  assert.deepEqual(ids("newest"), [2, 3, 1]);
  assert.deepEqual(ids("oldest"), [1, 3, 2]);
  assert.deepEqual(ids("name"), [3, 1, 2]);
  assert.deepEqual(ids("entries"), [3, 1, 2]);
  assert.deepEqual(ids("prize"), [2, 1, 3]);
  // input not mutated
  assert.deepEqual(list.map((g) => g.id), [1, 2, 3]);
});

test("primary action per status", () => {
  assert.deepEqual(getPrimaryAction(mk({ status: "draft" })), { kind: "publish", label: "Publish" });
  assert.deepEqual(getPrimaryAction(mk({ status: "active", max_entries: 50, entry_count: 10 })), { kind: "end", label: "End Early" });
  assert.deepEqual(getPrimaryAction(mk({ status: "active", max_entries: 50, entry_count: 50 })), { kind: "end", label: "End Giveaway" });
  assert.deepEqual(getPrimaryAction(mk({ status: "ended", entry_count: 3 })), { kind: "draw", label: "Draw Winner" });
  assert.deepEqual(getPrimaryAction(mk({ status: "ended", entry_count: 0 })), { kind: "draw", label: "No Entries", disabled: true });
  assert.deepEqual(getPrimaryAction(mk({ status: "awarded" })), { kind: "view_winner", label: "View Winner" });
  assert.deepEqual(getPrimaryAction(mk({ status: "archived" })), { kind: "restore", label: "Restore" });
  assert.equal(getPrimaryAction(mk({ status: "cancelled" })), null);
});

const kinds = (g: ConsoleGiveaway) => getMenuActions(g).map((a) => a.kind);

test("⋯ menu: same availability as the native card (legacy)", () => {
  assert.deepEqual(kinds(mk({ status: "draft" })), ["edit", "archive"]);
  assert.deepEqual(kinds(mk({ status: "active" })), ["edit", "participants"]);
  assert.deepEqual(kinds(mk({ status: "ended", entry_count: 4 })), ["edit", "participants", "archive"]);
  assert.deepEqual(kinds(mk({ status: "awarded", winner_id: 1 })), ["edit", "participants", "redraw", "archive"]);
  assert.deepEqual(kinds(mk({ status: "archived" })), ["participants", "restore"]);
  assert.deepEqual(kinds(mk({ status: "cancelled" })), ["participants"]);
});

test("⋯ menu: wallet — Cancel & Refund instead of Archive when entries were spent", () => {
  const w = (over: Partial<ConsoleGiveaway>) => mk({ entry_mode: "wallet", ...over });
  assert.deepEqual(kinds(w({ status: "active", entry_count: 0 })), ["edit", "participants", "cancel_refund"]);
  assert.deepEqual(kinds(w({ status: "ended", entry_count: 5 })), ["edit", "participants", "cancel_refund"]);
  assert.deepEqual(kinds(w({ status: "ended", entry_count: 0 })), ["edit", "participants", "archive"]);
  assert.ok(getMenuActions(w({ status: "active" })).find((a) => a.kind === "cancel_refund")?.destructive);
});

test("restore target mirrors giveawayService.restoreGiveaway", () => {
  assert.equal(getRestoreTarget({ winner_id: 4, published_at: "2026-01-01" }), "awarded");
  assert.equal(getRestoreTarget({ winner_id: null, published_at: "2026-01-01" }), "active"); // e.g. #27
  assert.equal(getRestoreTarget({ winner_id: null, published_at: null }), "draft");
});

test("Ends label: date, capacity, both, none, ended", () => {
  const d = "2026-04-13T12:00:00Z";
  assert.equal(getEndsLabel({ end_date: d, max_entries: null, ended_at: null, status: "active" }).primary, "Apr 13, 2026");
  assert.deepEqual(getEndsLabel({ end_date: null, max_entries: 50, ended_at: null, status: "active" }), { primary: "At 50 entries", secondary: null });
  assert.deepEqual(getEndsLabel({ end_date: d, max_entries: 1000, ended_at: null, status: "active" }), { primary: "Apr 13, 2026", secondary: "or at 1,000 entries" });
  assert.equal(getEndsLabel({ end_date: null, max_entries: null, ended_at: null, status: "draft" }).primary, "No end set");
  assert.equal(getEndsLabel({ end_date: null, max_entries: 1, ended_at: null, status: "active" }).primary, "At 1 entry");
  assert.equal(getEndsLabel({ end_date: null, max_entries: 5, ended_at: "2026-03-21T12:00:00Z", status: "archived" }).secondary, "Ended Mar 21, 2026");
});

test("capacity ratio", () => {
  assert.equal(capacityRatio({ max_entries: null, entry_count: 4 }), null);
  assert.equal(capacityRatio({ max_entries: 50, entry_count: 39 }), 0.78);
  assert.equal(capacityRatio({ max_entries: 2, entry_count: 9 }), 1);
});
