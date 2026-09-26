// src/utils/__tests__/chip-recovery-reconnect.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-recovery-reconnect.test.ts
// Web Chip local recovery — Phase 1 safety fixes:
//   A. Offline entry point: reachable without a cloud profile / Admin navigation, lists only
//      the stored session's backups, correct tournament selectable, hidden otherwise.
//   B. Reconnect ORDER: with the save queue paused, no queued/stale/retrying Chip write can
//      reach the cloud before the authoritative cloud state is loaded and compared.
// The cloud is a fake that logs every write attempt and load IN ORDER; the queue is the real
// chip.save-queue with real (short) timers, driven exactly like the viewmodel drives it.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
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
  startPendingMatch,
  withRestorePoint,
} from "../../models/services/chip.engine";
import {
  ChipRecoverySnapshotInput,
  checkCloudForRecovery,
  chipRecoveryFingerprint,
  chipRecoveryPath,
  createChipLocalRecovery,
  createMemoryRecoveryStorage,
  decideOfflineRecoveryEntry,
  discardPendingForCloud,
  isDivergentUnconfirmedBackup,
  pickRecoveryTournamentInfo,
} from "../../models/services/chip.local-recovery";
import { createChipSaveQueue } from "../../models/services/chip.save-queue";
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
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  const next = pipeline(fn(c));
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  const newEvents = next.events.slice(0, added);
  return withRestorePoint(next, c, newEvents.map((e) => e.id), newEvents[0].text);
};
const liveState = (): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: ["A", "B", "C", "D", "E", "F"].map(entry) };
  s = addTables(s, 2);
  return startAllMatches(startChipTournament(s));
};
const startPending = (s: ChipState): ChipState => {
  let out = s;
  for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) out = act(out, (c) => startPendingMatch(c, t.id));
  return out;
};
const liveMatch = (s: ChipState) => s.matches.find((m) => m.status === "in_progress");
// Record a result on the first live match; `pick` chooses the winner side.
const win = (s: ChipState, pick: "a" | "b" = "a") => {
  const ready = liveMatch(s) ? s : startPending(s);
  const m = liveMatch(ready)!;
  return act(ready, (c) => recordWinner(c, m.id, pick === "a" ? m.aId : m.bId));
};

const OWNER = "user-td-1";
const info = (id: number, name: string) =>
  pickRecoveryTournamentInfo({ id, name, status: "active", live_state: "in_progress", tournament_format: "chip-tournament" });
const snapInput = (tid: number, chip: ChipState, over: Partial<ChipRecoverySnapshotInput> = {}): ChipRecoverySnapshotInput => ({
  tournamentId: tid,
  ownerUserId: OWNER,
  tournament: info(tid, `Tournament ${tid}`),
  chip,
  reason: "action",
  cloudVersion: 1,
  cloudConfirmed: false,
  finished: false,
  ...over,
});

// ── fake cloud (ordered log) ─────────────────────────────────────────────────
const makeCloud = (initial: ChipState) => {
  const cloud = {
    online: true,
    state: initial,
    log: [] as string[],
    writes: [] as ChipState[],
    gate: null as Promise<void> | null,
    async save(s: ChipState) {
      cloud.log.push("write-attempt");
      if (cloud.gate) await cloud.gate;
      if (!cloud.online) throw Object.assign(new Error("TypeError: Failed to fetch"), { code: "", status: 0 });
      cloud.state = s;
      cloud.writes.push(s);
      cloud.log.push("write");
      return { version: cloud.writes.length };
    },
    async load() {
      if (!cloud.online) throw new TypeError("Failed to fetch");
      cloud.log.push("load");
      return { chip: cloud.state };
    },
  };
  return cloud;
};
const makeQueue = (cloud: ReturnType<typeof makeCloud>) =>
  createChipSaveQueue<ChipState, { version: number }>({ save: (s) => cloud.save(s), retryDelaysMs: [30, 30] });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════ A. offline recovery entry point ═════════════════════
