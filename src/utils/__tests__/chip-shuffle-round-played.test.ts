// src/utils/__tests__/chip-shuffle-round-played.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-shuffle-round-played.test.ts
// Shuffle Mode "PLAYED THIS ROUND" = a VALID completed result in the CURRENT round
// (utils/chip-round-participation), never just being seated / assigned / in a voided match.
// Drives a real round through the engine: begin shuffle → reshuffle (round opens with
// announced matchups) → remove / clear / start / record / undo.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  assignFinals,
  assignNextTeam,
  beginShuffle,
  clearTable,
  emptyChipState,
  finalizeReshuffle,
  forfeitEntry,
  forfeitMatch,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  reconcileShuffleRound,
  recordWinner,
  removeFromTable,
  returnActiveMatchesToQueue,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { chipRoundPlayedIds, chipRoundStatusFor } from "../chip-round-participation";
import { ChipEntry, ChipState, ChipTable } from "../../models/types/chip.types";

const entry = (name: string): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
// Mirrors the VM: load chain + per-action pipeline both end with the round self-heal.
const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileShuffleRound(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s))))));
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
const tick = () => new Promise((r) => setTimeout(r, 3));

// A live tournament that has just entered Shuffle round 1 (opening matchups announced).
const shuffleRound = (): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGHIJ".split("").map(entry) };
  s = addTables(s, 2);
  s = pipeline(startAllMatches(startChipTournament(s)));
  s = act(s, (c) => returnActiveMatchesToQueue(c)); // empty the board (not a round yet)
  s = act(s, (c) => beginShuffle(c));
  s = act(s, (c) => finalizeReshuffle(c, null));
  assert.equal(s.shuffleRound, true, "round in progress");
  return s;
};
const seated = (t: ChipTable) => [t.holderId, t.pendingChallengerId].filter((x): x is string => !!x);
const status = (s: ChipState, id: string) => chipRoundStatusFor(s, chipRoundPlayedIds(s), id);
const played = (s: ChipState) => chipRoundPlayedIds(s);
const startAndWin = async (s: ChipState, t: ChipTable, winnerId: string) => {
  await tick();
  let x = act(s, (c) => startPendingMatch(c, t.id));
  const m = x.matches.find((mm) => mm.status === "in_progress" && mm.tableId === t.id)!;
  await tick();
  x = act(x, (c) => recordWinner(c, m.id, winnerId));
  return { s: x, match: m };
};

test("seated / assigned is NOT played; removing before a result gives the turn back", () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a, b] = seated(t);
  assert.equal(played(s).size, 0, "nobody has played at the start of the round");
  assert.ok(!s.roundRemaining!.includes(b), "seating took B off the owed-a-turn list");
  s = act(s, (c) => removeFromTable(c, t.id, b, "end"));
  assert.equal(status(s, b), "waiting", "B is owed a turn again — NOT 'played'");
  assert.ok(s.roundRemaining!.includes(b), "and is seatable again this round");
  assert.equal(played(s).has(a), false);
  assert.equal(played(s).has(b), false);
});

test("a completed result marks BOTH played; the winner stays seated and stays played", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a, c] = seated(t);
  ({ s } = await startAndWin(s, t, a));
  assert.ok(played(s).has(a) && played(s).has(c));
  assert.equal(s.tables.find((x) => x.id === t.id)!.holderId, a, "winner stays at the table");
  assert.equal(status(s, c), "played", "loser back in the queue = played");
  // winner-stays: a later match of the same holder doesn't change it
  const t2 = s.tables.find((x) => x.id === t.id)!;
  if (t2.pendingChallengerId) {
    const next = t2.pendingChallengerId;
    ({ s } = await startAndWin(s, t2, a));
    assert.ok(played(s).has(a) && played(s).has(next));
  }
});

test("voided live match (Remove Player / Clear Table) never counts; a later real match does", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [h, d] = seated(t);
  await tick();
  s = act(s, (c) => startPendingMatch(c, t.id)); // match started…
  s = act(s, (c) => removeFromTable(c, t.id, d, "next")); // …then voided by Remove Player
  assert.equal(played(s).has(d), false);
  assert.equal(played(s).has(h), false, "the opponent didn't play either");
  assert.equal(status(s, d), "waiting");
  // Clear Table on another occupied table: both back, both still owed a turn
  const other = s.tables.find((x) => x.id !== t.id && (x.holderId || x.matchId))!;
  const both = seated(other);
  s = act(s, (c) => clearTable(c, other.id, "end"));
  for (const id of both) assert.equal(status(s, id), "waiting");
  // D (sent "next" in queue, owed a turn) can be seated again this round and his later REAL
  // match counts. Assign Next Team seats the front-most round-eligible entry.
  const tD = s.tables.find((x) => x.holderId === h)!;
  assert.equal(s.queue[0], d);
  s = act(s, (c) => assignNextTeam(c, tD.id));
  const withD = s.tables.find((x) => x.id === tD.id)!;
  assert.equal(withD.pendingChallengerId, d, "D is seatable again this round");
  ({ s } = await startAndWin(s, withD, d));
  assert.ok(played(s).has(d) && played(s).has(h));
});

