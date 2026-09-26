// src/utils/__tests__/chip-persist-gate.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-persist-gate.test.ts
// Chip PERSISTENCE GATE: a board that did not come from an authoritative source (a signed-out
// visit whose rows RLS hid, a load still pending, an account switch) can never be saved to the
// cloud, retried, exit-flushed, or backed up locally — independent of RLS. Auth appearing
// later forces a fresh authenticated load before persistence is enabled. Uses the REAL gate,
// save queue and local-recovery writer, wired like useChipTournament; the fake cloud returns
// an empty (RLS-hidden) board to signed-out loads and counts every write reaching the service.
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
  withRestorePoint,
} from "../../models/services/chip.engine";
import {
  chipRecoveryFingerprint,
  createChipBackupWriter,
  createChipLocalRecovery,
  createMemoryRecoveryStorage,
  pickRecoveryTournamentInfo,
} from "../../models/services/chip.local-recovery";
import { ChipPersistBlockedError, createChipPersistGate, looksLikeHiddenBoard } from "../../models/services/chip.persist-gate";
import { createChipSaveQueue } from "../../models/services/chip.save-queue";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

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
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[0].text);
};
const liveState = (): ChipState => {
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: ["A", "B", "C", "D"].map(entry) };
  s = addTables(s, 1);
  return startAllMatches(startChipTournament(s));
};
const winFirst = (s: ChipState) => {
  const m = s.matches.find((x) => x.status === "in_progress");
  return m ? recordWinner(s, m.id, m.aId) : s;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TID = 2675;
const TD = "user-td-1";

// Cloud: RLS hides chip rows from signed-out reads (config readable → a started, empty board).
const makeCloud = (real: ChipState) => {
  const cloud = {
    state: clone(real),
    writes: 0, // writes that REACHED the service layer
    loads: [] as (string | null)[],
    async load(asUser: string | null) {
      cloud.loads.push(asUser);
      if (!asUser) return { chip: { ...clone(cloud.state), entries: [], matches: [], events: [] } as ChipState, version: 1 };
      return { chip: clone(cloud.state), version: 1 };
    },
    async save(s: ChipState) {
      cloud.writes++;
      cloud.state = clone(s);
      return { version: 2, conflict: false };
    },
  };
  return cloud;
};

// ── manager harness: mirrors the viewmodel's gate wiring ──────────────────────
const makeManager = (cloud: ReturnType<typeof makeCloud>, db = new Map<string, unknown>()) => {
  const gate = createChipPersistGate();
  const recovery = createChipLocalRecovery(createMemoryRecoveryStorage(db));
  const m = {
    auth: { userId: null as string | null, profileReady: false },
    storedUserId: null as string | null,
    offline: false,
    chip: null as ChipState | null,
    loaded: false,
    pending: null as ChipState | null,
    blocked: [] as string[],
    gate,
    recovery,
    db,
  };
  const cloudOk = () => gate.canWriteCloud({ authUserId: m.auth.userId, profileReady: m.auth.profileReady });
  const localOk = () => gate.canWriteLocal({ authUserId: m.auth.userId, storedUserId: m.storedUserId });
  const writer = createChipBackupWriter(recovery, { defer: (fn) => fn() });
  const queue = createChipSaveQueue<ChipState, { version: number; conflict: boolean }>({
    save: async (s) => {
      if (!cloudOk()) throw new ChipPersistBlockedError(); // defense in depth
      return cloud.save(s);
    },
    onAttemptFailed: ({ error }) => {
      if (error instanceof ChipPersistBlockedError) queue.dropUnsaved();
    },
    onGaveUp: (_s, error) => {
      if (error instanceof ChipPersistBlockedError) queue.dropUnsaved(); // as the viewmodel does
    },
    retryDelaysMs: [5, 5],
  });
  const backup = () => {
    if (!m.chip || !localOk()) return;
    writer.schedule({
      tournamentId: TID,
      ownerUserId: gate.owner(),
      tournament: pickRecoveryTournamentInfo({ id: TID, name: "ZZ" }),
      chip: m.chip,
      reason: "action",
      cloudVersion: 1,
      cloudConfirmed: false,
      finished: false,
    });
  };
  // the debounced auto-save effect + backup effect after a committed chip change
  const afterCommit = () => {
    backup();
    if (!cloudOk()) return; // gate: never schedule
    m.pending = m.chip;
  };
  const flushSave = async () => {
    const toSave = m.pending;
    m.pending = null;
    if (!cloudOk()) {
      queue.dropUnsaved();
      return false;
    }
    if (toSave) queue.enqueue(toSave);
    else queue.retry();
    return queue.flush();
  };
  const load = async (forceFresh = false) => {
    const authAtStart = m.auth.userId;
    const b = await cloud.load(authAtStart);
    if (!forceFresh && m.loaded && queue.hasUnsaved()) return;
    gate.markCloudLoad({ authUserIdAtStart: authAtStart, chip: b.chip });
    m.chip = b.chip;
    m.loaded = true;
    afterCommit();
  };
  const action = (label: string, fn: (s: ChipState) => ChipState) => {
    if (!gate.canMutate({ authUserId: m.auth.userId, offline: m.offline })) {
      m.blocked.push(label);
      return false;
    }
    m.chip = act(m.chip as ChipState, fn);
    afterCommit();
    return true;
  };
  // auth effect: sign-in / account switch after an unauthoritative load
  const setAuth = async (userId: string | null, profileReady: boolean) => {
    m.auth = { userId, profileReady };
    if (gate.source() === "cloud" && gate.owner() !== userId) gate.markUnauthoritative();
    if (gate.needsFreshLoad({ authUserId: userId, profileReady, loaded: m.loaded })) {
      queue.dropUnsaved();
      m.pending = null;
      await load(true);
    }
  };
  const leave = () => {
    if (!cloudOk()) {
      queue.dropUnsaved();
      m.pending = null;
      return;
    }
    if (m.pending) queue.enqueue(m.pending);
    else queue.retry();
  };
  return { m, gate, queue, writer, load, action, flushSave, setAuth, leave, backup };
};
const ownerlessBackups = (db: Map<string, unknown>) => [...db.values()].filter((r: any) => !r.ownerUserId).length;

// ═══════════════════════════════════════════════════════════════════════════
test("1. signed out → open live manage route: empty board may render, zero cloud writes, zero ownerless backups", async () => {
  const cloud = makeCloud(liveState());
  const h = makeManager(cloud);
  await h.load();
  assert.equal(h.m.chip?.entries.length, 0, "RLS-hidden empty board renders");
  assert.equal(looksLikeHiddenBoard(h.m.chip!), true);
  assert.equal(h.gate.source(), "none");
  await h.flushSave();
  await h.writer.flush();
  await wait(30);
  assert.equal(cloud.writes, 0);
  assert.equal(h.m.db.size, 0, "no local backup at all");
  assert.equal(ownerlessBackups(h.m.db), 0);
});

test("2. signed out → the auto-save path is blocked BEFORE the service layer", async () => {
  const cloud = makeCloud(liveState());
  const h = makeManager(cloud);
  await h.load();
  assert.equal(h.m.pending, null, "the save effect never scheduled");
  assert.equal(h.action("winner", winFirst), false, "board changes refused (not authoritative)");
  // even a save forced straight into the queue is refused by the queue's own gate
  h.queue.enqueue(h.m.chip!);
  await h.queue.flush();
  assert.equal(cloud.writes, 0);
  assert.equal(h.queue.hasUnsaved(), false, "blocked snapshot dropped, never held for later");
});

test("3. signed out → sign in on the same page → empty board NOT saved; fresh authenticated load first", async () => {
  const real = liveState();
  const cloud = makeCloud(real);
  const h = makeManager(cloud);
  await h.load();
  h.queue.enqueue(h.m.chip!); // something stale sitting around
  await h.queue.flush();
  // user signs in: session first, then the profile resolves
  await h.setAuth(TD, false);
  assert.equal(cloud.writes, 0, "session alone (profile pending) persists nothing");
  await h.setAuth(TD, true);
  assert.deepEqual(cloud.loads, [null, TD], "a fresh AUTHENTICATED load happened");
  assert.equal(h.gate.source(), "cloud");
  assert.equal(chipRecoveryFingerprint(h.m.chip!), chipRecoveryFingerprint(real), "real board now on screen");
  assert.equal(h.m.chip!.entries.length, 4);
  await h.flushSave();
  assert.equal(cloud.writes, 1, "only the authoritative board is saved");
  assert.equal(cloud.state.entries.length, 4, "the empty board never reached the cloud");
});

test("4. signed out → Retry now → cannot persist the stale/empty state", async () => {
  const cloud = makeCloud(liveState());
  const h = makeManager(cloud);
  await h.load();
  h.m.pending = h.m.chip; // pretend something was pending
  assert.equal(await h.flushSave(), false, "Retry now refused");
  h.queue.retry();
  await h.queue.flush();
  assert.equal(cloud.writes, 0);
  // even after the session appears (profile still loading) Retry cannot push it
  h.m.auth = { userId: TD, profileReady: false };
  assert.equal(await h.flushSave(), false);
  assert.equal(cloud.writes, 0);
});

test("5. signed out → navigate away → the exit flush writes nothing", async () => {
  const cloud = makeCloud(liveState());
  const h = makeManager(cloud);
  await h.load();
  h.m.pending = h.m.chip;
  h.leave();
  await h.queue.flush();
  await wait(30);
  assert.equal(cloud.writes, 0);
  assert.equal(h.queue.hasUnsaved(), false);
});

test("6. authenticated TD → normal online saves still work (and backups are owner-scoped)", async () => {
  const cloud = makeCloud(liveState());
  const h = makeManager(cloud);
  h.m.auth = { userId: TD, profileReady: true };
  await h.load();
  assert.equal(h.gate.source(), "cloud");
  assert.equal(h.action("winner", winFirst), true);
  assert.equal(await h.flushSave(), true);
  assert.equal(cloud.writes, 1);
  assert.equal(chipRecoveryFingerprint(cloud.state), chipRecoveryFingerprint(h.m.chip!));
  await h.writer.flush();
  assert.equal(ownerlessBackups(h.m.db), 0);
  assert.equal((await h.m.recovery.getLatestSnapshot(TID, TD))?.fingerprint, chipRecoveryFingerprint(h.m.chip!));
  // signing out mid-page stops persistence immediately
  await h.setAuth(null, false);
  h.action("winner2", winFirst);
  assert.equal(await h.flushSave(), false);
  assert.equal(cloud.writes, 1);
});

test("7. verified owner-scoped offline session → local continuation still works; random visit cannot", async () => {
  // (a) the TD's own offline session, token expired (no live auth), stored session = owner
  const cloud = makeCloud(liveState());
  const h = makeManager(cloud);
  h.m.chip = liveState();
  h.m.loaded = true;
  h.m.offline = true;
  h.m.storedUserId = TD;
  h.gate.markOfflineSession(TD);
  assert.equal(h.action("winner", winFirst), true, "offline play continues");
  await h.writer.flush();
  assert.equal((await h.m.recovery.getLatestSnapshot(TID, TD))?.fingerprint, chipRecoveryFingerprint(h.m.chip!), "backed up locally");
  assert.equal(await h.flushSave(), false, "no cloud push while the owner isn't signed in");
  assert.equal(cloud.writes, 0);
  h.m.auth = { userId: TD, profileReady: false };
  assert.equal(h.gate.canWriteCloud({ authUserId: TD, profileReady: false }), true, "owner back → reconnect push allowed");
  // (b) a random signed-out visit: never authoritative, never an offline controller
  const r = makeManager(makeCloud(liveState()));
  await r.load();
  r.m.offline = true;
  r.m.storedUserId = null;
  assert.equal(r.gate.canWriteLocal({ authUserId: null, storedUserId: null }), false);
  assert.equal(r.gate.canMutate({ authUserId: null, offline: true }), false, "can't become a writable offline board");
  assert.equal(r.action("winner", winFirst), false);
  // (c) another account's stored session can't use TD's offline session
  const o = createChipPersistGate();
  o.markOfflineSession(TD);
  assert.equal(o.canWriteCloud({ authUserId: "someone-else", profileReady: true }), false);
  assert.equal(o.canWriteLocal({ authUserId: "someone-else", storedUserId: "someone-else" }), false);
});

test("gate unit: authority rules", () => {
  const g = createChipPersistGate();
  const real = liveState();
  assert.equal(g.markCloudLoad({ authUserIdAtStart: null, chip: real }), false, "load that started signed out");
  assert.equal(g.markCloudLoad({ authUserIdAtStart: TD, chip: { ...real, entries: [] } }), false, "rows hidden");
  assert.equal(g.markCloudLoad({ authUserIdAtStart: TD, chip: real }), true);
  assert.equal(g.canWriteCloud({ authUserId: TD, profileReady: false }), false, "profile must resolve");
  assert.equal(g.canWriteCloud({ authUserId: TD, profileReady: true }), true);
  assert.equal(g.canWriteCloud({ authUserId: "other", profileReady: true }), false, "account switched");
  assert.equal(g.needsFreshLoad({ authUserId: "other", profileReady: true, loaded: true }), true);
  const setup = emptyChipState("singles"); // a genuinely empty SETUP board is fine
  assert.equal(g.markCloudLoad({ authUserIdAtStart: TD, chip: setup }), true);
});
