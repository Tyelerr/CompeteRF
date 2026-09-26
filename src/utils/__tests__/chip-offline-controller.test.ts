// src/utils/__tests__/chip-offline-controller.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-offline-controller.test.ts
// Web Chip OFFLINE CONTROLLER (Phase 2): a live tournament keeps running through an outage.
// Uses the REAL save queue, local-recovery store, engine and reconnectOfflineController,
// wired by a small harness that mirrors useChipTournament (enter offline on an outage save
// failure, pause the queue, every committed state → IndexedDB snapshot + held queue entry,
// reconnect = load → compare → one verified push). The fake cloud logs attempts/loads/writes
// in order and stores events by id (append-only, like chip_events).
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTables,
  adjustChips,
  assignFinals,
  emptyChipState,
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
  ChipRecoveryStorage,
  chipRecoveryFingerprint,
  createChipBackupWriter,
  createChipLocalRecovery,
  createMemoryRecoveryStorage,
  pickRecoveryTournamentInfo,
} from "../../models/services/chip.local-recovery";
import {
  canResumeOfflineSession,
  ChipOfflineMode,
  ChipOfflineSession,
  classifyCloudOnReconnect,
  createOfflineSession,
  isOutageError,
  noteSentFingerprint,
  offlineModeBlocksActions,
  reconnectOfflineController,
  shouldEnterOfflineOnSaveFailure,
} from "../../models/services/chip.offline-controller";
import { createChipSaveQueue } from "../../models/services/chip.save-queue";
import { ChipEntry, ChipState } from "../../models/types/chip.types";
import { ConnectionRequiredError, onlineOnlyWrite } from "../connection-required";

