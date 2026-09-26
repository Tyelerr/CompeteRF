// src/utils/__tests__/chip-local-recovery.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-local-recovery.test.ts
// Web-only Chip local backup + recovery (Phase 1, view-only): snapshot writes after engine
// mutations, durability across service re-creation, rolling-3 retention + pruning, the
// load-failure recovery decision, the read-only lock, cloud-vs-local comparison, and that a
// failing local store never affects the tournament action or the cloud save queue.
// Storage is the in-memory adapter over a shared Map (the "database" that survives a
// service re-creation); the IndexedDB adapter implements the same 4-method interface.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  adjustChips,
  assignFinals,
  clearTable,
  emptyChipState,
  forfeitMatch,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  recordWinner,
  reorderQueue,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import {
  CHIP_RECOVERY_KEEP,
  CHIP_RECOVERY_RETENTION,
  ChipRecoverySnapshot,
  ChipRecoverySnapshotInput,
  ChipRecoveryStorage,
  chipRecoveryFingerprint,
  compareCloudToLocal,
  createChipBackupWriter,
  createChipLocalRecovery,
  createMemoryRecoveryStorage,
  createRecoveryLock,
  decideLoadFailure,
  isCloudUnavailableError,
  isDivergentUnconfirmedBackup,
  pickRecoveryTournamentInfo,
} from "../../models/services/chip.local-recovery";
import { createChipSaveQueue } from "../../models/services/chip.save-queue";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

// ── engine fixtures (same shape as chip-save-reliability.test.ts) ─────────────
const entry = (name: string): ChipEntry =>
  ({
    id: newId("e"),
    p1Name: name,
    p1Fargo: 500,
    p1Phone: "555-0100",
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
// After a result the next challenger is seated PENDING; start it so play can continue.
const startPending = (s: ChipState): ChipState => {
  let out = s;
  for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) out = act(out, (c) => startPendingMatch(c, t.id));
  return out;
};
const liveMatch = (s: ChipState) => s.matches.find((m) => m.status === "in_progress")!;
const winFirst = (s: ChipState) => {
  const ready = liveMatch(s) ? s : startPending(s);
  const m = liveMatch(ready);
  return act(ready, (c) => recordWinner(c, m.id, m.aId));
};

const TID = 4242;
const tournamentInfo = pickRecoveryTournamentInfo({
  id: TID,
  name: "JJ's 9 Ball Chip Tournament",
  status: "active",
  live_state: "in_progress",
  tournament_format: "chip-tournament",
  entry_fee: 20,
  venues: { venue: "JJ's", phone: "555-9999", owner_id: 7 },
  director_email: "td@example.com",
});
const input = (chip: ChipState, over: Partial<ChipRecoverySnapshotInput> = {}): ChipRecoverySnapshotInput => ({
  tournamentId: TID,
  ownerUserId: "user-td-1",
  tournament: tournamentInfo,
  chip,
  reason: "action",
  cloudVersion: 1,
  cloudConfirmed: false,
  finished: false,
  ...over,
});

// Clock under test control.
const clock = (start = Date.parse("2026-09-25T21:00:00Z")) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};
const immediate = (fn: () => void) => fn();

// A store that fails every write (quota / private mode / IndexedDB unavailable).
const failingStorage = (): ChipRecoveryStorage => ({
  put: async () => {
    throw new Error("QuotaExceededError: IndexedDB write failed");
  },
  listByTournament: async () => {
    throw new Error("IndexedDB read failed");
  },
  listAll: async () => [],
  delete: async () => {},
});

// ── 1. snapshot after a Chip mutation ─────────────────────────────────────────
test("1. local snapshot is written after a Chip state mutation (winner selected)", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const writer = createChipBackupWriter(recovery, { defer: immediate });
  const before = liveState();
  const after = winFirst(before);
  assert.notEqual(chipRecoveryFingerprint(before), chipRecoveryFingerprint(after));

  writer.schedule(input(after));
  await writer.flush();

  const latest = await recovery.getLatestSnapshot(TID);
  assert.ok(latest);
  assert.equal(latest.fingerprint, chipRecoveryFingerprint(after));
  assert.equal(latest.chip.events.length, after.events.length);
  assert.deepEqual(latest.chip.queue, after.queue);
  assert.equal(latest.chip.restorePoints?.length, after.restorePoints?.length, "restore/undo history kept");
  assert.equal(latest.tournament.name, "JJ's 9 Ball Chip Tournament");
  assert.equal(latest.cloudConfirmed, false);
});

