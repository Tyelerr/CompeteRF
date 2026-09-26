// src/utils/__tests__/chip-save-reliability.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-save-reliability.test.ts
// Live Chip save reliability (tournament 2766 audit): the serialized save queue, bounded
// retries of the SAME snapshot, events written only after main state, the stale-reload
// guard, and the failure-log record. Uses an in-memory backend that behaves like the
// chip_* tables (upsert + prune, append-only events) with injectable failures.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  assignFinals,
  emptyChipState,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  recordWinner,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import {
  buildSaveFailureLog,
  ChipPersistBackend,
  ChipRowTable,
  ChipSaveError,
  ChipSavePlan,
  ChipSaveStage,
  executeChipSave,
} from "../../models/services/chip.persist";
import { createChipSaveQueue, createLoadGuard } from "../../models/services/chip.save-queue";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

// ── engine fixtures ───────────────────────────────────────────────────────────
const entry = (name: string): ChipEntry =>
  ({
    id: newId("e"),
    p1Name: name,
    p1Fargo: 500,
    p1Phone: "",
    p2Name: "",
    p2Fargo: null,
    teamFargo: 500,
    startChips: 0,
    chips: 0,
    paid: true,
    checkedIn: true,
    paidSidePots: [],
    status: "queued",
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    eliminations: 0,
    createdAt: new Date().toISOString(),
  }) as ChipEntry;

const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s)))));

// Mirrors the viewmodel's update(): pipeline + a persisted restore point for logged actions.
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  const next = pipeline(fn(c));
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  const newEvents = next.events.slice(0, added);
  return withRestorePoint(next, c, newEvents.map((e) => e.id), newEvents[0].text);
};

const liveState = (tableCount = 2): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: ["A", "B", "C", "D", "E", "F"].map(entry) };
  s = addTables(s, tableCount);
  return startAllMatches(startChipTournament(s));
};

const liveMatch = (s: ChipState) => s.matches.find((m) => m.status === "in_progress")!;
const winFirstMatch = (s: ChipState) => {
  const m = liveMatch(s);
  return { next: act(s, (c) => recordWinner(c, m.id, m.aId)), matchId: m.id, loserId: m.bId };
};

// ── in-memory chip_* backend ──────────────────────────────────────────────────
type Row = Record<string, unknown>;
class FakeDb implements ChipPersistBackend {
  config: Row = {};
  rows: Record<ChipRowTable, Map<string, Row>> = {
    chip_entries: new Map(),
    chip_matches: new Map(),
    chip_tables: new Map(),
  };
  events = new Map<string, Row>();
  eventInsertCalls = 0;
  version = 0;
  // stage → number of upcoming calls that should fail
  failNext: Partial<Record<ChipSaveStage, number>> = {};
  log: string[] = [];
  // Optional gate: every write awaits it (to hold a save "in flight").
  gate: Promise<void> | null = null;

  private async step(stage: ChipSaveStage) {
    this.log.push(stage);
    if (this.gate) await this.gate;
    const n = this.failNext[stage] ?? 0;
    if (n > 0) {
      this.failNext[stage] = n - 1;
      throw Object.assign(new Error(`TypeError: Network request failed (${stage})`), { code: "", status: 0 });
    }
  }
  private stageOfPatch(patch: Row): ChipSaveStage {
    if ("queue" in patch) return "config_core";
    if ("restore_points" in patch) return "config_restore_points";
    return "config_extended";
  }
  async upsertConfig(patch: Row) {
    await this.step(this.stageOfPatch(patch));
    this.config = { ...this.config, ...patch };
  }
  async upsertConfigSoft(patch: Row) {
    this.config = { ...this.config, ...patch };
  }
  async syncRows(table: ChipRowTable, rows: Row[], ids: string[]) {
    const stage = ({ chip_entries: "entries", chip_matches: "matches", chip_tables: "tables" } as const)[table];
    await this.step(stage);
    const map = this.rows[table];
    for (const r of rows) map.set(String(r.id), r);
    for (const k of [...map.keys()]) if (!ids.includes(k)) map.delete(k);
  }
  async insertEvents(rows: Row[]) {
    this.eventInsertCalls++;
    await this.step("events");
    for (const r of rows) if (!this.events.has(String(r.id))) this.events.set(String(r.id), r);
  }
  async markSuperseded(ids: string[]) {
    await this.step("events_superseded");
    for (const id of ids) {
      const ev = this.events.get(id);
      if (ev) this.events.set(id, { ...ev, superseded: true });
    }
  }
  async bumpVersion() {
    this.version += 1;
    return { version: this.version, conflict: false };
  }
  eventsOfType(type: string) {
    return [...this.events.values()].filter((e) => e.type === type && !e.superseded);
  }
}

