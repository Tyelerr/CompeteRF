// src/utils/__tests__/chip-shuffle-reliability.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-shuffle-reliability.test.ts
// Shuffle / gameplay reliability (audit bugs #5–#11), driven through the real engine and the
// SAME post-action settle the VM runs after every action (settleChipState):
//   A  Clear Table leaves one owed team and no possible match → the round settles
//   B  chip adjustment to 0 leaves no possible matchup → the round settles
//   C  Forfeit Tournament ends the round's last match → the round completes (not stuck)
//   D  Remove Player leaves the seated opponent with no result → round does NOT complete early
//   E  Manually Assign a team that already played this round → refused / only eligible teams
//   F  Assign Next Team during a drain → refused
//   G  Manually Assign during a drain → refused
//   H  a seated, not-started matchup → NOT Ready to Shuffle
//   I  once it resolves → Ready to Shuffle, and Start Shuffle really starts the next round
//   J  one team alive after a non-match elimination → champion declared
//   K  Undo / Restore around these states
//   L  Scotch Doubles equivalents (every scenario runs for both formats)
// plus: the failed-pair queue reorder is gone, and the existing good behavior still holds.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  adjustChips,
  assignNextTeam,
  assignSpecificTeam,
  beginShuffle,
  buyBackEntry,
  canAssignNextTeam,
  clearTable,
  emptyChipState,
  finalizeReshuffle,
  forfeitEntry,
  manualAssignCandidates,
  newId,
  recordWinner,
  removeFromTable,
  returnActiveMatchesToQueue,
  setTableLocked,
  settleChipState,
  shuffleRoundOutstanding,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  startShuffle,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { chipRoundPlayedIds } from "../chip-round-participation";
import { numberChipMatches } from "../chip-match-numbers";
import { ChipEntry, ChipFormat, ChipState, ChipTable } from "../../models/types/chip.types";