test("1b. snapshot strips phones and non-whitelisted tournament data; no secrets", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const rec = await recovery.saveSnapshot(input(winFirst(liveState())));
  assert.ok(rec.chip.entries.every((e) => !e.p1Phone));
  assert.ok((rec.chip.restorePoints ?? []).every((rp) => rp.snapshot.entries.every((e: any) => !e.p1Phone)));
  const json = JSON.stringify(rec);
  assert.ok(!json.includes("555-0100") && !json.includes("555-9999") && !json.includes("td@example.com"));
  assert.ok(!/access_token|refresh_token|password/i.test(json));
  assert.deepEqual(rec.tournament.venues, { venue: "JJ's" });
});

test("1c. writer coalesces a burst: newest state wins, nothing blocks the caller", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const writer = createChipBackupWriter(recovery); // default defer (setTimeout 0)
  let s = liveState();
  const states: ChipState[] = [];
  for (let i = 0; i < 5; i++) {
    s = winFirst(s);
    states.push(s);
    writer.schedule(input(s)); // synchronous return — never awaits storage
  }
  await writer.flush();
  const latest = await recovery.getLatestSnapshot(TID);
  assert.equal(latest?.fingerprint, chipRecoveryFingerprint(states[states.length - 1]));
});

// ── 2. durability across service re-creation ────────────────────────────────
test("2. closing/recreating the recovery service still loads the snapshot", async () => {
  const db = new Map<string, unknown>(); // survives "browser restart"
  const first = createChipLocalRecovery(createMemoryRecoveryStorage(db));
  const state = winFirst(liveState());
  await first.saveSnapshot(input(state));

  const reopened = createChipLocalRecovery(createMemoryRecoveryStorage(db));
  const latest = await reopened.getLatestSnapshot(TID);
  assert.ok(latest);
  assert.equal(latest.fingerprint, chipRecoveryFingerprint(state));
  assert.equal(latest.chip.entries.length, state.entries.length);
});

test("2b. a corrupt newest snapshot falls back to the previous valid one", async () => {
  const db = new Map<string, unknown>();
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage(db));
  const good = winFirst(liveState());
  await recovery.saveSnapshot(input(good));
  const bad = await recovery.saveSnapshot(input(winFirst(good)));
  db.set(bad.key, { ...bad, chip: { ...bad.chip, entries: "garbage" } });
  const latest = await recovery.getLatestSnapshot(TID);
  assert.equal(latest?.fingerprint, chipRecoveryFingerprint(good));
});

// ── 3. rolling retention ─────────────────────────────────────────────────────
test("3. latest 3 snapshots retained, older pruned", async () => {
  const db = new Map<string, unknown>();
  const c = clock();
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage(db), { now: c.now });
  let s = liveState();
  const fps: string[] = [];
  for (let i = 0; i < 5; i++) {
    s = winFirst(s);
    fps.push(chipRecoveryFingerprint(s));
    c.advance(1000);
    await recovery.saveSnapshot(input(s));
  }
  const snaps = await recovery.getSnapshots(TID);
  assert.equal(CHIP_RECOVERY_KEEP, 3);
  assert.equal(snaps.length, 3);
  assert.deepEqual(snaps.map((x) => x.fingerprint), fps.slice(-3).reverse(), "Latest, Previous, Older");
  assert.equal(db.size, 3, "older records deleted from storage");
  assert.ok(snaps[0].seq > snaps[1].seq && snaps[1].seq > snaps[2].seq);
});