// Same plan shape chipService.save builds (row mappers simplified to the fields under test).
const planOf = (s: ChipState): ChipSavePlan => ({
  configCore: { queue: s.queue, winner_entry_id: s.winnerId ?? null },
  configExtended: { shuffle_mode: !!s.shuffleMode },
  configRestorePoints: { restore_points: s.restorePoints ?? [] },
  configSoft: { reshuffle_removing_ids: s.reshuffleRemovingIds ?? [] },
  entries: {
    rows: s.entries.map((e) => ({ id: e.id, chips: e.chips, wins: e.wins, losses: e.losses, status: e.status })),
    ids: s.entries.map((e) => e.id),
  },
  matches: {
    rows: s.matches.map((m) => ({ id: m.id, status: m.status, winner_id: m.winnerId ?? null })),
    ids: s.matches.map((m) => m.id),
  },
  tables: { rows: s.tables.map((t) => ({ id: t.id, match_id: t.matchId ?? null })), ids: s.tables.map((t) => t.id) },
  events: s.events.map((ev) => ({ id: ev.id, type: ev.type, text: ev.text, superseded: !!ev.superseded })),
  supersededEventIds: s.events.filter((ev) => ev.superseded).map((ev) => ev.id),
});

const noSleep = () => Promise.resolve();
const queueFor = (db: FakeDb, extra?: { onGaveUp?: () => void; onAttemptFailed?: (a: number) => void }) => {
  const saved: ChipState[] = [];
  const queue = createChipSaveQueue<ChipState, { version: number; conflict: boolean }>({
    save: (s) => executeChipSave(db, planOf(s)),
    onSaved: (_r, s) => saved.push(s),
    onAttemptFailed: (f) => extra?.onAttemptFailed?.(f.attempt),
    onGaveUp: () => extra?.onGaveUp?.(),
    sleep: noSleep,
  });
  return { queue, saved };
};

// ── 1. serialized + latest wins ───────────────────────────────────────────────
test("two rapid actions while a save is in flight → serialized, newest state persisted", async () => {
  const db = new FakeDb();
  let release!: () => void;
  db.gate = new Promise<void>((r) => (release = r));
  const saved: ChipState[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const tracked = createChipSaveQueue<ChipState, unknown>({
    save: async (s) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await executeChipSave(db, planOf(s));
      } finally {
        inFlight--;
      }
    },
    onSaved: (_r, s) => saved.push(s),
    sleep: noSleep,
  });

  const s0 = liveState(3); // three live matches → three results available
  const a1 = winFirstMatch(s0);
  tracked.enqueue(a1.next); // save #1 starts and blocks on the gate
  await Promise.resolve();
  const a2 = winFirstMatch(a1.next); // two more local actions while #1 is in flight
  tracked.enqueue(a2.next);
  const a3 = winFirstMatch(a2.next);
  tracked.enqueue(a3.next);
  assert.ok(tracked.isSaving());
  release();
  db.gate = null;
  assert.equal(await tracked.flush(), true);

  assert.equal(maxInFlight, 1, "never two saves at once");
  assert.equal(saved.length, 2, "the in-flight snapshot, then only the newest (a2 coalesced into a3)");
  assert.equal(saved[1], a3.next);
  // DB holds the newest state: all three results.
  for (const a of [a1, a2, a3]) assert.equal(db.rows.chip_matches.get(a.matchId)?.status, "finished");
  assert.equal(db.eventsOfType("match_result").length, 3);
});