test("a player who already played is NOT given a second turn when their table is cleared", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a] = seated(t);
  ({ s } = await startAndWin(s, t, a)); // a won, stays as holder
  s = act(s, (c) => clearTable(c, t.id, "end"));
  assert.equal(s.roundRemaining!.includes(a), false, "no extra turn for a player who played");
  assert.equal(status(s, a), "played");
});

test("Undo removes the participation; replay restores it", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a, c] = seated(t);
  ({ s } = await startAndWin(s, t, a));
  assert.ok(played(s).has(a) && played(s).has(c));
  const undone = undoLastActions(s, 1, { reason: "test" });
  assert.equal(played(undone).has(a), false, "undone result no longer counts");
  assert.equal(played(undone).has(c), false);
  // replay the (restored-live) match
  const m = undone.matches.find((mm) => mm.status === "in_progress" && mm.tableId === t.id)!;
  await tick();
  const replay = act(undone, (x) => recordWinner(x, m.id, c));
  assert.ok(played(replay).has(a) && played(replay).has(c));
});

test("forfeits: Forfeit Match = both played; Forfeit Tournament with no live match = not played", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a, b] = seated(t);
  await tick();
  s = act(s, (c) => startPendingMatch(c, t.id));
  await tick();
  s = act(s, (c) => forfeitMatch(c, b, { reason: "No-show" }));
  assert.ok(played(s).has(a) && played(s).has(b));
  // someone in the queue forfeits the tournament (no match) → not "played"
  const queued = s.queue.find((id) => !played(s).has(id))!;
  s = act(s, (c) => forfeitEntry(c, queued, { reason: "Left" }));
  assert.equal(played(s).has(queued), false);
});

test("the count is exactly the entries with a valid result this round; previous rounds don't carry over", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a, c] = seated(t);
  ({ s } = await startAndWin(s, t, a));
  assert.deepEqual([...played(s)].sort(), [a, c].sort());
  // cloud round trip / reload keeps it identical
  const reloaded: ChipState = JSON.parse(JSON.stringify(s));
  reloaded.events = reloaded.events.slice().reverse();
  assert.deepEqual([...played(reloaded)].sort(), [a, c].sort());
  // outside a shuffle round: nothing is "played"
  assert.equal(played({ ...s, shuffleRound: false }).size, 0);
});

// ── Round self-heal (reconcileShuffleRound) ──────────────────────────────────────────────────
const noDupes = (s: ChipState) => {
  assert.equal(new Set(s.roundRemaining).size, s.roundRemaining!.length, "no duplicate ids in roundRemaining");
  assert.equal(new Set(s.queue).size, s.queue.length, "no duplicate ids in the queue");
};
// Old behavior: Remove Player took the entry off the table but never gave the turn back.
const legacyDropTurn = (s: ChipState, id: string): ChipState => ({
  ...s,
  roundRemaining: s.roundRemaining!.filter((x) => x !== id),
});

test("self-heal: historical false positive (queued, no result, not owed) is owed a turn again", () => {
  const s = shuffleRound();
  const x = s.queue.find((id) => s.roundRemaining!.includes(id))!;
  const broken = legacyDropTurn(s, x);
  assert.equal(status(broken, x), null, "no longer shows 'played' under the new rule");
  const healed = reconcileShuffleRound(broken);
  assert.ok(healed.roundRemaining!.includes(x));
  assert.equal(status(healed, x), "waiting");
  assert.deepEqual(healed.queue, broken.queue, "queue order untouched");
  noDupes(healed);
  assert.equal(reconcileShuffleRound(healed), healed, "idempotent");
});

test("self-heal: seated with no result is NOT played and NOT duplicated into roundRemaining", () => {
  const s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const healed = reconcileShuffleRound(s);
  for (const id of seated(t)) {
    assert.equal(played(healed).has(id), false);
    assert.equal(healed.roundRemaining!.includes(id), false, "receiving their turn — not owed another");
  }
  noDupes(healed);
});

test("self-heal: valid winner (stays) and loser are Played and never re-added", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a, c] = seated(t);
  ({ s } = await startAndWin(s, t, a));
  const cleared = act(s, (x) => clearTable(x, t.id, "end"));
  const healed = reconcileShuffleRound(legacyDropTurn(legacyDropTurn(cleared, a), c));
  assert.equal(healed.roundRemaining!.includes(a), false);
  assert.equal(healed.roundRemaining!.includes(c), false);
  assert.equal(status(healed, a), "played");
  assert.equal(status(healed, c), "played");
});

