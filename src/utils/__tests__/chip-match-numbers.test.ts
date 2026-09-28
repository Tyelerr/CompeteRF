// src/utils/__tests__/chip-match-numbers.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-match-numbers.test.ts
// Tournament-wide Chip MATCH NUMBERING (utils/chip-match-numbers): one chronological sequence
// of VALID completed results across the whole tournament, derived from the persisted
// match_result / forfeit events — stable across reloads, never duplicated, renumbered cleanly
// after Undo / Restore, forfeits counted, voided matches never numbered.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  assignFinals,
  clearTable,
  emptyChipState,
  forfeitEntry,
  forfeitMatch,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  recordWinner,
  resetTableTimer,
  restoreToPoint,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { chipEventMatchNumber, chipHistoryMatches, chipMatchLabel, formatChipResultTime, numberChipMatches } from "../chip-match-numbers";
import { toPublicActivityFeed } from "../chip-activity";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

const entry = (name: string): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s)))));
// Mirrors the viewmodel's update(): pipeline + a restore point (+ a shared txId) per action.
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  let next = pipeline(fn(c));
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  if (added > 1) {
    const tx = newId("tx");
    next = { ...next, events: next.events.map((e, i) => (i < added ? { ...e, txId: tx } : e)) };
  }
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[ev.length - 1].text);
};
const liveState = (n = 6, tables = 2): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGH".slice(0, n).split("").map(entry) };
  s = addTables(s, tables);
  return startAllMatches(startChipTournament(s));
};
const tick = () => new Promise((r) => setTimeout(r, 3)); // distinct result timestamps
const live = (s: ChipState) => s.matches.find((m) => m.status === "in_progress");
const startPending = (s: ChipState) => {
  let out = s;
  for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) out = act(out, (c) => startPendingMatch(c, t.id));
  return out;
};
const win = async (s: ChipState, pick: "a" | "b" = "a") => {
  await tick();
  const ready = live(s) ? s : startPending(s);
  const m = live(ready)!;
  return act(ready, (c) => recordWinner(c, m.id, pick === "a" ? m.aId : m.bId));
};
const nums = (s: ChipState) => numberChipMatches(s).list.map((r) => [r.number, r.matchId]);

test("first/second/third valid results = Match 1/2/3, tournament-wide, completion time = result event", async () => {
  let s = liveState();
  s = await win(s);
  s = await win(s, "b");
  s = await win(s);
  const n = numberChipMatches(s);
  assert.deepEqual(n.list.map((r) => r.number), [1, 2, 3]);
  const results = s.events.filter((e) => e.type === "match_result").sort((a, b) => a.at.localeCompare(b.at));
  assert.deepEqual(n.list.map((r) => r.completedAt), results.map((e) => e.at), "time = result event time");
  assert.deepEqual(n.list.map((r) => r.eventId), results.map((e) => e.id));
  for (const r of n.list) {
    const m = s.matches.find((x) => x.id === r.matchId)!;
    assert.equal(r.winnerId, m.winnerId);
    assert.equal(r.loserId, m.loserId);
    assert.ok(r.durationMs != null && r.durationMs >= 0);
  }
  // a player's 2nd personal match keeps its tournament number
  const p = n.list[2].winnerId!;
  const mine = n.list.filter((r) => r.winnerId === p || r.loserId === p);
  assert.ok(mine.every((r) => n.byMatchId.get(r.matchId!)?.number === r.number));
});

test("reload / browser restart / cloud round trip: identical numbering (events newest-first, reordered, JSON)", async () => {
  let s = liveState();
  for (let i = 0; i < 5; i++) s = await win(s, i % 2 ? "a" : "b");
  const before = nums(s);
  const cloud: ChipState = JSON.parse(JSON.stringify(s));
  cloud.events = cloud.events.slice().reverse(); // any load order
  cloud.matches = cloud.matches.slice().reverse();
  assert.deepEqual(nums(cloud), before);
});