// ── engine fixtures ───────────────────────────────────────────────────────────
const entry = (name: string): ChipEntry =>
  ({
    id: newId("e"), p1Name: name, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500,
    startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
    wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: new Date().toISOString(),
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
const liveMatch = (s: ChipState) => s.matches.find((m) => m.status === "in_progress");
const startPendingFn = (s: ChipState): ChipState => {
  let out = s;
  for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) out = startPendingMatch(out, t.id);
  return out;
};
const winFn = (pick: "a" | "b" = "a") => (s: ChipState): ChipState => {
  const ready = liveMatch(s) ? s : pipeline(startPendingFn(s));
  const m = liveMatch(ready)!;
  return recordWinner(ready, m.id, pick === "a" ? m.aId : m.bId);
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TID = 2675;
const OWNER = "user-td-1";

// ── fake cloud ────────────────────────────────────────────────────────────────
const outageError = () => Object.assign(new Error("TypeError: Failed to fetch"), { code: "", status: 0 });
const makeCloud = (initial: ChipState) => {
  const cloud = {
    online: true,
    browserOnline: true as boolean | null,
    state: clone(initial),
    version: 1,
    events: new Map<string, unknown>(), // chip_events: insert-ignore by id
    eventInsertRows: 0, // rows actually inserted (duplicates would inflate this)
    log: [] as string[],
    writes: 0,
    async save(s: ChipState) {
      cloud.log.push("write-attempt");
      if (!cloud.online) throw outageError();
      cloud.state = clone(s);
      for (const ev of s.events) {
        if (!cloud.events.has(ev.id)) {
          cloud.events.set(ev.id, ev);
          cloud.eventInsertRows++;
        }
      }
      cloud.version++;
      cloud.writes++;
      cloud.log.push("write");
      return { version: cloud.version, conflict: false };
    },
    async load() {
      cloud.log.push("load-attempt");
      if (!cloud.online) throw outageError();
      cloud.log.push("load");
      return { chip: clone(cloud.state), version: cloud.version };
    },
    // Test hook: runs INSIDE the race window (after the comparison, at the claim).
    onClaim: null as null | (() => void),
    // chipService.claimChipVersion: atomic UPDATE version = v+1 WHERE version = v.
    async claim(expected: number): Promise<"claimed" | "changed" | "unsupported"> {
      cloud.log.push("claim");
      if (!cloud.online) throw outageError();
      cloud.onClaim?.();
      if (cloud.version !== expected) return "changed";
      cloud.version = expected + 1;
      return "claimed";
    },
  };
  for (const ev of initial.events) cloud.events.set(ev.id, ev);
  return cloud;
};
type Cloud = ReturnType<typeof makeCloud>;

// Storage that can be made to fail (IndexedDB quota / private mode).
const flakyStorage = () => {
  const inner = createMemoryRecoveryStorage(new Map());
  const ctl = { fail: false, backing: inner };
  const storage: ChipRecoveryStorage = {
    put: async (r) => {
      if (ctl.fail) throw new Error("QuotaExceededError");
      return inner.put(r);
    },
    listByTournament: (t) => inner.listByTournament(t),
    listAll: () => inner.listAll(),
    delete: (k) => inner.delete(k),
  };
  return { storage, ctl };
};

// ── controller harness (mirrors useChipTournament's offline wiring) ──────────
const makeController = (cloud: Cloud, storage: ChipRecoveryStorage, start: ChipState) => {
  const recovery = createChipLocalRecovery(storage);
  const c = {
    chip: start,
    mode: "online" as ChipOfflineMode,
    session: null as ChipOfflineSession | null,
    unconfirmed: 0,
    version: cloud.version,
    lastCloudSaved: start as ChipState | null,
    sentFps: [] as string[],
    localWrites: 0,
    localFailures: 0,
    blocked: [] as string[],
    lastReason: null as string | null,
    recovery,
  };
  const writer = createChipBackupWriter(recovery, {
    defer: (fn) => fn(),
    onWritten: () => {
      c.localWrites++;
      if (c.mode === "local_save_failed") c.mode = "offline";
    },
    onError: () => {
      c.localFailures++;
      if (c.mode === "offline") c.mode = "local_save_failed";
    },
  });
  const queue = createChipSaveQueue<ChipState, { version: number; conflict: boolean }>({
    save: async (s) => {
      const fp = chipRecoveryFingerprint(s);
      if (!c.sentFps.includes(fp)) c.sentFps.push(fp);
      if (c.session) c.session = noteSentFingerprint(c.session, fp);
      return cloud.save(s);
    },
    onSaved: (r, s) => {
      c.version = r.version;
      c.lastCloudSaved = s;
      if (s === c.chip) c.unconfirmed = 0;
    },
    onAttemptFailed: ({ error, attempt, maxAttempts }) => {
      if (c.mode === "online" && shouldEnterOfflineOnSaveFailure({ error, attempt, maxAttempts, browserOnline: cloud.browserOnline })) {
        enterOffline();
      }
    },
    retryDelaysMs: [5, 5],
  });
  const backup = (force = false) => {
    if (offlineModeBlocksActions(c.mode) && !force) return;
    writer.schedule({
      tournamentId: TID,
      ownerUserId: OWNER,
      tournament: pickRecoveryTournamentInfo({ id: TID, name: "ZZ", live_state: "in_progress" }),
      chip: c.chip,
      reason: "action",
      cloudVersion: c.version,
      cloudConfirmed: c.chip === c.lastCloudSaved,
      finished: false,
      offlineSession: c.session ? { ...c.session, unsyncedCount: c.unconfirmed } : null,
    });
  };
  const enterOffline = () => {
    if (c.mode !== "online") return;
    void queue.pause();
    c.session =
      c.session ??
      createOfflineSession({
        tournamentId: TID,
        ownerUserId: OWNER,
        baseCloudVersion: c.version,
        baseChip: c.lastCloudSaved,
        startLocalSeq: 0,
        pendingUnsynced: c.unconfirmed,
        sentFingerprints: c.sentFps,
      });
    c.mode = "offline";
    backup(true);
  };
  // update(): engine mutation → committed state → local snapshot → auto-save (held if paused)
  const run = (label: string, fn: (s: ChipState) => ChipState) => {
    if (offlineModeBlocksActions(c.mode)) {
      c.blocked.push(label);
      return false;
    }
    c.chip = act(c.chip, fn);
    c.unconfirmed++;
    backup();
    queue.enqueue(c.chip);
    return true;
  };
  const undo = () => {
    if (offlineModeBlocksActions(c.mode)) return false;
    c.chip = undoLastActions(c.chip, 1, { reason: "test" });
    c.unconfirmed++;
    backup();
    queue.enqueue(c.chip);
    return true;
  };
  const reconnect = async () => {
    if (c.mode !== "offline" || !c.session) return "skipped";
    c.mode = "reconnecting";
    const res = await reconnectOfflineController({
      session: c.session,
      queue,
      loadCloud: () => cloud.load(),
      cloudChipOf: (b) => b.chip,
      latestLocal: () => c.chip,
      onUnchanged: () => {
        c.mode = "syncing";
      },
      claimVersion: (b) => cloud.claim(b.version),
      beforePush: (b, _t, claim) => {
        c.version = claim === "claimed" ? b.version + 1 : b.version;
      },
    });
    c.lastReason = res.outcome === "conflict" ? res.reason : null;
    if (res.outcome === "still_offline") c.mode = "offline";
    else if (res.outcome === "conflict") c.mode = "conflict";
    else {
      c.mode = "online";
      c.session = null;
      c.unconfirmed = 0;
    }
    return res.outcome;
  };
  return { c, queue, writer, run, undo, reconnect, enterOffline, backup };
};

const goOffline = (cloud: Cloud) => {
  cloud.online = false;
  cloud.browserOnline = false;
};
const goOnline = (cloud: Cloud) => {
  cloud.online = true;
  cloud.browserOnline = true;
};

// ═══════════════════════════════════════════════════════════════════════════
test("1. active tournament loses connection → offline controller mode, save queue paused", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.run("winner", winFn()); // the auto-save fails with an outage → controller goes offline
  await wait(40);
  assert.equal(h.c.mode, "offline");
  assert.equal(h.queue.isPaused(), true);
  assert.equal(h.queue.hasUnsaved(), true, "the failed snapshot is HELD, not dropped");
  const attempts = cloud.log.filter((l) => l === "write-attempt").length;
  await wait(60);
  assert.equal(cloud.log.filter((l) => l === "write-attempt").length, attempts, "no further attempts (no hammering)");
  assert.equal(h.c.session?.baseCloudVersion, 1);
  assert.equal(h.c.session?.baseFingerprint, chipRecoveryFingerprint(start));
});

test("1b. validation/permission errors never switch to offline mode", () => {
  for (const e of [
    { message: "new row violates check constraint", code: "23514", status: 400 },
    { message: "permission denied for table chip_entries", code: "42501", status: 403 },
    { message: "JWT expired", code: "PGRST301", status: 401 },
  ]) {
    assert.equal(isOutageError(e, true), false, JSON.stringify(e));
    assert.equal(shouldEnterOfflineOnSaveFailure({ error: e, attempt: 3, maxAttempts: 3, browserOnline: true }), false);
  }
  const net = { message: "TypeError: Failed to fetch", status: 0 };
  assert.equal(shouldEnterOfflineOnSaveFailure({ error: net, attempt: 1, maxAttempts: 3, browserOnline: true }), false, "one blip absorbed by retries");
  assert.equal(shouldEnterOfflineOnSaveFailure({ error: net, attempt: 3, maxAttempts: 3, browserOnline: true }), true);
  assert.equal(shouldEnterOfflineOnSaveFailure({ error: net, attempt: 1, maxAttempts: 3, browserOnline: false }), true, "browser offline → immediate");
  assert.equal(isOutageError({ message: "upstream error", status: 503 }, true), true);
});

test("2. winner selected offline → local state changes, chip deduction correct, snapshot written, zero cloud writes", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.enterOffline();
  const before = h.c.chip;
  const m = liveMatch(before)!;
  const loserBefore = before.entries.find((e) => e.id === m.bId)!.chips;
  const writesBefore = cloud.writes;
  const attemptsBefore = cloud.log.filter((l) => l === "write-attempt").length;
  assert.equal(h.run("winner", (s) => recordWinner(s, m.id, m.aId)), true, "action allowed offline");
  await wait(30);
  const loserAfter = h.c.chip.entries.find((e) => e.id === m.bId)!.chips;
  assert.equal(loserAfter, loserBefore - 1, "loser lost exactly one chip");
  const latest = await h.c.recovery.getLatestSnapshot(TID);
  assert.equal(latest?.fingerprint, chipRecoveryFingerprint(h.c.chip), "IndexedDB snapshot = current state");
  assert.ok(latest?.offlineSession, "snapshot carries the offline session");
  assert.equal(cloud.writes, writesBefore, "zero cloud writes");
  assert.equal(cloud.log.filter((l) => l === "write-attempt").length, attemptsBefore, "not even an attempt");
});