test("self-heal: Undo of the ONLY result → not played; owed a turn once unseated", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a, c] = seated(t);
  ({ s } = await startAndWin(s, t, a));
  const undone = pipeline(undoLastActions(s, 1, { reason: "test" }));
  assert.equal(played(undone).has(c), false);
  assert.equal(undone.roundRemaining!.includes(c), false, "match live again → seated → not re-owed");
  const voided = act(undone, (x) => clearTable(x, t.id, "end"));
  assert.ok(voided.roundRemaining!.includes(c) && voided.roundRemaining!.includes(a));
  noDupes(voided);
});

test("self-heal: two results, one undone → still Played, never re-owed", async () => {
  let s = shuffleRound();
  const t = s.tables.find((x) => x.holderId && x.pendingChallengerId)!;
  const [a] = seated(t);
  ({ s } = await startAndWin(s, t, a)); // result 1
  s = act(s, (x) => assignNextTeam(x, t.id));
  const t2 = s.tables.find((x) => x.id === t.id)!;
  assert.ok(t2.pendingChallengerId, "a challenger was assigned");
  ({ s } = await startAndWin(s, t2, a)); // result 2
  const undone = pipeline(undoLastActions(s, 1, { reason: "test" })); // undo result 2 only
  assert.ok(played(undone).has(a), "result 1 still valid");
  const cleared = act(undone, (x) => clearTable(x, t.id, "end"));
  assert.equal(cleared.roundRemaining!.includes(a), false, "never re-owed");
});

test("self-heal: eliminated / forfeited-out players are never healed back into the round", () => {
  let s = shuffleRound();
  const x = s.queue.find((id) => s.roundRemaining!.includes(id))!;
  s = act(s, (c) => forfeitEntry(c, x, { reason: "Left" }));
  const healed = reconcileShuffleRound(legacyDropTurn(s, x));
  assert.equal(healed.roundRemaining!.includes(x), false);
  assert.equal(healed.queue.includes(x), false);
});

test("self-heal: a player eliminated then brought back mid-round waits for the next reshuffle (existing rule)", () => {
  let s = shuffleRound();
  const x = s.queue.find((id) => s.roundRemaining!.includes(id))!;
  s = act(s, (c) => forfeitEntry(c, x, { reason: "Left" }));
  const back: ChipState = {
    ...s,
    entries: s.entries.map((e) => (e.id === x ? { ...e, status: "queued" as const, chips: 1, tableId: null } : e)),
    queue: [...s.queue, x],
  };
  const healed = reconcileShuffleRound(back);
  assert.equal(healed.roundRemaining!.includes(x), false, "eliminated during this round → not re-owed");
});

test("self-heal: the round cannot complete while an unplayed, unseated participant is owed a turn", async () => {
  let s = shuffleRound();
  for (const t of s.tables.filter((x) => x.holderId && x.pendingChallengerId)) {
    await tick();
    s = act(s, (c) => startPendingMatch(c, t.id));
  }
  const broken: ChipState = { ...s, roundRemaining: [] }; // every queued turn dropped (legacy)
  const live = broken.matches.find((m) => m.status === "in_progress")!;
  const unhealed = recordWinner(broken, live.id, live.aId);
  assert.equal(unhealed.reshufflePending, true, "old state: the round ends early");
  const healed = reconcileShuffleRound(broken);
  assert.ok(healed.roundRemaining!.length > 0);
  const after = recordWinner(healed, live.id, live.aId);
  assert.equal(!!after.reshufflePending, false, "round keeps going until they play");
});

test("self-heal: reload / reconnect produces the same repaired state (deterministic)", () => {
  const s = shuffleRound();
  const x = s.queue.find((id) => s.roundRemaining!.includes(id))!;
  const broken = legacyDropTurn(s, x);
  const a = reconcileShuffleRound(broken);
  const reloaded: ChipState = JSON.parse(JSON.stringify(broken));
  reloaded.events = reloaded.events.slice().reverse();
  const b = reconcileShuffleRound(reloaded);
  assert.deepEqual(b.roundRemaining, a.roundRemaining);
  assert.deepEqual(b.queue, a.queue);
});

test("self-heal: legacy round without a recorded line-up still heals (fallback rules)", () => {
  const s = shuffleRound();
  const x = s.queue.find((id) => s.roundRemaining!.includes(id))!;
  const legacy: ChipState = {
    ...legacyDropTurn(s, x),
    events: s.events.map((e) => (e.payload?.act === "reshuffled" ? { ...e, payload: { act: "reshuffled" } } : e)),
  };
  assert.ok(reconcileShuffleRound(legacy).roundRemaining!.includes(x));
});