test("A1. cloud profile load fails + local backup → entry point shown, opens a non-Admin route", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  await recovery.saveSnapshot(snapInput(77, win(liveState())));
  const backups = await recovery.listTournamentBackups(OWNER);
  const d = decideOfflineRecoveryEntry({
    isWeb: true,
    authLoading: false,
    hasProfile: false, // AuthProvider could not load the profile (no Admin nav rendered)
    storedUserId: OWNER, // session persisted on this browser (not refreshed, not faked)
    backups,
    cloudReachable: false,
  });
  assert.equal(d.show, true);
  assert.deepEqual(d.backups.map((b) => b.tournamentId), [77]);
  const path = chipRecoveryPath(77);
  assert.equal(path, "/chip-recovery/77");
  assert.ok(!path.includes("admin"), "entry route is outside /admin (no Admin pages or gating needed)");
  const root = join(__dirname, "..", "..", "..");
  assert.ok(existsSync(join(root, "app", "chip-recovery", "[id].tsx")), "route file at app/chip-recovery/[id].tsx");
  assert.ok(!existsSync(join(root, "app", "(tabs)", "chip-recovery")), "not nested under the tabs/admin tree");
});

test("A2. multiple backups → compact list, newest first; the chosen tournament opens; other users' hidden", async () => {
  let now = Date.parse("2026-09-25T21:00:00Z");
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage(), { now: () => now });
  const a = win(liveState());
  const b = win(win(liveState()));
  await recovery.saveSnapshot({ ...snapInput(10, a), tournament: info(10, "JJ's 9 Ball Chip Tournament") });
  now += 60_000;
  await recovery.saveSnapshot({ ...snapInput(20, b), tournament: info(20, "Tuesday 8 Ball Chip") });
  now += 60_000;
  await recovery.saveSnapshot({ ...snapInput(30, a), ownerUserId: "someone-else" });
  const list = await recovery.listTournamentBackups(OWNER);
  assert.deepEqual(list.map((x) => x.tournamentId), [20, 10], "one row per tournament, newest first");
  const d = decideOfflineRecoveryEntry({ isWeb: true, authLoading: false, hasProfile: false, storedUserId: OWNER, backups: list, cloudReachable: false });
  assert.equal(d.backups.length, 2);
  // Selecting JJ's opens JJ's board (what the /chip-recovery/10 viewer loads).
  const picked = await recovery.getLatestSnapshot(10);
  assert.equal(picked?.tournament.name, "JJ's 9 Ball Chip Tournament");
  assert.equal(picked?.fingerprint, chipRecoveryFingerprint(a));
  assert.equal((await recovery.getLatestSnapshot(20))?.fingerprint, chipRecoveryFingerprint(b));
});

test("A3. no backup / cloud back / profile loaded / no stored session / native → entry hidden (normal behavior)", async () => {
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  await recovery.saveSnapshot(snapInput(77, win(liveState())));
  const backups = await recovery.listTournamentBackups(OWNER);
  const base = { isWeb: true, authLoading: false, hasProfile: false, storedUserId: OWNER, backups, cloudReachable: false };
  assert.equal(decideOfflineRecoveryEntry({ ...base, backups: [] }).show, false, "no backup → existing offline behavior");
  assert.equal(decideOfflineRecoveryEntry({ ...base, cloudReachable: true }).show, false, "cloud recovered → disappears");
  assert.equal(decideOfflineRecoveryEntry({ ...base, cloudReachable: null }).show, false, "not probed yet");
  assert.equal(decideOfflineRecoveryEntry({ ...base, hasProfile: true }).show, false, "auth recovered → normal nav");
  assert.equal(decideOfflineRecoveryEntry({ ...base, authLoading: true }).show, false);
  assert.equal(decideOfflineRecoveryEntry({ ...base, storedUserId: null }).show, false, "signed out → nothing exposed");
  assert.equal(decideOfflineRecoveryEntry({ ...base, storedUserId: "other" }).show, false, "other user's backups never listed");
  assert.equal(decideOfflineRecoveryEntry({ ...base, isWeb: false }).show, false, "native untouched");
});