test("3. multiple offline actions → latest state correct, unsynced count grows, snapshots persist (rolling 3)", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.enterOffline();
  // (TD actions are seconds apart; each one's snapshot lands before the next.)
  h.run("winner", winFn("a"));
  await wait(5);
  h.run("chips", (s) => adjustChips(s, s.entries[0].id, 1, { reason: "test" }));
  await wait(5);
  h.run("winner2", winFn("b"));
  await wait(5);
  h.run("queue", (s) => (s.queue.length > 1 ? reorderQueue(s, s.queue[1], "top") : s));
  await wait(20);
  assert.equal(h.c.unconfirmed, 4);
  const snaps = await h.c.recovery.getSnapshots(TID);
  assert.equal(snaps.length, 3, "rolling history kept");
  assert.equal(snaps[0].fingerprint, chipRecoveryFingerprint(h.c.chip));
  assert.equal(snaps[0].offlineSession?.unsyncedCount, 4);
  assert.equal(cloud.writes, 0);
});

test("3b. a burst faster than IndexedDB collapses to the NEWEST state (never an older one)", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.enterOffline();
  for (let i = 0; i < 4; i++) h.run(`w${i}`, winFn(i % 2 ? "a" : "b"));
  await h.writer.flush();
  assert.equal((await h.c.recovery.getLatestSnapshot(TID))?.fingerprint, chipRecoveryFingerprint(h.c.chip));
  assert.equal((await h.c.recovery.getLatestSnapshot(TID))?.offlineSession?.unsyncedCount, 4);
});