const entry = (name: string, doubles: boolean): ChipEntry =>
  ({
    id: newId("e"), p1Name: `${name}1`, p1Fargo: 500, p1Phone: "",
    p2Name: doubles ? `${name}2` : "", p2Fargo: doubles ? 500 : null, teamFargo: doubles ? 1000 : 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;

// VM update(): the shared settle + a persisted restore point for logged actions.
const P = settleChipState;
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  let next = P(fn(c));
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
const REASON = { reason: "Director mistake" };

// A live event (3 chips each) that has just opened Shuffle round 1 (matchups announced).
const round = async (format: ChipFormat, n: number, tables: number): Promise<ChipState> => {
  const doubles = format === "scotch_doubles";
  let s = emptyChipState(format);
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: "ABCDEFGHIJ".slice(0, n).split("").map((c) => entry(c, doubles)) };
  s = addTables(s, tables);
  s = P(startAllMatches(startChipTournament(s)));
  s = act(s, returnActiveMatchesToQueue);
  s = act(s, (c) => beginShuffle(c));
  s = act(s, (c) => finalizeReshuffle(c, null));
  assert.equal(s.shuffleRound, true, "round in progress");
  await tick();
  return s;
};
const pendingTables = (s: ChipState) => s.tables.filter((t) => t.holderId && t.pendingChallengerId && !t.matchId);
const liveMatchOn = (s: ChipState, t: ChipTable) =>
  s.matches.find((m) => m.status === "in_progress" && m.id === s.tables.find((x) => x.id === t.id)!.matchId)!;
const startAndWin = async (s: ChipState, tableId: string, pick: "a" | "b" = "a") => {
  let x = act(s, (c) => startPendingMatch(c, tableId));
  await tick();
  const m = x.matches.find((mm) => mm.status === "in_progress" && mm.tableId === tableId)!;
  x = act(x, (c) => recordWinner(c, m.id, pick === "a" ? m.aId : m.bId));
  await tick();
  return { s: x, m };
};
const roundComplete = (s: ChipState) => !!s.reshufflePending && !!s.shuffleRound;
const owedQueued = (s: ChipState) => s.queue.filter((id) => (s.roundRemaining ?? []).includes(id));
const FORMATS: ChipFormat[] = ["singles", "scotch_doubles"];

for (const format of FORMATS) {
  // 1 table, 4 teams: opening X v Y → X wins, Z pending (W owed) → X v Z → X wins, W pending.
  const oneTableEndOfRound = async () => {
    let s = await round(format, 4, 1);
    const t = s.tables[0];
    ({ s } = await startAndWin(s, t.id));
    ({ s } = await startAndWin(s, t.id));
    assert.equal(pendingTables(s).length, 1, "the last owed team is seated as pending");
    assert.equal(owedQueued(s).length, 0);
    return { s, t };
  };

  test(`${format} A: Clear Table leaves one owed team and no possible match → round settles`, async () => {
    const { s: s0, t } = await oneTableEndOfRound();
    const raw = clearTable(s0, t.id, "end");
    assert.equal(owedQueued(raw).length, 1, "the cleared pending team is owed again");
    assert.equal(shuffleRoundOutstanding(raw), false, "…and nobody can play it");
    const s = act(s0, (c) => clearTable(c, t.id, "end"));
    assert.equal(roundComplete(s), true, "round completed instead of 'Waiting for Next Round' forever");
    assert.equal(s.shuffleReady, true, "nothing live → ready to shuffle");
    // Start Shuffle really starts the next round.
    const next = act(s, (c) => startShuffle(c));
    assert.equal(next.reshuffleCount, (s.reshuffleCount ?? 0) + 1);
    assert.equal(next.shuffleRound, true);
    assert.equal(next.reshufflePending, false);
  });

  test(`${format} B: chip adjustment to 0 leaves no possible matchup → round settles`, async () => {
    let s = await round(format, 4, 1);
    const t = s.tables[0];
    ({ s } = await startAndWin(s, t.id)); // X holder, Z pending, W owed
    s = act(s, (c) => clearTable(c, t.id, "end")); // Z owed again → two owed, empty table
    const owed = owedQueued(s);
    assert.equal(owed.length, 2);
    assert.equal(roundComplete(s), false, "two owed teams can still play each other");
    const victim = s.entries.find((e) => e.id === owed[0])!;
    const raw = adjustChips(s, victim.id, -victim.chips, REASON);
    assert.equal(owedQueued(raw).length, 1, "one owed team left");
    s = act(s, (c) => adjustChips(c, victim.id, -victim.chips, REASON));
    assert.equal(s.entries.find((e) => e.id === victim.id)!.status, "eliminated");
    assert.equal(roundComplete(s), true, "one owed team, nobody to play → round completes");
    assert.equal(s.shuffleReady, true);
  });

  test(`${format} C: Forfeit Tournament on the round's last match → round completes (not stuck)`, async () => {
    const { s: s0, t } = await oneTableEndOfRound();
    // RAW engine calls (no post-action settle) — forfeitEntry itself must run the shared
    // round-completion rule, exactly like recordWinner.
    let raw = startPendingMatch(s0, t.id);
    await tick();
    const m = raw.matches.find((mm) => mm.status === "in_progress")!;
    raw = forfeitEntry(raw, m.bId, { reason: "Player left" });
    assert.equal(raw.reshufflePending, true, "forfeitEntry drained the finished round");
    assert.equal(raw.shuffleReady, true);
    // And the VM path agrees.
    let vm = act(s0, (c) => startPendingMatch(c, t.id));
    await tick();
    const m2 = vm.matches.find((mm) => mm.status === "in_progress")!;
    vm = act(vm, (c) => forfeitEntry(c, m2.bId, { reason: "Player left" }));
    assert.equal(roundComplete(vm), true);
    assert.equal(vm.shuffleReady, true);
  });

  test(`${format} D: Remove Player leaves the opponent seated with no result → round waits for them`, async () => {
    // 2 tables, 4 teams: both opening matches live (audit scenario 1).
    let s = await round(format, 4, 2);
    s = act(s, (c) => startAllMatches(c));
    await tick();
    assert.equal(roundComplete(s), false, "starting the last matchups doesn't end the round");
    const [t1, t2] = s.tables;
    const m2 = liveMatchOn(s, t2);
    const removed = m2.aId;
    const stays = m2.bId;
    s = act(s, (c) => removeFromTable(c, t2.id, removed, "end"));
    assert.equal(s.tables.find((t) => t.id === t2.id)!.holderId, stays, "opponent stays seated, unplayed");
    assert.ok(!chipRoundPlayedIds(s).has(stays));
    // Table 1's result: the owed (removed) team must be seated against the UNPLAYED holder.
    const m1 = liveMatchOn(s, t1);
    s = act(s, (c) => recordWinner(c, m1.id, m1.aId));
    await tick();
    assert.equal(roundComplete(s), false, "round must not complete while the seated team is unplayed");
    const t2now = s.tables.find((t) => t.id === t2.id)!;
    assert.equal(t2now.holderId, stays);
    assert.equal(t2now.pendingChallengerId, removed, "unplayed holder served first");
    ({ s } = await startAndWin(s, t2.id));
    assert.ok(chipRoundPlayedIds(s).has(stays), "the seated team got its turn");
    assert.equal(roundComplete(s), true, "now everyone played → round completes");
  });

  test(`${format} E: Manually Assign never seats a team that already played this round`, async () => {
    let s = await round(format, 4, 1);
    const t = s.tables[0];
    const { s: afterOne, m } = await startAndWin(s, t.id); // X holder, Z pending, W owed
    s = afterOne;
    const loser = m.bId; // played, queued at the back
    const pending = s.tables[0].pendingChallengerId!;
    s = act(s, (c) => removeFromTable(c, t.id, pending, "end")); // holder waits, pending owed again
    assert.ok(!manualAssignCandidates(s, t.id).includes(loser), "played team is not offered");
    assert.ok(manualAssignCandidates(s, t.id).includes(pending), "owed team is offered");
    const refused = act(s, (c) => assignSpecificTeam(c, t.id, loser));
    assert.equal(refused, s, "picking a played team is refused (state unchanged)");
    s = act(s, (c) => assignSpecificTeam(c, t.id, pending));
    assert.equal(s.tables[0].pendingChallengerId, pending);
    assert.ok(!(s.roundRemaining ?? []).includes(pending), "a manual pick is seated for the round");

    // Empty table: the partner must be round-eligible too (never the played team at the front).
    let e = afterOne;
    e = act(e, (c) => clearTable(c, t.id, "next")); // holder (played) + pending (owed) to the FRONT
    const owed = owedQueued(e);
    assert.equal(owed.length, 2);
    const played = e.queue.find((id) => chipRoundPlayedIds(e).has(id))!;
    assert.equal(e.queue[0], played, "a played team is first in line");
    assert.equal(manualAssignCandidates(e, t.id).includes(played), false);
    e = act(e, (c) => assignSpecificTeam(c, t.id, owed[1]));
    const live = e.matches.find((mm) => mm.status === "in_progress")!;
    assert.deepEqual(new Set([live.aId, live.bId]), new Set(owed), "paired with the other OWED team");
  });

  test(`${format} F+G: Assign Next Team / Manually Assign are refused while draining or ready`, async () => {
    let s = await round(format, 6, 2);
    s = act(s, (c) => startAllMatches(c));
    await tick();
    // TD starts a Shuffle mid-round → drain (live matches keep playing).
    s = act(s, (c) => returnActiveMatchesToQueue(c)); // empty tables to have something assignable
    s = act(s, (c) => finalizeReshuffle(c, null)); // fresh round
    s = act(s, (c) => startAllMatches(c));
    await tick();
    s = act(s, (c) => beginShuffle(c)); // initial drain, live matches keep playing
    assert.equal(s.reshufflePending, true);
    const t1 = s.tables[0];
    s = act(s, (c) => clearTable(c, t1.id, "end")); // an empty table during the drain
    assert.equal(canAssignNextTeam(s, t1.id), false);
    assert.equal(act(s, (c) => assignNextTeam(c, t1.id)), s, "F: Assign Next Team refused");
    assert.deepEqual(manualAssignCandidates(s, t1.id), []);
    const q = s.queue[0];
    assert.equal(act(s, (c) => assignSpecificTeam(c, t1.id, q)), s, "G: Manually Assign refused");
    assert.ok(!s.matches.some((m) => m.status === "in_progress" && m.tableId === t1.id));
  });

  test(`${format} H+I: a seated not-started matchup blocks Ready to Shuffle until resolved`, async () => {
    // Normal play (no round): 8 teams, 2 tables; start ONLY Table 1, then begin the shuffle.
    const doubles = format === "scotch_doubles";
    let s = emptyChipState(format);
    s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
    s = { ...s, entries: "ABCDEFGH".split("").map((c) => entry(c, doubles)) };
    s = addTables(s, 2);
    s = P(startChipTournament(s));
    const [t1, t2] = s.tables;
    s = act(s, (c) => startPendingMatch(c, t1.id));
    await tick();
    s = act(s, (c) => beginShuffle(c));
    const m1 = liveMatchOn(s, t1);
    s = act(s, (c) => recordWinner(c, m1.id, m1.aId));
    assert.equal(!!s.tables.find((t) => t.id === t2.id)!.pendingChallengerId, true, "Table 2 still seated");
    assert.equal(s.shuffleReady, false, "H: not Ready to Shuffle while a matchup is seated");
    assert.equal(act(s, (c) => startShuffle(c)), s, "and Start Shuffle can't be triggered");
    // I: the TD resolves Table 2 (plays it) → ready, and Start Shuffle really redraws.
    ({ s } = await startAndWin(s, t2.id));
    assert.equal(s.shuffleReady, true, "I: ready once the matchup resolved");
    const next = act(s, (c) => startShuffle(c));
    assert.equal(next.reshuffleCount, (s.reshuffleCount ?? 0) + 1, "Start Shuffle is not a silent no-op");
    // A legacy "ready" flag next to a seated matchup (initial drain) is revoked by the settle.
    const legacy = P({ ...next, shuffleRound: false, roundRemaining: [], reshufflePending: true, shuffleReady: true });
    assert.equal(legacy.shuffleReady, false);
  });

  test(`${format} J: one team alive after a non-match elimination → champion declared`, async () => {
    // Audit S7b: 3 teams, 1 chip each, 1 table; lock it, record a result, zero the queued finalist.
    const doubles = format === "scotch_doubles";
    let s = emptyChipState(format);
    s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 1 }] } };
    s = { ...s, entries: "ABC".split("").map((c) => entry(c, doubles)) };
    s = addTables(s, 1);
    s = P(startAllMatches(startChipTournament(s)));
    const t = s.tables[0];
    s = act(s, (c) => setTableLocked(c, t.id, true));
    const m = liveMatchOn(s, t);
    s = act(s, (c) => recordWinner(c, m.id, m.aId));
    assert.equal(s.entries.filter((e) => e.status !== "eliminated").length, 2);
    assert.equal(s.winnerId ?? null, null, "two alive → no champion yet");
    const queued = s.entries.find((e) => e.status !== "eliminated" && e.id !== m.aId)!;
    const before = s;
    s = act(s, (c) => adjustChips(c, queued.id, -1, REASON));
    assert.equal(s.winnerId, m.aId, "the last team standing is champion");
    assert.ok(s.finishedAt);
    assert.ok(s.events.some((e) => e.payload?.act === "champion"));
    // K: Undo the adjustment → two alive again, no champion.
    const undone = undoLastActions(s, 1, { reason: "test" });
    assert.equal(undone.winnerId ?? null, null);
    assert.equal(undone.finishedAt ?? null, null);
    assert.equal(undone.entries.filter((e) => e.status !== "eliminated").length, 2);
    assert.equal(before.entries.find((e) => e.id === queued.id)!.chips, undone.entries.find((e) => e.id === queued.id)!.chips);
  });

  test(`${format} K: Undo / Restore around a settled round keeps participation + completion right`, async () => {
    const { s: s0, t } = await oneTableEndOfRound();
    const playedBefore = [...chipRoundPlayedIds(s0)].sort();
    const cleared = act(s0, (c) => clearTable(c, t.id, "end"));
    assert.equal(roundComplete(cleared), true);
    const undone = undoLastActions(cleared, 1, { reason: "test" });
    assert.equal(roundComplete(undone), false, "undo reopens the round (the pending matchup is back)");
    assert.equal(pendingTables(undone).length, 1);
    assert.deepEqual([...chipRoundPlayedIds(undone)].sort(), playedBefore, "participation unchanged");
    // Play the restored matchup instead → the round completes normally.
    const { s: done } = await startAndWin(undone, t.id);
    assert.equal(roundComplete(done), true);
  });
}