test("duplicate result events (retry / double insert) never create a duplicate Match #", async () => {
  let s = liveState();
  s = await win(s);
  s = await win(s);
  const dup = { ...s.events.find((e) => e.type === "match_result")!, id: newId("ev") };
  const withDup: ChipState = { ...s, events: [dup, ...s.events] };
  assert.equal(numberChipMatches(withDup).list.length, 2);
  assert.deepEqual(numberChipMatches(withDup).list.map((r) => r.number), [1, 2]);
});

test("Undo the latest result → excluded; the next result reuses the clean sequence", async () => {
  let s = liveState();
  s = await win(s);
  s = await win(s);
  s = await win(s);
  const undone = undoLastActions(s, 1, { reason: "test" });
  assert.deepEqual(numberChipMatches(undone).list.map((r) => r.number), [1, 2]);
  const again = await win(undone, "b"); // the match is replayed with a new result
  const n = numberChipMatches(again);
  assert.deepEqual(n.list.map((r) => r.number), [1, 2, 3]);
  const superseded = again.events.filter((e) => e.type === "match_result" && e.superseded);
  assert.equal(superseded.length, 1, "audit keeps the undone result (dimmed), unnumbered");
  assert.ok(!n.byEventId.has(superseded[0].id));
});

test("Restore past several results → reverted results excluded even if their records stay 'finished'", async () => {
  let s = liveState(8, 2);
  s = await win(s);
  const target = s.events.find((e) => e.type === "match_result")!; // restore to just before Match 1? use Match 2
  s = await win(s);
  const m2 = s.events.find((e) => e.type === "match_result" && e.id !== target.id)!;
  s = await win(s);
  s = await win(s);
  assert.equal(numberChipMatches(s).list.length, 4);
  const restored = restoreToPoint(s, m2.id, { reason: "test" });
  const n = numberChipMatches(restored);
  assert.deepEqual(n.list.map((r) => r.number), [1], "only Match 1 remains valid; no gaps");
  assert.equal(n.list[0].eventId, target.id);
  // replaying continues the sequence deterministically
  const replay = await win(restored);
  assert.deepEqual(numberChipMatches(replay).list.map((r) => r.number), [1, 2]);
});

test("Forfeit MATCH → one number (via its match_result), flagged forfeit, both events map to it", async () => {
  let s = liveState();
  s = await win(s);
  await tick();
  const m = live(s)!;
  s = act(s, (c) => forfeitMatch(c, m.bId, { reason: "No-show" }));
  const n = numberChipMatches(s);
  assert.deepEqual(n.list.map((r) => r.number), [1, 2]);
  assert.equal(n.list[1].forfeit, true);
  const f = s.events.find((e) => e.type === "forfeit")!;
  assert.equal(n.byEventId.get(f.id)?.number, 2);
});

test("Forfeit TOURNAMENT mid-match completes the live match → numbered (payload.matchId, and legacy events)", async () => {
  let s = liveState();
  s = await win(s);
  await tick();
  const m = live(s)!;
  s = act(s, (c) => forfeitEntry(c, m.aId, { reason: "Left" }));
  const n = numberChipMatches(s);
  assert.deepEqual(n.list.map((r) => [r.number, r.matchId, r.forfeit]), [
    [1, n.list[0].matchId, false],
    [2, m.id, true],
  ]);
  // legacy event (no matchId in payload) resolves to the same match
  const legacy: ChipState = {
    ...s,
    events: s.events.map((e) => (e.type === "forfeit" ? { ...e, payload: { ...e.payload, matchId: undefined } } : e)),
  };
  assert.equal(numberChipMatches(legacy).byMatchId.get(m.id)?.number, 2);
});

test("voided matches (Clear Table) are never numbered", async () => {
  let s = liveState();
  s = await win(s);
  s = startPending(s);
  const t = s.tables.find((x) => x.matchId)!;
  s = act(s, (c) => clearTable(c, t.id, "end"));
  assert.deepEqual(numberChipMatches(s).list.map((r) => r.number), [1]);
});