test("4. Undo offline → prior state restored, new local snapshot written", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.enterOffline();
  h.run("winner", winFn());
  const afterWin = h.c.chip;
  const writesBefore = h.c.localWrites;
  assert.equal(h.undo(), true);
  await wait(10);
  const reverted = h.c.chip;
  assert.deepEqual(
    reverted.entries.map((e) => [e.id, e.chips, e.status]),
    start.entries.map((e) => [e.id, e.chips, e.status]),
    "chips/status back to before the winner",
  );
  assert.notEqual(chipRecoveryFingerprint(reverted), chipRecoveryFingerprint(afterWin));
  assert.ok(reverted.events.some((e) => e.superseded), "undone events superseded (history kept)");
  assert.equal(h.c.localWrites, writesBefore + 1, "a new snapshot for the undo");
  assert.equal((await h.c.recovery.getLatestSnapshot(TID))?.fingerprint, chipRecoveryFingerprint(reverted));
  assert.equal(cloud.writes, 0);
});

test("5. browser close/reopen → unsynced offline state recoverable; same owner may resume, others read-only", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const db = new Map<string, unknown>();
  const h = makeController(cloud, createMemoryRecoveryStorage(db), start);
  goOffline(cloud);
  h.enterOffline();
  h.run("w1", winFn());
  h.run("w2", winFn());
  await wait(10);
  // "restart": a brand-new service over the same persisted database
  const reopened = createChipLocalRecovery(createMemoryRecoveryStorage(db));
  const snap = await reopened.getLatestSnapshot(TID);
  assert.equal(snap?.fingerprint, chipRecoveryFingerprint(h.c.chip));
  assert.equal(snap?.offlineSession?.unsyncedCount, 2);
  assert.equal(snap?.offlineSession?.baseFingerprint, chipRecoveryFingerprint(start), "base survives the restart");
  const args = { snapshotOwnerUserId: snap!.ownerUserId, session: snap!.offlineSession, tournamentId: TID };
  assert.equal(canResumeOfflineSession({ ...args, storedUserId: OWNER }), true, "same stored-session owner → resume");
  assert.equal(canResumeOfflineSession({ ...args, storedUserId: "someone-else" }), false, "other account → read-only");
  assert.equal(canResumeOfflineSession({ ...args, storedUserId: null }), false, "unverifiable owner → read-only");
});

