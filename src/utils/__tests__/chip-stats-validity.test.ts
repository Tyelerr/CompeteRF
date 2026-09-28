// src/utils/__tests__/chip-stats-validity.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-stats-validity.test.ts
// Chip STATS CORRECTNESS: every stat (Matches Played, avg / fastest / longest duration,
// Performance Rating sample, opponent Fargo, streak, Tables Used, Rematch-skipped opponent)
// counts only VALID finished matches (utils/chip-valid-matches = the Match # list), so Undo,
// Restore, voided matches and legacy no-winner rows never inflate them. Plus natural table
// sort, the public activity feed, and the client side of the public-read privacy migration.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addTables,
  assignFinals,
  clearTable,
  dashboard,
  emptyChipState,
  forfeitMatch,
  mostRecentOpponent,
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
import {
  chipCurrentStreak,
  chipEntryValidMatches,
  chipMatchSummary,
  chipValidMatches,
} from "../chip-valid-matches";
import { chipHistoryMatches, numberChipMatches } from "../chip-match-numbers";
import { toPublicActivityFeed } from "../chip-activity";
import { computePerformance } from "../performance";
import { naturalCompare } from "../natural-sort";
import { ChipEntry, ChipEvent, ChipMatch, ChipState } from "../../models/types/chip.types";

const entry = (name: string, fargo = 500): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: fargo, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: fargo,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
  }) as ChipEntry;
const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s)))));
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
const liveState = (n = 6, tables = 2, chips = 3): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips }] } };
  s = { ...s, entries: "ABCDEFGHIJKL".slice(0, n).split("").map((c, i) => entry(c, 400 + i * 25)) };
  s = addTables(s, tables);
  return startAllMatches(startChipTournament(s));
};
const tick = () => new Promise((r) => setTimeout(r, 3));
const live = (s: ChipState) => s.matches.find((m) => m.status === "in_progress");
const startPending = (s: ChipState) => {
  let out = s;
  for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) out = act(out, (c) => startPendingMatch(c, t.id));
  return out;
};
// Record a result on the first live match; "holder" = the table's current holder wins.
const win = async (s: ChipState, pick: "a" | "b" | "holder" = "a") => {
  await tick();
  const ready = live(s) ? s : startPending(s);
  const m = live(ready)!;
  const holder = ready.tables.find((t) => t.id === m.tableId)?.holderId;
  const w = pick === "holder" && holder && (holder === m.aId || holder === m.bId) ? holder : pick === "b" ? m.bId : m.aId;
  return act(ready, (c) => recordWinner(c, m.id, w));
};
// The pre-fix "finished" definition every surface used to count.
const rawFinished = (s: ChipState) => s.matches.filter((m) => m.status !== "in_progress" && m.endedAt);

// ── A. one definition: valid finished = Match # list ─────────────────────────
test("A: valid finished matches == the Match # list (same ids, order, completion time)", async () => {
  let s = liveState();
  for (let i = 0; i < 5; i++) s = await win(s, i % 2 ? "a" : "b");
  const valid = chipValidMatches(s);
  const n = numberChipMatches(s);
  assert.deepEqual(valid.map((v) => [v.number, v.matchId, v.completedAt]), n.list.map((r) => [r.number, r.matchId, r.completedAt]));
  assert.equal(dashboard(s).matchesPlayed, 5);
});

// ── B. Undo ─────────────────────────────────────────────────────────────────
test("B: Undo removes the result from Matches Played, durations and the player's rating sample", async () => {
  let s = liveState();
  s = await win(s);
  s = await win(s);
  s = await win(s);
  const undone = undoLastActions(s, 1, { reason: "test" });
  assert.equal(dashboard(undone).matchesPlayed, 2);
  assert.equal(chipMatchSummary(chipValidMatches(undone)).timed, 2);
  const valid = chipValidMatches(undone);
  for (const e of undone.entries) {
    const mine = chipEntryValidMatches(valid, e.id);
    assert.equal(mine.filter((m) => m.won).length, e.wins, `${e.p1Name} wins == valid wins`);
    assert.equal(mine.filter((m) => !m.won).length, e.losses, `${e.p1Name} losses == valid losses`);
  }
});

// ── C. Restore where records stay "finished" ────────────────────────────────
test("C: Restore past results → excluded even when the old match records still read 'finished'", async () => {
  let s = liveState(8, 2);
  s = await win(s);
  s = await win(s);
  const m2 = s.events.filter((e) => e.type === "match_result").sort((a, b) => a.at.localeCompare(b.at))[1];
  s = await win(s);
  s = await win(s);
  const restored = restoreToPoint(s, m2.id, { reason: "test" });
  // Simulate the historical shape: reverted matches whose records were never rolled back.
  const staleRecords: ChipState = {
    ...restored,
    matches: [
      ...restored.matches,
      ...s.matches.filter((m) => m.status === "finished" && !restored.matches.some((r) => r.id === m.id)),
    ],
  };
  assert.ok(rawFinished(staleRecords).length > 1, "old definition over-counts");
  assert.equal(dashboard(staleRecords).matchesPlayed, 1);
  assert.equal(chipMatchSummary(chipValidMatches(staleRecords)).tablesUsed, 1);
});