// ═════════════════════ B. reconnect ordering ═════════════════════
test("B0. pause() interrupts a retry back-off and no attempt starts while paused (enqueue/retry included)", async () => {
  const base = liveState();
  const cloud = makeCloud(base);
  cloud.online = false;
  const queue = createChipSaveQueue<ChipState, { version: number }>({ save: (s) => cloud.save(s), retryDelaysMs: [5000, 5000] });
  queue.enqueue(win(base));
  await wait(10); // attempt 1 failed; now sleeping a 5s back-off
  const t0 = Date.now();
  await queue.pause();
  assert.ok(Date.now() - t0 < 1000, "pause woke the back-off instead of waiting it out");
  cloud.online = true;
  queue.enqueue(win(win(base)));
  queue.retry();
  await wait(60);
  assert.equal(cloud.writes.length, 0);
  assert.equal(cloud.log.filter((l) => l === "write-attempt").length, 1, "only the pre-pause attempt ever ran");
  assert.equal(queue.hasUnsaved(), true, "held, not dropped");
  assert.equal(queue.isSaving(), false);
});

test("4. pending unsaved Chip state when the connection returns → cloud is loaded and compared BEFORE any write", async () => {
  const base = win(liveState());
  const cloud = makeCloud(base);
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const queue = makeQueue(cloud);
  // Outage: the TD's newest action can't save; the queue is mid-retry.
  cloud.online = false;
  const localAhead = win(base);
  const snapshot = await recovery.saveSnapshot(snapInput(1, localAhead)); // snapshot point A
  queue.enqueue(localAhead);
  await wait(10);
  // Cloud load fails + backup exists → VM offers recovery and PAUSES the queue.
  void queue.pause();
  // Connectivity returns while the retry back-off would still fire.
  cloud.online = true;
  await wait(120); // > both back-offs
  assert.deepEqual(cloud.log.filter((l) => l === "write"), [], "no queued/retried write reached the cloud");
  const res = await checkCloudForRecovery({ queue, loadCloud: () => cloud.load(), cloudChipOf: (b) => b.chip, snapshot });
  assert.equal(cloud.log[cloud.log.length - 1], "load");
  assert.ok(!cloud.log.includes("write"), "compare happened with zero writes");
  assert.equal(res.unsavedSession, true);
  assert.equal(res.outcome, "conflict", "the held action is not in the cloud → TD decides");
  await wait(60);
  assert.equal(cloud.writes.length, 0, "still nothing written after the comparison");
});

test("4b. an attempt already SENT before pause settles first → the comparison sees its result (no write after load)", async () => {
  const base = win(liveState());
  const cloud = makeCloud(base);
  const queue = makeQueue(cloud);
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const next = win(base);
  const snapshot = await recovery.saveSnapshot(snapInput(1, next));
  let release!: () => void;
  cloud.gate = new Promise<void>((r) => (release = r));
  queue.enqueue(next);
  await wait(5); // request in flight (sent before the outage was detected)
  let paused = false;
  const pausing = queue.pause().then(() => (paused = true));
  await wait(20);
  assert.equal(paused, false, "pause() waits for the in-flight attempt");
  cloud.gate = null;
  release();
  await pausing;
  const res = await checkCloudForRecovery({ queue, loadCloud: () => cloud.load(), cloudChipOf: (b) => b.chip, snapshot });
  assert.deepEqual(cloud.log, ["write-attempt", "write", "load"], "write settled strictly before the load");
  assert.equal(res.outcome, "consistent");
});

test("5. cloud changed on another device → no queued write reaches Supabase; conflict", async () => {
  const base = win(liveState());
  const cloud = makeCloud(base);
  const queue = makeQueue(cloud);
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  cloud.online = false;
  const mine = win(base, "a"); // this device, never saved
  const snapshot = await recovery.saveSnapshot(snapInput(1, mine));
  queue.enqueue(mine);
  await wait(10);
  await queue.pause();
  // Meanwhile another director advanced the tournament in the cloud.
  const theirs = win(base, "b");
  cloud.state = theirs;
  cloud.online = true;
  await wait(120);
  const res = await checkCloudForRecovery({ queue, loadCloud: () => cloud.load(), cloudChipOf: (b) => b.chip, snapshot });
  assert.equal(res.outcome, "conflict");
  assert.equal(cloud.writes.length, 0);
  assert.equal(cloud.state, theirs, "newer cloud state untouched");
  assert.equal(queue.isPaused(), true, "queue stays paused after a conflict");
});