test("6. reconnect, cloud unchanged → load first, ONE sync, verified, Online; no duplicate events/results/chips", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.run("w1", winFn("a")); // fails → offline
  await wait(40);
  assert.equal(h.c.mode, "offline");
  h.run("w2", winFn("b"));
  h.run("chips", (s) => adjustChips(s, s.entries[2].id, -1, { reason: "test" }));
  h.undo();
  h.run("w3", winFn("a"));
  const local = h.c.chip;
  cloud.log.length = 0;
  goOnline(cloud);
  const outcome = await h.reconnect();
  assert.equal(outcome, "synced");
  assert.equal(h.c.mode, "online");
  assert.deepEqual(
    cloud.log,
    ["load-attempt", "load", "claim", "load-attempt", "load", "write-attempt", "write", "load-attempt", "load"],
    "load → compare → version claim → re-check → ONE write → verify",
  );
  assert.equal(chipRecoveryFingerprint(cloud.state), chipRecoveryFingerprint(local), "cloud = local continuation");
  // exactly once: every local event id stored once; nothing inserted twice
  assert.equal(cloud.events.size, local.events.length);
  assert.equal(cloud.eventInsertRows, local.events.length - start.events.length);
  const results = [...cloud.events.values()].filter((e: any) => e.type === "match_result");
  assert.equal(new Set(results.map((e: any) => e.id)).size, results.length, "no duplicate match_result");
  assert.deepEqual(cloud.state.entries.map((e) => e.chips), local.entries.map((e) => e.chips), "chips not double-deducted");
  assert.equal(h.queue.isPaused(), false, "queue resumed only after verification");
  assert.equal(h.c.unconfirmed, 0);
  // back online: a normal action saves normally
  h.run("w4", winFn());
  assert.equal(await h.queue.flush(), true);
  assert.equal(chipRecoveryFingerprint(cloud.state), chipRecoveryFingerprint(h.c.chip));
});

test("6b. a save that landed with its reply lost is recognised as our own → still syncs (no false conflict)", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  // The write lands, but the network dies before the reply → client sees a failure.
  const realSave = cloud.save.bind(cloud);
  let dropReply = true;
  cloud.save = async (s: ChipState) => {
    const r = await realSave(s);
    if (dropReply) {
      dropReply = false;
      goOffline(cloud);
      throw outageError();
    }
    return r;
  };
  h.run("w1", winFn());
  await wait(40);
  assert.equal(h.c.mode, "offline");
  h.run("w2", winFn());
  goOnline(cloud);
  assert.equal(await h.reconnect(), "synced");
  assert.equal(chipRecoveryFingerprint(cloud.state), chipRecoveryFingerprint(h.c.chip));
});

test("7. reconnect, cloud changed elsewhere → conflict, zero local overwrite, local copy retained", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.enterOffline();
  h.run("w1", winFn("a"));
  h.run("w2", winFn("a"));
  await wait(10);
  // another director changed the cloud meanwhile
  const theirs = act(start, winFn("b"));
  cloud.state = clone(theirs);
  cloud.version = 9;
  const writesBefore = cloud.writes;
  goOnline(cloud);
  assert.equal(await h.reconnect(), "conflict");
  assert.equal(h.c.mode, "conflict");
  assert.equal(cloud.writes, writesBefore, "nothing pushed");
  assert.equal(chipRecoveryFingerprint(cloud.state), chipRecoveryFingerprint(theirs), "cloud untouched");
  assert.equal(h.queue.isPaused(), true, "queue stays paused");
  assert.equal((await h.c.recovery.getLatestSnapshot(TID))?.fingerprint, chipRecoveryFingerprint(h.c.chip), "offline copy kept");
  assert.equal(h.run("w3", winFn()), false, "conflict: protected read-only");
  await wait(40);
  assert.equal(cloud.writes, writesBefore);
});