test("3b. retention: active 14d, finished 3d, open tournament exempt, conflict archive survives rolling writes", async () => {
  const db = new Map<string, unknown>();
  const c = clock();
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage(db), { now: c.now });
  const s = winFirst(liveState());
  await recovery.saveSnapshot({ ...input(s), tournamentId: 1 }); // active
  await recovery.saveSnapshot({ ...input(s), tournamentId: 2, finished: true }); // finished
  await recovery.saveSnapshot({ ...input(s), tournamentId: 3 }); // the open one
  // Conflict archive on 1, then 3 more rolling writes must not remove it.
  await recovery.archiveConflict((await recovery.getLatestSnapshot(1))!);
  for (let i = 0; i < 3; i++) await recovery.saveSnapshot({ ...input(s), tournamentId: 1 });
  assert.ok(await recovery.getConflictArchive(1));

  c.advance(CHIP_RECOVERY_RETENTION.finishedMs + 1000);
  await recovery.pruneSnapshots({ keepTournamentId: 3 });
  assert.ok(await recovery.getLatestSnapshot(1), "active kept after 3 days");
  assert.equal(await recovery.getLatestSnapshot(2), null, "finished pruned after 3 days");

  c.advance(CHIP_RECOVERY_RETENTION.activeMs);
  await recovery.pruneSnapshots({ keepTournamentId: 3 });
  assert.equal(await recovery.getLatestSnapshot(1), null, "active pruned after 14 days");
  assert.equal(await recovery.getConflictArchive(1), null, "conflict archive pruned after 7 days");
  assert.ok(await recovery.getLatestSnapshot(3), "open tournament never pruned by age");
});

test("3c. markCloudSaved stamps only the snapshot whose state the cloud confirmed", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const writer = createChipBackupWriter(recovery, { defer: immediate });
  const s1 = winFirst(liveState());
  const s2 = winFirst(s1);
  writer.schedule(input(s2));
  writer.markCloudSaved(TID, s1, 7); // an OLDER state confirmed → newest stays unconfirmed
  await writer.flush();
  assert.equal((await recovery.getLatestSnapshot(TID))?.cloudConfirmed, false);
  writer.markCloudSaved(TID, s2, 8);
  await writer.flush();
  const latest = await recovery.getLatestSnapshot(TID);
  assert.equal(latest?.cloudConfirmed, true);
  assert.equal(latest?.cloudVersion, 8);
  assert.equal((await recovery.getSnapshots(TID)).length, 1, "stamping doesn't add a snapshot");
});

// ── 4 / 5. load failure decision ──────────────────────────────────────────────
test("4. cloud load fails (network/outage) + local backup exists → recovery offered", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  await recovery.saveSnapshot(input(winFirst(liveState())));
  const snap = await recovery.getLatestSnapshot(TID);
  const outages: unknown[] = [
    { message: "TypeError: Failed to fetch", code: "", details: "" },
    new TypeError("Network request failed"),
    { message: "upstream connect error", status: 503 },
    { message: "Could not connect to database", code: "PGRST000" },
    { message: "Something odd" }, // unknown → offer (doubt favors the backup)
  ];
  for (const e of outages) {
    const d = decideLoadFailure(e, snap);
    assert.equal(d.kind, "offer_recovery", JSON.stringify(e));
  }
  // Browser explicitly offline wins over any error text.
  assert.equal(decideLoadFailure({ message: "Tournament not found." }, snap, false).kind, "offer_recovery");
});

test("5. cloud load fails + no local backup → existing error handling (no offer)", () => {
  assert.equal(decideLoadFailure(new TypeError("Failed to fetch"), null).kind, "error");
  assert.equal(decideLoadFailure(new TypeError("Failed to fetch"), null, false).kind, "error");
});

test("5b. definitive errors (not found / no access) keep the existing error even with a backup", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const snap = await recovery.saveSnapshot(input(winFirst(liveState())));
  for (const e of [
    new Error("Tournament not found."),
    { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
    { message: "permission denied for table tournaments", code: "42501" },
    { message: "JWT expired", code: "PGRST301" },
  ]) {
    assert.equal(isCloudUnavailableError(e), false, JSON.stringify(e));
    assert.equal(decideLoadFailure(e, snap).kind, "error");
  }
});