test("failed pair attempt never reorders the queue (no hidden queue mutation)", async () => {
  const { s: s0, t } = await (async () => {
    let s = await round("singles", 4, 1);
    const tt = s.tables[0];
    ({ s } = await startAndWin(s, tt.id));
    ({ s } = await startAndWin(s, tt.id));
    return { s, t: tt };
  })();
  // After the clear the round completes; before settle, one owed team sits deep in the queue.
  const cleared = clearTable(s0, t.id, "end");
  const q = [...cleared.queue];
  // A seating attempt that can't pair (one owed team) leaves the order untouched.
  const tried = assignNextTeam(cleared, t.id);
  assert.deepEqual(tried.queue, q);
  assert.equal(shuffleRoundOutstanding(cleared), false);
});

test("still good: winner stays, valid result = played, voided/removed ≠ played, Match # intact", async () => {
  let s = await round("singles", 6, 2);
  const [t1] = s.tables;
  const opening = pendingTables(s).find((t) => t.id === t1.id)!;
  const [h, p] = [opening.holderId!, opening.pendingChallengerId!];
  // Voided (Clear Table) → not played; seated teams never duplicated into roundRemaining.
  let v = act(s, (c) => startPendingMatch(c, t1.id));
  await tick();
  v = act(v, (c) => clearTable(c, t1.id, "end"));
  assert.ok(!chipRoundPlayedIds(v).has(h) && !chipRoundPlayedIds(v).has(p));
  const rr = v.roundRemaining ?? [];
  assert.equal(new Set(rr).size, rr.length, "no duplicates in roundRemaining");
  // Removed before a result → not played.
  let r = act(s, (c) => startPendingMatch(c, t1.id));
  await tick();
  r = act(r, (c) => removeFromTable(c, t1.id, p, "end"));
  assert.ok(!chipRoundPlayedIds(r).has(p));
  // Valid result → played, winner stays.
  const { s: w, m } = await startAndWin(s, t1.id);
  assert.ok(chipRoundPlayedIds(w).has(m.aId) && chipRoundPlayedIds(w).has(m.bId));
  assert.equal(w.tables.find((t) => t.id === t1.id)!.holderId, m.aId, "winner stays");
  // Match # counts exactly the valid results.
  assert.equal(numberChipMatches(w).list.length, w.matches.filter((mm) => mm.status === "finished" && mm.winnerId).length);
  // Mid-round buy back waits for the next reshuffle (not owed this round).
  const victim = w.queue.find((id) => id !== m.aId)!;
  let b = act(w, (c) => adjustChips(c, victim, -c.entries.find((e) => e.id === victim)!.chips, REASON));
  assert.equal(b.entries.find((e) => e.id === victim)!.status, "eliminated");
  b = act(b, (c) => buyBackEntry(c, victim));
  assert.ok(!(b.roundRemaining ?? []).includes(victim), "bought back mid-round → next reshuffle");
  assert.equal(manualAssignCandidates(b, t1.id).includes(victim), false);
});