// ── D. voided / no-winner rows ──────────────────────────────────────────────
test("D: Clear Table void and legacy no-winner 'finished' rows never count", async () => {
  let s = liveState();
  s = await win(s);
  s = startPending(s);
  const t = s.tables.find((x) => x.matchId)!;
  s = act(s, (c) => clearTable(c, t.id, "end"));
  const legacyVoid: ChipMatch = {
    id: newId("m"), tableId: s.tables[1].id, aId: s.entries[0].id, bId: s.entries[1].id,
    startedAt: new Date(Date.now() - 60_000).toISOString(), endedAt: new Date().toISOString(), status: "finished",
  } as ChipMatch;
  const withLegacy: ChipState = { ...s, matches: [...s.matches, legacyVoid] };
  assert.equal(dashboard(withLegacy).matchesPlayed, 1);
  assert.ok(!chipHistoryMatches(numberChipMatches(withLegacy), withLegacy.matches).some((r) => r.m.id === legacyVoid.id), "no-winner row is not a history loss");
});

// ── E. forfeits ─────────────────────────────────────────────────────────────
test("E: Forfeit Match counts once (not twice) and is flagged as a forfeit", async () => {
  let s = liveState();
  s = await win(s);
  await tick();
  const m = live(s)!;
  s = act(s, (c) => forfeitMatch(c, m.bId, { reason: "No-show" }));
  const sum = chipMatchSummary(chipValidMatches(s));
  assert.equal(sum.completed, 2);
  assert.equal(sum.forfeits, 1);
  assert.equal(dashboard(s).forfeits, 1);
});

// ── F. durations ────────────────────────────────────────────────────────────
test("F: duration = start → result event; Reset Waiting Timer (endedAt rewrite) never changes avg/fastest/longest", async () => {
  let s = liveState(6, 1);
  s = await win(s);
  s = await win(s, "holder");
  const before = dashboard(s);
  await tick();
  await tick();
  const t = s.tables.find((x) => x.holderId)!;
  const reset = act(s, (c) => resetTableTimer(c, t.id));
  const after = dashboard(reset);
  assert.deepEqual(
    [after.matchesPlayed, after.avgMatchMs, after.fastestMatchMs, after.longestMatchMs],
    [before.matchesPlayed, before.avgMatchMs, before.fastestMatchMs, before.longestMatchMs],
  );
  for (const v of chipValidMatches(reset)) {
    const m = reset.matches.find((x) => x.id === v.matchId)!;
    if (v.durationMs != null) assert.equal(v.durationMs, Date.parse(v.completedAt) - Date.parse(m.startedAt));
  }
});

test("F2: summary math — avg / fastest / longest over timed matches only; none → null (never invented)", () => {
  const mk = (d: number | null, table: string) => ({
    number: 1, matchId: newId("m"), aId: "a", bId: "b", winnerId: "a", loserId: "b", tableId: table,
    completedAt: new Date().toISOString(), durationMs: d, forfeit: false,
  });
  const sum = chipMatchSummary([mk(60_000, "t1"), mk(120_000, "t2"), mk(null, "t2"), mk(180_000, "t10")]);
  assert.deepEqual([sum.completed, sum.timed, sum.avgMatchMs, sum.fastestMatchMs, sum.longestMatchMs, sum.tablesUsed], [4, 3, 120_000, 60_000, 180_000, 3]);
  assert.equal(sum.matchesPerTable.get("t2"), 2);
  const none = chipMatchSummary([mk(null, "t1")]);
  assert.deepEqual([none.avgMatchMs, none.fastestMatchMs, none.longestMatchMs], [null, null, null]);
});