test("waiting-timer reset rewrites endedAt but never moves a Match # or its time", async () => {
  let s = liveState(6, 1);
  s = await win(s);
  const before = numberChipMatches(s).list.map((r) => [r.number, r.completedAt]);
  await tick();
  const t = s.tables.find((x) => x.holderId)!;
  const reset = act(s, (c) => resetTableTimer(c, t.id));
  assert.deepEqual(numberChipMatches(reset).list.map((r) => [r.number, r.completedAt]), before);
});

test("same-millisecond results: deterministic event-id tie-break", () => {
  const s = liveState();
  const at = new Date().toISOString();
  const [m1, m2] = s.matches;
  const mk = (id: string, matchId: string) => ({ id, type: "match_result" as const, at, text: "x", payload: { matchId } });
  const done = (m: typeof m1) => ({ ...m, status: "finished" as const, winnerId: m.aId, loserId: m.bId, endedAt: at });
  const base: ChipState = { ...s, matches: [done(m1), done(m2)] };
  const a = numberChipMatches({ ...base, events: [mk("ev_b", m2.id), mk("ev_a", m1.id)] });
  const b = numberChipMatches({ ...base, events: [mk("ev_a", m1.id), mk("ev_b", m2.id)] });
  assert.deepEqual(a.list.map((r) => r.matchId), [m1.id, m2.id]);
  assert.deepEqual(b.list.map((r) => r.matchId), [m1.id, m2.id]);
});

test("labels: full 'Match 17' by default, 'M17' only when compact; time like the activity log", () => {
  assert.equal(chipMatchLabel(17), "Match 17");
  assert.equal(chipMatchLabel(17, true), "M17");
  assert.match(formatChipResultTime("2026-09-26T04:26:00.000Z"), /^\d{1,2}:\d{2} (AM|PM)$/);
});

test("one label per result: only the anchor event carries the number; unrelated activity never does", async () => {
  let s = liveState();
  s = await win(s);
  await tick();
  const m = live(s)!;
  s = act(s, (c) => forfeitMatch(c, m.bId, { reason: "No-show" }));
  const n = numberChipMatches(s);
  const labelled = s.events.filter((e) => chipEventMatchNumber(n, e)).map((e) => [e.type, chipEventMatchNumber(n, e)!.number]);
  assert.deepEqual(labelled.sort(), [["match_result", 1], ["match_result", 2]]);
  // spectator feed: the same numbers on the result lines only
  const feed = toPublicActivityFeed(s.events, Infinity, n);
  assert.deepEqual(
    feed.filter((a) => a.matchNumber != null).map((a) => [a.kind, a.matchNumber]).sort(),
    [["result", 1], ["result", 2]],
  );
  assert.ok(feed.filter((a) => a.kind !== "result").every((a) => a.matchNumber == null));
});

test("history lists hide reverted results but keep legacy results that never had an event", async () => {
  let s = liveState(8, 2);
  s = await win(s);
  const first = s.events.find((e) => e.type === "match_result")!;
  s = await win(s);
  const second = s.events.find((e) => e.type === "match_result" && e.id !== first.id)!;
  s = await win(s);
  const restored = restoreToPoint(s, second.id, { reason: "test" });
  const n = numberChipMatches(restored);
  const hist = chipHistoryMatches(n, restored.matches);
  assert.deepEqual(hist.map((h) => h.n?.number ?? null), [1], "reverted-but-finished records are hidden");
  // legacy: a finished match with no result event at all still shows (unnumbered)
  const noEvents = { ...restored, events: [] };
  const legacy = chipHistoryMatches(numberChipMatches(noEvents), noEvents.matches);
  assert.ok(legacy.length >= 1 && legacy.every((h) => h.n === null));
});