// ── 2. fail once, retry succeeds ──────────────────────────────────────────────
test("save fails once then retry succeeds → same snapshot, action not replayed, event once", async () => {
  const db = new FakeDb();
  db.failNext.entries = 1;
  const attempts: number[] = [];
  const { queue, saved } = queueFor(db, { onAttemptFailed: (a) => attempts.push(a) });
  const s0 = liveState();
  const { next, matchId, loserId } = winFirstMatch(s0);
  queue.enqueue(next);
  assert.equal(await queue.flush(), true);

  assert.deepEqual(attempts, [1]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0], next, "the SAME snapshot object was retried");
  assert.equal(db.rows.chip_matches.get(matchId)?.status, "finished");
  const loserBefore = s0.entries.find((e) => e.id === loserId)!.chips;
  assert.equal(db.rows.chip_entries.get(loserId)?.chips, loserBefore - 1, "exactly one chip deducted");
  assert.equal(db.eventsOfType("match_result").length, 1, "one activity event");
  // Attempt 1 failed at entries → events were NOT written by that attempt.
  assert.equal(db.eventInsertCalls, 1);
});

// ── 3. every retry fails ──────────────────────────────────────────────────────
test("save fails every retry → no activity event for the failed state, TD notified, state kept", async () => {
  const db = new FakeDb();
  db.failNext.matches = 99;
  let gaveUp = 0;
  const attempts: number[] = [];
  const { queue } = queueFor(db, { onGaveUp: () => gaveUp++, onAttemptFailed: (a) => attempts.push(a) });
  const { next } = winFirstMatch(liveState());
  queue.enqueue(next);
  assert.equal(await queue.flush(), false);

  assert.deepEqual(attempts, [1, 2, 3], "bounded: initial + 2 retries");
  assert.equal(gaveUp, 1);
  assert.equal(db.eventsOfType("match_result").length, 0, "no history for a state that never persisted");
  assert.equal(db.eventInsertCalls, 0);
  assert.ok(queue.hasUnsaved(), "failed snapshot kept for Retry / next action");

  // Network recovers → Retry saves the kept snapshot (no replay).
  db.failNext.matches = 0;
  queue.retry();
  assert.equal(await queue.flush(), true);
  assert.equal(db.eventsOfType("match_result").length, 1);
  assert.equal(queue.hasUnsaved(), false);
});

test("failure error carries stage/table/code/status and the log record has no player data", async () => {
  const db = new FakeDb();
  db.failNext.entries = 1;
  const s = liveState();
  await assert.rejects(executeChipSave(db, planOf(s)), (e: unknown) => {
    assert.ok(e instanceof ChipSaveError);
    assert.equal(e.stage, "entries");
    assert.equal(e.table, "chip_entries");
    assert.equal(e.status, 0);
    const rec = buildSaveFailureLog({ tournamentId: 2766, error: e, attempt: 1, maxAttempts: 3, willRetry: true, platform: "ios" });
    assert.equal(rec.kind, "chip_save_failed");
    assert.equal(rec.tournament_id, 2766);
    assert.equal(rec.stage, "entries");
    assert.equal(rec.table, "chip_entries");
    assert.equal(rec.attempt, 1);
    assert.ok(typeof rec.at === "string");
    const text = JSON.stringify(rec);
    for (const name of ["A", "B", "C"].map((n) => `"${n}"`)) assert.ok(!text.includes(name));
    assert.ok(text.length < 2048, "fits log_app_event's 2 KB metadata limit");
    return true;
  });
});

// ── 4. stale reload discarded ─────────────────────────────────────────────────
test("reload starts → local action → stale reload result is discarded", () => {
  const guard = createLoadGuard();
  const token = guard.begin(); // reload starts
  guard.markLocalChange(); // TD records a result while the fetch is in flight
  assert.equal(guard.isStale(token), true, "result must be discarded");
  const fresh = guard.begin(); // follow-up reload after the save
  assert.equal(guard.isStale(fresh), false, "a reload with no later local action applies");
});