// ── G/H. Performance Rating sample + opponent Fargo ─────────────────────────
test("G/H: rating sample + avg opponent Fargo use valid matches only — a reverted 'finished' record is excluded", async () => {
  let s = liveState(6, 1);
  s = await win(s, "holder");
  s = await win(s, "holder");
  const [first, second] = chipValidMatches(s);
  const holder = second.winnerId!;
  // Historical restore shape: 2nd result superseded in the log, its match record still 'finished'.
  const reverted: ChipState = {
    ...s,
    events: s.events.map((e) => (e.payload?.matchId === second.matchId && e.type === "match_result" ? { ...e, superseded: true } : e)),
  };
  const fargo = new Map(reverted.entries.map((e) => [e.id, e.teamFargo]));
  const games = (rows: { opponentId: string | null; won: boolean }[]) =>
    rows.map((r) => ({ opponentFargo: fargo.get(r.opponentId ?? "") ?? null, gamesWon: r.won ? 1 : 0, gamesLost: r.won ? 0 : 1 }));
  const mine = chipEntryValidMatches(chipValidMatches(reverted), holder);
  assert.deepEqual(mine.map((m) => m.matchId), first.aId === holder || first.bId === holder ? [first.matchId] : []);
  const oldRows = reverted.matches
    .filter((m) => m.status !== "in_progress" && m.endedAt && (m.aId === holder || m.bId === holder))
    .map((m) => ({ opponentId: m.aId === holder ? m.bId : m.aId, won: m.winnerId === holder }));
  assert.ok(oldRows.length > mine.length, "pre-fix sample included the reverted match");
  const perf = computePerformance(games(mine), fargo.get(holder) ?? null);
  assert.equal(perf.matches, mine.length);
  if (mine.length) assert.equal(perf.avgOpponentFargo, fargo.get(mine[0].opponentId!));
});

// ── I/J. streak ─────────────────────────────────────────────────────────────
test("I: current streak has NO cap (10 straight wins = 10), and resets on a loss", () => {
  const ten = Array.from({ length: 10 }, () => ({ won: true }));
  assert.deepEqual(chipCurrentStreak(ten), { type: "win", count: 10 });
  assert.deepEqual(chipCurrentStreak([{ won: false }, ...ten]), { type: "loss", count: 1 });
  assert.deepEqual(chipCurrentStreak([]), { type: "none", count: 0 });
});

test("J: an undone win is not part of the streak", async () => {
  let s = liveState(8, 1, 5);
  for (let i = 0; i < 4; i++) s = await win(s, "holder");
  const holder = s.tables[0].holderId!;
  const full = chipCurrentStreak(chipEntryValidMatches(chipValidMatches(s), holder));
  const undone = undoLastActions(s, 1, { reason: "test" });
  const after = chipCurrentStreak(chipEntryValidMatches(chipValidMatches(undone), holder));
  assert.equal(after.count, full.count - 1);
});

// ── K. Tables Used ──────────────────────────────────────────────────────────
test("K: Tables Used counts only tables that hosted a valid finished match", async () => {
  let s = liveState(6, 2);
  s = await win(s); // table of the first live match
  const other = s.tables.find((t) => t.matchId && t.id !== chipValidMatches(s)[0].tableId);
  if (other) s = act(s, (c) => clearTable(c, other.id, "end")); // voided on the other table
  assert.equal(dashboard(s).tablesUsed, 1);
});

// ── L. natural sort ─────────────────────────────────────────────────────────
test("L: natural table order — Table 2 before Table 10, case-insensitive, stable", () => {
  const labels = ["Table 10", "Table 2", "table 1", "Table 11", "Table 3", "Bar", "Table 2"];
  assert.deepEqual([...labels].sort(naturalCompare), ["Bar", "table 1", "Table 2", "Table 2", "Table 3", "Table 10", "Table 11"]);
  assert.ok(naturalCompare("T9", "T10") < 0);
  assert.ok(naturalCompare(null, "Table 1") < 0);
});

// ── mostRecentOpponent (Rematch skipped) ────────────────────────────────────
test("mostRecentOpponent ignores a reverted result whose record still reads 'finished'", async () => {
  let s = liveState(6, 1);
  s = await win(s, "holder");
  const first = chipValidMatches(s)[0];
  const holder = first.winnerId!;
  s = await win(s, "holder");
  const second = chipValidMatches(s)[1];
  assert.equal(mostRecentOpponent(s, holder), second.loserId);
  // Revert the 2nd result in the log only (historical restore shape — record untouched).
  const reverted: ChipState = {
    ...s,
    events: s.events.map((e) => (e.payload?.matchId === second.matchId && (e.type === "match_result" || e.type === "forfeit") ? { ...e, superseded: true } : e)),
  };
  assert.equal(mostRecentOpponent(reverted, holder), first.loserId);
});