test("8. connection flaps → original base preserved, session never reset", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.enterOffline();
  const base = { v: h.c.session!.baseCloudVersion, fp: h.c.session!.baseFingerprint, at: h.c.session!.startedAt };
  h.run("w1", winFn());
  for (let i = 0; i < 3; i++) {
    // "online" event fires but the cloud is still unreachable
    cloud.browserOnline = true;
    assert.equal(await h.reconnect(), "still_offline");
    assert.equal(h.c.mode, "offline");
    h.enterOffline(); // browser "offline" again — must not recreate the session
    h.run(`w${i + 2}`, winFn());
  }
  assert.deepEqual(
    { v: h.c.session!.baseCloudVersion, fp: h.c.session!.baseFingerprint, at: h.c.session!.startedAt },
    base,
  );
  assert.equal(cloud.writes, 0);
  goOnline(cloud);
  assert.equal(await h.reconnect(), "synced", "and it still syncs against the ORIGINAL base");
});

test("9. player-side write while offline → blocked, nothing sent, no queue", async () => {
  let calls = 0;
  const write = async () => {
    calls++;
    return "ok";
  };
  await assert.rejects(onlineOnlyWrite(true, false, write), ConnectionRequiredError);
  assert.equal(calls, 0, "request never made (nothing queued for later)");
  await assert.rejects(
    onlineOnlyWrite(true, true, async () => {
      throw new TypeError("Failed to fetch");
    }),
    (e: unknown) => e instanceof ConnectionRequiredError && /Connection required/.test((e as Error).message),
  );
  assert.equal(await onlineOnlyWrite(true, true, write), "ok");
  assert.equal(await onlineOnlyWrite(false, false, write), "ok", "native path unchanged");
});

test("10. IndexedDB write fails while offline → LOCAL SAVE FAILED, actions blocked until a local save succeeds", async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage, ctl } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.enterOffline();
  ctl.fail = true;
  h.run("w1", winFn());
  await wait(10);
  assert.equal(h.c.mode, "local_save_failed", "not pretending it's protected");
  assert.equal(h.run("w2", winFn()), false, "further actions refused");
  assert.deepEqual(h.c.blocked, ["w2"]);
  ctl.fail = false;
  h.backup(true); // Retry Local Save
  await wait(10);
  assert.equal(h.c.mode, "offline");
  assert.equal((await h.c.recovery.getLatestSnapshot(TID))?.fingerprint, chipRecoveryFingerprint(h.c.chip));
  assert.equal(h.run("w3", winFn()), true, "play resumes once locally protected");
});

test("classifyCloudOnReconnect: base, own-sent, and foreign states", () => {
  const base = liveState();
  const mine = act(base, winFn("a"));
  const theirs = act(base, winFn("b"));
  const s = noteSentFingerprint(
    createOfflineSession({ tournamentId: TID, ownerUserId: OWNER, baseCloudVersion: 1, baseChip: base, startLocalSeq: 0, pendingUnsynced: 0 }),
    chipRecoveryFingerprint(mine),
  );
  assert.equal(classifyCloudOnReconnect(base, s), "unchanged");
  assert.equal(classifyCloudOnReconnect(mine, s), "unchanged");
  assert.equal(classifyCloudOnReconnect(theirs, s), "changed");
});

// ── reconnect race window (comparison done, push not yet sent) ─────────────────
const raceSetup = async () => {
  const start = liveState();
  const cloud = makeCloud(start);
  const { storage } = flakyStorage();
  const h = makeController(cloud, storage, start);
  goOffline(cloud);
  h.enterOffline();
  h.run("w1", winFn("a"));
  h.run("w2", winFn("a"));
  await wait(10);
  goOnline(cloud);
  return { start, cloud, h };
};

test("race B1: another device SAVES (version bump) after the comparison, before the push → claim refused, push aborted", async () => {
  const { start, cloud, h } = await raceSetup();
  const theirs = act(start, winFn("b"));
  cloud.onClaim = () => {
    // a full Chip save by another device lands inside the window
    cloud.state = clone(theirs);
    cloud.version++;
  };
  const writesBefore = cloud.writes;
  assert.equal(await h.reconnect(), "conflict");
  assert.equal(h.c.lastReason, "precondition_failed");
  assert.equal(cloud.writes, writesBefore, "local push never sent");
  assert.equal(chipRecoveryFingerprint(cloud.state), chipRecoveryFingerprint(theirs), "their change intact");
  assert.equal(h.queue.isPaused(), true);
  assert.equal((await h.c.recovery.getLatestSnapshot(TID))?.fingerprint, chipRecoveryFingerprint(h.c.chip), "offline copy kept");
});