// ── 6 / 7. read-only recovery mode ────────────────────────────────────────────
// Minimal mirror of the viewmodel's gating: every mutation chokepoint (update(), undo,
// restore, finish, start, roster writes) checks lock.blocks(); the auto-save + backup
// effects skip while the lock is active.
const makeVmMirror = (initial: ChipState) => {
  const blocked: string[] = [];
  const lock = createRecoveryLock((a) => blocked.push(a));
  const cloudSaves: ChipState[] = [];
  const backups: ChipState[] = [];
  let chip = initial;
  const commit = (next: ChipState) => {
    if (next === chip) return;
    chip = next;
    if (!lock.isActive()) {
      cloudSaves.push(next);
      backups.push(next);
    }
  };
  return {
    lock,
    blocked,
    cloudSaves,
    backups,
    get chip() {
      return chip;
    },
    openLocalCopy(snap: ChipRecoverySnapshot) {
      lock.enter();
      commit(snap.chip);
    },
    update(fn: (c: ChipState) => ChipState) {
      if (lock.blocks("change the tournament")) return;
      commit(act(chip, fn));
    },
    undoLast(n: number) {
      if (lock.blocks("undo")) return false;
      commit(undoLastActions(chip, n, { reason: "test" }));
      return true;
    },
    endTournament() {
      if (lock.blocks("finish the tournament")) return false;
      return true;
    },
  };
};

test("6. recovery copy opens read-only (lock active, nothing saved or re-backed-up)", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const snap = await recovery.saveSnapshot(input(winFirst(liveState())));
  const vm = makeVmMirror(emptyChipState("singles"));
  vm.openLocalCopy(snap);
  assert.equal(vm.lock.isActive(), true);
  assert.equal(vm.chip.startedAt, snap.chip.startedAt);
  assert.equal(chipRecoveryFingerprint(vm.chip), snap.fingerprint);
  assert.equal(vm.cloudSaves.length, 0, "viewing a backup never enqueues a cloud save");
  assert.equal(vm.backups.length, 0, "viewing a backup never writes a new backup");
});

test("7. state-changing actions cannot run in recovery mode", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const live = startPending(winFirst(winFirst(liveState())));
  const snap = await recovery.saveSnapshot(input(live));
  const vm = makeVmMirror(emptyChipState("singles"));
  vm.openLocalCopy(snap);
  const viewed = vm.chip;
  const m = liveMatch(viewed);
  const q0 = viewed.queue[0];
  const table = viewed.tables[0];
  vm.update((c) => recordWinner(c, m.id, m.aId)); // Select Winner
  vm.update((c) => adjustChips(c, m.aId, 1, { reason: "test" })); // Manage Chips
  vm.update((c) => reorderQueue(c, q0, "bottom")); // Queue change
  vm.update((c) => clearTable(c, table.id, "end")); // Table change
  vm.update((c) => forfeitMatch(c, m.bId, { reason: "test" })); // Forfeit
  assert.equal(vm.undoLast(1), false); // Undo / Restore
  assert.equal(vm.endTournament(), false); // Finish
  assert.equal(vm.chip, viewed, "state object untouched");
  assert.equal(vm.cloudSaves.length, 0);
  assert.equal(vm.backups.length, 0);
  assert.deepEqual(vm.blocked, [
    "change the tournament",
    "change the tournament",
    "change the tournament",
    "change the tournament",
    "change the tournament",
    "undo",
    "finish the tournament",
  ]);
  // Leaving recovery (Use Cloud Version) re-enables actions.
  vm.lock.exit();
  vm.update((c) => recordWinner(c, m.id, m.aId));
  assert.notEqual(vm.chip, viewed);
  assert.equal(vm.cloudSaves.length, 1);
});