// ── M/N. public activity feed ───────────────────────────────────────────────
test("M: activity — stale 'Tournament finished' after an undo is hidden; only the newest finish shows", async () => {
  let s = liveState();
  s = await win(s);
  const finEv = {
    id: newId("ev"), type: "manual", text: "Tournament finished", at: new Date().toISOString(), payload: { act: "tournament_finished" },
  } as ChipEvent;
  const older = { ...finEv, id: newId("ev"), at: new Date(Date.now() - 60_000).toISOString() };
  const fin = { ...s, events: [finEv, ...s.events, older] };
  const lines = (evs: ChipEvent[], finished: boolean) =>
    toPublicActivityFeed(evs, Infinity, undefined, { finished }).filter((a) => a.text === "Tournament finished").length;
  assert.equal(lines(fin.events, false), 0, "reopened (undone finish) → hidden");
  assert.equal(lines(fin.events, true), 1, "finished → only the newest finish line");
  assert.equal(toPublicActivityFeed(fin.events, Infinity).filter((a) => a.text === "Tournament finished").length, 2, "legacy call (no opts) unchanged");
});

test("N: activity — undone results hidden, no-op queue move hidden, queue_moved renders, results carry Match #", async () => {
  let s = liveState();
  s = await win(s);
  s = await win(s);
  const undone = undoLastActions(s, 1, { reason: "test" });
  const mk = (from: number, to: number): ChipEvent =>
    ({ id: newId("ev"), type: "manual", text: "B moved", at: new Date().toISOString(), payload: { act: "queue_moved", fromIndex: from, toIndex: to, teamName: "B" } }) as ChipEvent;
  const evs = [mk(1, 1), mk(0, 3), ...undone.events];
  const feed = toPublicActivityFeed(evs, Infinity, numberChipMatches(undone), { finished: false });
  const results = feed.filter((a) => a.kind === "result");
  assert.equal(results.length, 1, "undone result hidden");
  assert.equal(results[0].matchNumber, 1);
  const q = feed.filter((a) => a.kind === "queue");
  assert.deepEqual(q.map((a) => a.text), ["B moved from #1 to #4 in the queue"]);
});

// ── O/P. public-read privacy (client side; DB side verified by the rolled-back SQL test) ──
const root = join(__dirname, "..", "..", "..");
test("O: public (spectator / player hub) loads read the privacy views, managers read base tables", () => {
  const src = readFileSync(join(root, "src/models/services/chip.service.ts"), "utf8");
  assert.match(src, /from\("chip_config_public"\)/);
  assert.match(src, /from\("chip_events_public"\)/);
  assert.match(src, /from\("chip_entries_public"\)/);
  for (const f of ["src/viewmodels/hooks/use.chip.spectator.ts", "src/viewmodels/hooks/use.player.chip.tournament.ts"])
    assert.match(readFileSync(join(root, f), "utf8"), /chipService\.load\([^)]*publicRead: true/);
});

test("P: migration — views omit restore_points / version / actor_id, strip actorName + private reasons, hide TD-only types", () => {
  const sql = readFileSync(join(root, "supabase/pending/20261009120000_chip_public_read_privacy.sql"), "utf8");
  const cfgView = sql.slice(sql.indexOf("create or replace view public.chip_config_public"), sql.indexOf("create or replace view public.chip_events_public"));
  assert.ok(!/restore_points|\bversion\b/.test(cfgView.replace(/--.*$/gm, "")));
  const evView = sql.slice(sql.indexOf("create or replace view public.chip_events_public"), sql.indexOf("revoke all"));
  assert.ok(!/actor_id/.test(evView));
  assert.match(evView, /- 'actorName' - 'reason' - 'notes'/);
  for (const t of ["chip_adjust", "restore", "undo", "redo", "settings_unlocked", "fargo_cap_override"]) assert.match(evView, new RegExp(`'${t}'`));
  assert.match(sql, /for select to authenticated using \(public\.is_chip_manager\(tournament_id\)\)/);
});

// ── real historical fixture (#2517, anonymized: ids / statuses / times / result links only) ──
test("historical #2517 (13 restored-away results): 29 raw 'finished' → 24 valid; every counted match has a winner; entry W/L agree", () => {
  const fx = JSON.parse(readFileSync(join(__dirname, "fixtures", "chip-2517-history.json"), "utf8"));
  const s = { matches: fx.matches as ChipMatch[], events: fx.events as ChipEvent[] };
  const valid = chipValidMatches(s);
  assert.equal(s.matches.filter((m) => m.status !== "in_progress" && m.endedAt).length, 29);
  assert.equal(valid.length, 24);
  assert.equal(new Set(valid.map((v) => v.matchId)).size, valid.length, "one per match");
  assert.ok(valid.every((v) => v.winnerId && v.loserId));
  assert.deepEqual(valid.map((v) => v.number), valid.map((_, i) => i + 1));
  for (const e of fx.entries as { id: string; wins: number; losses: number }[]) {
    const mine = chipEntryValidMatches(valid, e.id);
    assert.equal(mine.filter((m) => m.won).length, e.wins, `entry ${e.id} wins`);
    assert.equal(mine.filter((m) => !m.won).length, e.losses, `entry ${e.id} losses`);
  }
});