test("race B2: another device's save wrote rows but hasn't bumped the version yet → content re-check aborts the push", async () => {
  const { start, cloud, h } = await raceSetup();
  const theirs = act(start, winFn("b"));
  cloud.onClaim = () => {
    cloud.state = clone(theirs); // rows landed; version bump still pending on their side
  };
  const writesBefore = cloud.writes;
  assert.equal(await h.reconnect(), "conflict");
  assert.equal(h.c.lastReason, "changed_before_push");
  assert.equal(cloud.writes, writesBefore, "local push never sent");
  assert.equal(chipRecoveryFingerprint(cloud.state), chipRecoveryFingerprint(theirs));
});

test("race control: nothing happens in the window → claim succeeds, one push, verified", async () => {
  const { cloud, h } = await raceSetup();
  const v = cloud.version;
  assert.equal(await h.reconnect(), "synced");
  assert.equal(cloud.writes, 1);
  assert.equal(cloud.version, v + 2, "claimed (+1) then the save's own bump (+1)");
});

// ── fingerprint coverage: anything a sync can overwrite is detected ────────────
test("fingerprint detects settings, table label, table lock, stream, shuffle, restore points, event supersede", () => {
  const base = act(liveState(), winFn());
  const fp = chipRecoveryFingerprint(base);
  const variants: [string, ChipState][] = [
    ["settings.tiers", { ...base, settings: { ...base.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 4 }] } }],
    ["settings.buyBacks", { ...base, settings: { ...base.settings, buyBacksAllowed: !base.settings.buyBacksAllowed } }],
    ["table label", { ...base, tables: base.tables.map((t, i) => (i === 0 ? { ...t, label: "Stream Table" } : t)) }],
    ["table lock", { ...base, tables: base.tables.map((t, i) => (i === 0 ? { ...t, locked: !t.locked } : t)) }],
    ["table inactive", { ...base, tables: base.tables.map((t, i) => (i === 1 ? { ...t, inactive: !t.inactive } : t)) }],
    ["table stream url", { ...base, tables: base.tables.map((t, i) => (i === 0 ? { ...t, isStream: true, streamUrl: "https://x" } : t)) }],
    ["table order", { ...base, tables: base.tables.slice().reverse() }],
    ["shuffle mode", { ...base, shuffleMode: !base.shuffleMode }],
    ["restore points", { ...base, restorePoints: [] }],
    ["event superseded", { ...base, events: base.events.map((e, i) => (i === 0 ? { ...e, superseded: true } : e)) }],
    ["entry override", { ...base, entries: base.entries.map((e, i) => (i === 0 ? { ...e, fargoCapOverride: true } : e)) }],
    ["entry side pots", { ...base, entries: base.entries.map((e, i) => (i === 0 ? { ...e, paidSidePots: ["Test"] } : e)) }],
    ["match ended", { ...base, matches: base.matches.map((m, i) => (i === 0 ? { ...m, endedAt: "2026-09-26T06:30:00.000Z" } : m)) }],
  ];
  for (const [label, v] of variants) assert.notEqual(chipRecoveryFingerprint(v), fp, label);
});

test("fingerprint ignores cloud round-trip formatting (timestamps, numeric strings, key order, null vs missing)", () => {
  const base = act(liveState(), winFn());
  const roundTripped: ChipState = JSON.parse(JSON.stringify(base), (_k, v) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toISOString().replace("Z", "+00:00") : v,
  );
  // numeric column returned as a string, a nullable field returned as null, reordered jsonb keys
  roundTripped.entries = roundTripped.entries.map((e) => ({ ...(e as any), teamFargo: String(e.teamFargo), p2Fargo: null }));
  roundTripped.restorePoints = (roundTripped.restorePoints ?? []).map((rp) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(rp).reverse()))));
  assert.equal(chipRecoveryFingerprint(roundTripped), chipRecoveryFingerprint(base));
});