// ── 8 / 9. cloud returns ─────────────────────────────────────────────────────
test("8. cloud returns with the same state → consistent (normal cloud state resumes)", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const live = winFirst(liveState());
  const snap = await recovery.saveSnapshot(input(live));
  // The cloud round-trip can reorder entries/matches/events and drop phones — still consistent.
  const cloud: ChipState = {
    ...live,
    entries: live.entries.slice().reverse().map((e) => ({ ...e, p1Phone: null })),
    matches: live.matches.slice().reverse(),
    events: live.events.slice().reverse(),
  };
  assert.equal(compareCloudToLocal(cloud, snap), "consistent");
  assert.equal(isDivergentUnconfirmedBackup(cloud, snap), false);
});

test("9. cloud returns newer/different → conflict; local never overwrites cloud", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const base = winFirst(liveState());
  const snap = await recovery.saveSnapshot(input(base));
  const snapCopy = JSON.parse(JSON.stringify(snap));
  // (a) another director advanced the cloud after this backup
  const cloudNewer = winFirst(base);
  const cloudCopy = JSON.parse(JSON.stringify(cloudNewer));
  assert.equal(compareCloudToLocal(cloudNewer, snap), "conflict");
  // comparison is read-only: neither side is modified
  assert.deepEqual(JSON.parse(JSON.stringify(cloudNewer)), cloudCopy);
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snapCopy);
  // (b) the backup holds an action that never reached the cloud
  const localAhead = await recovery.saveSnapshot(input(winFirst(base)));
  assert.equal(compareCloudToLocal(base, localAhead), "conflict");
  assert.equal(isDivergentUnconfirmedBackup(base, localAhead), true, "unconfirmed divergent backup is set aside");
  // (c) a CONFIRMED backup that the cloud has since moved past is not flagged on load
  const confirmed = { ...snap, cloudConfirmed: true };
  assert.equal(isDivergentUnconfirmedBackup(cloudNewer, confirmed), false);
  // the store itself was never asked to write anything back to the "cloud"
  assert.equal((await recovery.getSnapshots(TID)).length, 2);
});

// ── 10. local store failure is isolated ───────────────────────────────────────
test("10. IndexedDB write failure → tournament action + cloud save continue", async () => {
  const errors: string[] = [];
  const writer = createChipBackupWriter(createChipLocalRecovery(failingStorage()), {
    defer: immediate,
    onError: (e, op) => errors.push(`${op}: ${(e as Error).message}`),
  });
  const cloud: ChipState[] = [];
  const queue = createChipSaveQueue<ChipState, { version: number }>({
    save: async (s) => {
      cloud.push(s);
      return { version: cloud.length };
    },
    retryDelaysMs: [],
  });
  // Mirror of the VM effect order: state change → local backup (fire-and-forget) → cloud save.
  let s = liveState();
  for (let i = 0; i < 3; i++) {
    const next = winFirst(s);
    assert.notEqual(next, s, "the action itself applied");
    s = next;
    assert.doesNotThrow(() => writer.schedule(input(s)));
    queue.enqueue(s);
    writer.markCloudSaved(TID, s, i + 1);
  }
  await writer.flush();
  assert.equal(await queue.flush(), true, "cloud save queue unaffected");
  assert.equal(cloud[cloud.length - 1], s, "newest state persisted to the cloud");
  assert.ok(errors.length >= 1 && errors.every((m) => /failed/.test(m)), "failures logged, not thrown");
});

test("rolling history is per owner: another account / a signed-out visit never rotates out or shadows a TD's backup", async () => {
  const db = new Map<string, unknown>();
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage(db));
  const mine = winFirst(liveState());
  await recovery.saveSnapshot(input(mine)); // owner user-td-1
  for (let i = 0; i < 5; i++) await recovery.saveSnapshot({ ...input(emptyChipState("singles")), ownerUserId: null });
  const latestMine = await recovery.getLatestSnapshot(TID, "user-td-1");
  assert.equal(latestMine?.fingerprint, chipRecoveryFingerprint(mine), "TD's backup survives 5 foreign writes");
  assert.equal((await recovery.getSnapshots(TID, null)).length, 3, "the other owner's history is capped on its own");
  assert.equal((await recovery.listTournamentBackups("user-td-1")).length, 1);
});