// ── 5. normal save unchanged ──────────────────────────────────────────────────
test("normal successful save → every section written, events after main state", async () => {
  const db = new FakeDb();
  const { queue, saved } = queueFor(db);
  const { next } = winFirstMatch(liveState());
  queue.enqueue(next);
  assert.equal(await queue.flush(), true);
  assert.equal(saved.length, 1);
  assert.deepEqual(db.log, [
    "config_core",
    "config_extended",
    "config_restore_points",
    "entries",
    "matches",
    "tables",
    "events",
  ]);
  assert.equal(db.version, 1, "soft-CAS version bumped once, after success");
  assert.equal(db.rows.chip_entries.size, next.entries.length);
  assert.equal(db.rows.chip_matches.size, next.matches.length);
});

// ── 6. winner selection end-to-end ────────────────────────────────────────────
test("winner selection → one match result, one chip deduction, one activity event", async () => {
  const db = new FakeDb();
  const { queue } = queueFor(db);
  const s0 = liveState();
  queue.enqueue(s0);
  await queue.flush();
  const { next, matchId, loserId } = winFirstMatch(s0);
  queue.enqueue(next);
  queue.enqueue(next); // double flush of the same state (e.g. debounce + reload flush)
  assert.equal(await queue.flush(), true);
  const finished = [...db.rows.chip_matches.values()].filter((m) => m.status === "finished");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].id, matchId);
  const before = s0.entries.find((e) => e.id === loserId)!.chips;
  assert.equal(db.rows.chip_entries.get(loserId)?.chips, before - 1);
  assert.equal(db.eventsOfType("match_result").length, 1);
});

// ── 7. Undo / Restore ─────────────────────────────────────────────────────────
test("Undo still works and persists: result reverted, original events superseded", async () => {
  const db = new FakeDb();
  const { queue } = queueFor(db);
  const s0 = liveState();
  const { next, matchId, loserId } = winFirstMatch(s0);
  queue.enqueue(next);
  await queue.flush();
  assert.equal(db.eventsOfType("match_result").length, 1);

  const undone = undoLastActions(next, 1, { reason: "test" });
  assert.notEqual(undone, next);
  queue.enqueue(undone);
  assert.equal(await queue.flush(), true);

  const before = s0.entries.find((e) => e.id === loserId)!.chips;
  assert.equal(db.rows.chip_entries.get(loserId)?.chips, before, "chip restored");
  assert.notEqual(db.rows.chip_matches.get(matchId)?.status, "finished", "result reverted");
  assert.equal(db.eventsOfType("match_result").length, 0, "reverted result is superseded in history");
  assert.ok(db.log.includes("events_superseded"));
});

test("newer action arrives while a failed save is retrying → newer snapshot saved, nothing lost", async () => {
  const db = new FakeDb();
  db.failNext.entries = 1;
  const saved: ChipState[] = [];
  const s0 = liveState(3);
  const a1 = winFirstMatch(s0);
  const a2 = winFirstMatch(a1.next);
  let queueRef: ReturnType<typeof createChipSaveQueue<ChipState, unknown>> | null = null;
  queueRef = createChipSaveQueue<ChipState, unknown>({
    save: (s) => executeChipSave(db, planOf(s)),
    onSaved: (_r, s) => saved.push(s),
    // The TD records another result during the retry back-off.
    sleep: async () => {
      queueRef!.enqueue(a2.next);
    },
  });
  queueRef.enqueue(a1.next);
  assert.equal(await queueRef.flush(), true);
  assert.deepEqual(saved, [a2.next], "stale snapshot not retried; newest (containing a1) saved");
  assert.equal(db.rows.chip_matches.get(a1.matchId)?.status, "finished");
  assert.equal(db.rows.chip_matches.get(a2.matchId)?.status, "finished");
  assert.equal(db.eventsOfType("match_result").length, 2);
});