test("6. Use Cloud Version → pending writes discarded, cloud used, local backup kept set aside", async () => {
  const base = win(liveState());
  const cloud = makeCloud(base);
  const queue = makeQueue(cloud);
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  cloud.online = false;
  const mine = win(base, "a");
  const snapshot = await recovery.saveSnapshot(snapInput(1, mine));
  queue.enqueue(mine);
  await wait(10);
  await queue.pause();
  const theirs = win(base, "b");
  cloud.state = theirs;
  cloud.online = true;
  const res = await checkCloudForRecovery({ queue, loadCloud: () => cloud.load(), cloudChipOf: (b) => b.chip, snapshot });
  assert.equal(res.outcome, "conflict");
  // TD: Use Cloud Version (VM: discardPendingForCloud → load(exitRecovery) applies cloud → resume)
  await discardPendingForCloud(queue);
  assert.equal(queue.peekUnsaved(), null);
  assert.equal(queue.hasUnsaved(), false);
  const applied = (await cloud.load()).chip;
  // The normal load sets an unconfirmed divergent backup aside (archived, not deleted).
  const latest = await recovery.getLatestSnapshot(1);
  assert.equal(isDivergentUnconfirmedBackup(applied, latest), true);
  await recovery.archiveConflict(latest!);
  queue.resume();
  await wait(120);
  assert.equal(cloud.writes.length, 0, "the discarded stale write never reached the cloud");
  assert.equal(cloud.state, theirs);
  assert.ok(await recovery.getConflictArchive(1), "recovery copy kept set aside");
  assert.equal((await recovery.getLatestSnapshot(1))?.fingerprint, snapshot.fingerprint, "backup still present");
  // Online again: the next real action saves normally.
  const nextAction = win(applied);
  queue.enqueue(nextAction);
  assert.equal(await queue.flush(), true);
  assert.equal(cloud.state, nextAction);
});

test("7. Keep Local Backup Available → no cloud write; held state is kept, not lost", async () => {
  const base = win(liveState());
  const cloud = makeCloud(base);
  const queue = makeQueue(cloud);
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  cloud.online = false;
  const mine = win(base, "a");
  const snapshot = await recovery.saveSnapshot(snapInput(1, mine));
  queue.enqueue(mine);
  await wait(10);
  await queue.pause();
  cloud.state = win(base, "b");
  cloud.online = true;
  const res = await checkCloudForRecovery({ queue, loadCloud: () => cloud.load(), cloudChipOf: (b) => b.chip, snapshot });
  assert.equal(res.outcome, "conflict");
  // Keep Local Backup Available: the VM only changes view state — the queue is left paused.
  // Stale-UI attempts to save / retry while the backup is viewed:
  queue.retry();
  queue.enqueue(mine);
  await wait(120);
  assert.equal(cloud.writes.length, 0);
  assert.equal(queue.isPaused(), true);
  assert.equal(chipRecoveryFingerprint(queue.peekUnsaved()!), chipRecoveryFingerprint(mine), "held, not dropped");
});

test("8. same cloud/local state → consistent; stale duplicate discarded; normal online mode resumes", async () => {
  const base = win(liveState());
  const cloud = makeCloud(base);
  const queue = makeQueue(cloud);
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage());
  const snapshot = await recovery.saveSnapshot(snapInput(1, base));
  // Outage right after a save that DID land: the queue still holds a same-content snapshot.
  cloud.online = false;
  queue.enqueue(base);
  await wait(10);
  await queue.pause();
  cloud.online = true;
  const res = await checkCloudForRecovery({ queue, loadCloud: () => cloud.load(), cloudChipOf: (b) => b.chip, snapshot });
  assert.equal(res.outcome, "consistent");
  assert.equal(cloud.writes.length, 0, "compare ran before any write");
  // switchToCloudVersion: discard (redundant) pending → apply cloud → resume.
  await discardPendingForCloud(queue);
  queue.resume();
  await wait(80);
  assert.equal(cloud.writes.length, 0, "nothing stale written on resume");
  const next = win(base);
  queue.enqueue(next);
  assert.equal(await queue.flush(), true);
  assert.equal(cloud.state, next, "online saving works again");
});
