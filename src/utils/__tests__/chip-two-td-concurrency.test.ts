// src/utils/__tests__/chip-two-td-concurrency.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-two-td-concurrency.test.ts
//
// Two TD devices operating the SAME Chip tournament. Both run the real engine and the real
// ordered save (executeChipSave) against an in-memory "Postgres" with row semantics (upsert by
// id, prune by tournament, a version column whose compare-and-set is atomic, like
// UPDATE … WHERE version = expected). Every backend call yields for a SEEDED random delay, so the
// two saves interleave differently in each trial (reproducible: the trial seed is in every
// failure message).
//
// Before (no claimVersion — the legacy read-then-bump soft CAS): both devices pass the pre-check
// and their writes interleave → one match result is silently lost. After (claim-first): exactly
// one save lands, the other writes NOTHING and is told it conflicted; the cloud equals the
// winner's snapshot exactly (never a torn mix), and the loser reloads + redoes intentionally.
/// <reference types="node" />

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ChipPersistBackend,
  ChipSavePlan,
  ChipSaveResult,
  executeChipSave,
  resetOwnChipClaimsForTests,
} from "../../models/services/chip.persist";
import { createChipSaveQueue } from "../../models/services/chip.save-queue";
import {
  addTables,
  assignNextTeam,
  emptyChipState,
  recordWinner,
  reorderQueue,
  setTableLocked,
  settleChipState,
  startAllMatches,
  startChipTournament,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

// ── in-memory cloud ────────────────────────────────────────────────────────────────────────
interface Cloud {
  version: number;
  config: Record<string, unknown>;
  rows: Record<string, Map<string, Record<string, unknown>>>;
  events: Set<string>;
  writesBy: Record<string, number>;
}
const newCloud = (): Cloud => ({
  version: 5,
  config: {},
  rows: { chip_entries: new Map(), chip_matches: new Map(), chip_tables: new Map() },
  events: new Set(),
  writesBy: {},
});
const makeBackend = (
  cloud: Cloud,
  who: string,
  rand: () => number,
  opts: { claim: boolean; failOnce?: { stage: "matches" } },
): ChipPersistBackend => {
  const yieldNow = () => new Promise<void>((r) => setTimeout(r, Math.floor(rand() * 4)));
  const wrote = () => (cloud.writesBy[who] = (cloud.writesBy[who] ?? 0) + 1);
  let failed = false;
  const b: ChipPersistBackend = {
    async upsertConfig(p) { await yieldNow(); cloud.config = { ...cloud.config, ...p }; wrote(); },
    async upsertConfigSoft(p) { await yieldNow(); cloud.config = { ...cloud.config, ...p }; },
    async syncRows(t, rows, ids) {
      await yieldNow();
      if (opts.failOnce && t === "chip_matches" && !failed) { failed = true; throw Object.assign(new Error("network"), { status: 503 }); }
      for (const r of rows) cloud.rows[t].set(String(r.id), { ...r });
      wrote();
      await yieldNow();
      for (const k of [...cloud.rows[t].keys()]) if (!ids.includes(k)) cloud.rows[t].delete(k);
    },
    async insertEvents(rows) { await yieldNow(); for (const r of rows) cloud.events.add(String(r.id)); },
    async markSuperseded() { await yieldNow(); },
    async readVersion() { await yieldNow(); return cloud.version; },
    async bumpVersion(expected) {
      await yieldNow(); const live = cloud.version; await yieldNow(); cloud.version = live + 1;
      return { version: live + 1, conflict: expected != null && live !== expected };
    },
  };
  if (opts.claim)
    b.claimVersion = async (expected) => {
      await yieldNow(); // network
      if (cloud.version !== expected) return "changed"; // the CAS itself is one atomic statement
      cloud.version = expected + 1;
      return "claimed";
    };
  return b;
};

// ── state → plan / cloud snapshot ───────────────────────────────────────────────────────────
const TID = 4242;
const planOf = (s: ChipState, expected: number): ChipSavePlan => ({
  configCore: { tournament_id: TID, queue: [...s.queue] },
  configExtended: { tournament_id: TID, shuffle_mode: !!s.shuffleMode },
  configRestorePoints: { tournament_id: TID },
  configSoft: { tournament_id: TID },
  entries: { rows: s.entries.map((e) => ({ id: e.id, chips: e.chips, status: e.status })), ids: s.entries.map((e) => e.id) },
  matches: { rows: s.matches.map((m) => ({ id: m.id, status: m.status, winnerId: m.winnerId ?? null, tableId: m.tableId })), ids: s.matches.map((m) => m.id) },
  tables: { rows: s.tables.map((t) => ({ id: t.id, matchId: t.matchId ?? null, holderId: t.holderId ?? null, pending: t.pendingChallengerId ?? null, locked: !!t.locked })), ids: s.tables.map((t) => t.id) },
  events: s.events.map((e) => ({ id: e.id })),
  supersededEventIds: [],
  expectedVersion: expected,
  claimKey: TID,
});
const snapshotOf = (s: ChipState) => {
  const p = planOf(s, 0);
  const sort = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify({ queue: p.configCore.queue, e: sort(p.entries.rows), m: sort(p.matches.rows), t: sort(p.tables.rows) });
};
const cloudSnapshot = (c: Cloud) => {
  const strip = (m: Map<string, Record<string, unknown>>) => [...m.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify({ queue: c.config.queue, e: strip(c.rows.chip_entries), m: strip(c.rows.chip_matches), t: strip(c.rows.chip_tables) });
};
const seedCloud = (c: Cloud, s: ChipState) => {
  const p = planOf(s, 0);
  c.config = { ...p.configCore };
  for (const [t, rows] of [["chip_entries", p.entries.rows], ["chip_matches", p.matches.rows], ["chip_tables", p.tables.rows]] as const)
    for (const r of rows) c.rows[t].set(String(r.id), { ...r });
};

// A live board: 10 singles, 3 chips, 3 tables, all opening matches started.
const entry = (i: number): ChipEntry =>
  ({ id: `e${String(i).padStart(2, "0")}`, p1Name: `P${i}`, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500,
     startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
     wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: "2026-10-01T00:00:00.000Z" }) as ChipEntry;
const board = (): ChipState => {
  const realRandom = Math.random;
  Math.random = rng(7);
  try {
    let s = emptyChipState("singles");
    s = { ...s, settings: { ...s.settings, tiers: [{ id: "t", minFargo: 0, maxFargo: null, chips: 3 }] }, entries: Array.from({ length: 10 }, (_, i) => entry(i)) };
    s = addTables(s, 3);
    return settleChipState(startAllMatches(settleChipState(startChipTournament(s))));
  } finally {
    Math.random = realRandom;
  }
};

beforeEach(() => resetOwnChipClaimsForTests());

type Mutation = { name: string; a: (s: ChipState) => ChipState; b: (s: ChipState) => ChipState };
const live = (s: ChipState) => s.matches.filter((m) => m.status === "in_progress");
const MUTATIONS: Mutation[] = [
  { name: "two DIFFERENT match results", a: (s) => settleChipState(recordWinner(s, live(s)[0].id, live(s)[0].aId)), b: (s) => settleChipState(recordWinner(s, live(s)[1].id, live(s)[1].bId)) },
  { name: "two queue moves", a: (s) => reorderQueue(s, s.queue[s.queue.length - 1], "top"), b: (s) => reorderQueue(s, s.queue[0], "bottom") },
  { name: "two table locks", a: (s) => setTableLocked(s, s.tables[0].id, true), b: (s) => setTableLocked(s, s.tables[1].id, true) },
  {
    name: "assign (after a result) vs record winner",
    a: (s) => { const x = settleChipState(recordWinner(s, live(s)[0].id, live(s)[0].aId)); const t = x.tables.find((tb) => tb.holderId && !tb.pendingChallengerId && !tb.matchId); return t ? settleChipState(assignNextTeam(x, t.id)) : x; },
    b: (s) => settleChipState(recordWinner(s, live(s)[2].id, live(s)[2].aId)),
  },
];

const race = async (claim: boolean, m: Mutation, trial: number) => {
  const s0 = board();
  const A = m.a(s0);
  const B = m.b(s0);
  assert.notEqual(snapshotOf(A), snapshotOf(B), `${m.name}: devices made different changes`);
  const cloud = newCloud();
  seedCloud(cloud, s0);
  const rand = rng(1000 + trial);
  const [ra, rb] = await Promise.all([
    executeChipSave(makeBackend(cloud, "A", rand, { claim }), planOf(A, 5)),
    executeChipSave(makeBackend(cloud, "B", rand, { claim }), planOf(B, 5)),
  ]);
  return { A, B, ra, rb, cloud };
};

test("BEFORE (legacy soft CAS, no claim): overlapping saves lose an update — the race this fixes", async () => {
  let lost = 0;
  const m = MUTATIONS[0];
  for (let trial = 0; trial < 60; trial++) {
    const { A, B, cloud } = await race(false, m, trial);
    const finished = [...cloud.rows.chip_matches.values()].filter((x) => x.status === "finished").length;
    if (finished < 2) lost++; // one of the two results never reached the cloud
    void A; void B;
    // and both devices "succeeded" writing (no clean rejection):
    assert.ok((cloud.writesBy.A ?? 0) > 0 && (cloud.writesBy.B ?? 0) > 0, `trial ${trial}: both wrote`);
  }
  assert.equal(lost, 60, "every overlapping legacy save loses one device's match result");
});

for (const m of MUTATIONS) {
  test(`AFTER (claim-first): ${m.name} — exactly one lands whole, the other writes nothing and is told`, async () => {
    for (let trial = 0; trial < 120; trial++) {
      const { A, B, ra, rb, cloud } = await race(true, m, trial);
      const ctx = `${m.name} trial=${trial} (seed ${1000 + trial})`;
      const aborted = [ra, rb].filter((r: ChipSaveResult) => r.aborted && r.conflict);
      assert.equal(aborted.length, 1, `${ctx}: exactly one save rejected (got ${JSON.stringify([ra, rb])})`);
      const winner = ra.aborted ? "B" : "A";
      const loser = winner === "A" ? "B" : "A";
      assert.equal(cloud.writesBy[loser] ?? 0, 0, `${ctx}: the rejected device wrote nothing (no partial save)`);
      assert.equal(cloudSnapshot(cloud), snapshotOf(winner === "A" ? A : B), `${ctx}: cloud == winner's snapshot exactly`);
      assert.equal(cloud.version, 7, `${ctx}: claim + finalize`);
      const ok = winner === "A" ? ra : rb;
      assert.equal(ok.version, 7);
      assert.equal(ok.conflict, false);
    }
  });
}

test("the rejected device reloads, redoes its action on the fresh state, and both results survive", async () => {
  const m = MUTATIONS[0];
  const { B, ra, rb, cloud } = await race(true, m, 3);
  const loserIsB = !!rb.aborted;
  assert.ok(loserIsB || ra.aborted);
  // Loser reloads (the cloud == winner's state, version 6) and redoes the SAME intent.
  const winnerState = loserIsB ? m.a(board()) : m.b(board());
  const redo = loserIsB ? m.b(winnerState) : m.a(winnerState);
  const r = await executeChipSave(makeBackend(cloud, "B2", rng(9), { claim: true }), planOf(redo, 7));
  assert.equal(r.conflict, false);
  assert.equal(cloud.version, 9);
  const finished = [...cloud.rows.chip_matches.values()].filter((x) => x.status === "finished").length;
  assert.equal(finished, 2, "both match results are in the cloud — nothing lost, nothing duplicated");
  const chipsLost = [...cloud.rows.chip_entries.values()].reduce((a, e) => a + (3 - Number(e.chips)), 0);
  assert.equal(chipsLost, 2, "exactly one chip deducted per result");
  void B;
});

test("a stale device (loaded before another device advanced) is rejected before writing", async () => {
  const s0 = board();
  const cloud = newCloud();
  seedCloud(cloud, s0);
  const A = MUTATIONS[0].a(s0);
  assert.equal((await executeChipSave(makeBackend(cloud, "A", rng(1), { claim: true }), planOf(A, 5))).version, 7);
  const staleB = MUTATIONS[1].b(s0); // still thinks version 5
  const r = await executeChipSave(makeBackend(cloud, "B", rng(2), { claim: true }), planOf(staleB, 5));
  assert.equal(r.aborted, true);
  assert.equal(r.conflict, true);
  assert.equal(r.version, 7, "reports the cloud version to reload");
  assert.equal(cloud.writesBy.B ?? 0, 0);
  assert.equal(cloudSnapshot(cloud), snapshotOf(A));
});

test("a retry after a failed write keeps this device's own claim (no false conflict) — and loses it if another device claimed", async () => {
  const s0 = board();
  // (1) own retry
  let cloud = newCloud();
  seedCloud(cloud, s0);
  const A = MUTATIONS[0].a(s0);
  const be = makeBackend(cloud, "A", rng(3), { claim: true, failOnce: { stage: "matches" } });
  await assert.rejects(executeChipSave(be, planOf(A, 5)), /network/);
  assert.equal(cloud.version, 6, "claimed before the failure");
  const retry = await executeChipSave(be, planOf(A, 5)); // the VM rebuilds with the SAME baseline
  assert.equal(retry.conflict, false, "own retry is not a conflict");
  assert.equal(retry.version, 8);
  assert.equal(cloudSnapshot(cloud), snapshotOf(A));
  // (2) another device claimed in between → the retry's conflict is real
  resetOwnChipClaimsForTests();
  cloud = newCloud();
  seedCloud(cloud, s0);
  const be2 = makeBackend(cloud, "A", rng(4), { claim: true, failOnce: { stage: "matches" } });
  await assert.rejects(executeChipSave(be2, planOf(A, 5)));
  cloud.version += 1; // device B claimed 6 → 7 and wrote
  const r = await executeChipSave(be2, planOf(A, 5));
  assert.equal(r.aborted, true);
  assert.equal(r.conflict, true);
});

test("a claim that errors (network) writes nothing and is retried, never silently skipped", async () => {
  const s0 = board();
  const cloud = newCloud();
  seedCloud(cloud, s0);
  const be = makeBackend(cloud, "A", rng(5), { claim: true });
  let calls = 0;
  const real = be.claimVersion!;
  be.claimVersion = async (e) => { if (calls++ === 0) throw Object.assign(new Error("fetch failed"), { status: 0 }); return real(e); };
  const A = MUTATIONS[0].a(s0);
  await assert.rejects(executeChipSave(be, planOf(A, 5)), (e: any) => e.stage === "version_claim");
  assert.equal(cloud.writesBy.A ?? 0, 0);
  assert.equal((await executeChipSave(be, planOf(A, 5))).version, 7);
});

test("same-device rapid double tap: the serialized save queue lands both, in order, no conflict", async () => {
  const s0 = board();
  const cloud = newCloud();
  seedCloud(cloud, s0);
  let version = 5;
  const conflicts: boolean[] = [];
  const be = makeBackend(cloud, "A", rng(6), { claim: true });
  const q = createChipSaveQueue<ChipState, ChipSaveResult>({
    save: (st) => executeChipSave(be, planOf(st, version)),
    onSaved: (r) => { conflicts.push(r.conflict); if (!r.aborted) version = r.version; },
    sleep: async () => {},
  });
  const s1 = MUTATIONS[0].a(s0);
  const s2 = reorderQueue(s1, s1.queue[0], "bottom");
  q.enqueue(s1);
  q.enqueue(s2); // second tap while the first save is in flight
  assert.equal(await q.flush(), true);
  assert.ok(conflicts.every((c) => c === false), `no self-conflict: ${conflicts}`);
  assert.equal(cloudSnapshot(cloud), snapshotOf(s2), "newest state persisted");
  assert.ok(version >= 7);
});

test("a device that LOADED while another device's save was mid-write can never commit that half-written board", async () => {
  for (let trial = 0; trial < 40; trial++) {
    const s0 = board();
    const cloud = newCloud();
    seedCloud(cloud, s0);
    const A = MUTATIONS[0].a(s0);
    // B loads (version + rows) at a seeded point DURING A's save.
    let loadedVersion: number | null = null;
    let loadedRows = "";
    const be = makeBackend(cloud, "A", rng(500 + trial), { claim: true });
    const realSync = be.syncRows.bind(be);
    let n = 0;
    const loadAt = trial % 2; // as the 1st / 2nd row section starts writing
    be.syncRows = async (tb, rows, ids, o) => {
      // capture while the save is in flight: version already claimed, rows (partly) old
      if (n++ === loadAt) { loadedVersion = cloud.version; loadedRows = cloudSnapshot(cloud); }
      await realSync(tb, rows, ids, o);
    };
    await executeChipSave(be, planOf(A, 5));
    assert.notEqual(loadedVersion, null);
    assert.notEqual(loadedRows, snapshotOf(A), `trial ${trial}: B really saw a half-written board`);
    // B acts on what it loaded (a queue move) and saves with that baseline → must be refused.
    const staleB = reorderQueue(s0, s0.queue[0], "bottom");
    const r = await executeChipSave(makeBackend(cloud, "B", rng(900 + trial), { claim: true }), planOf(staleB, loadedVersion!));
    assert.equal(r.aborted, true, `trial ${trial} (seed ${500 + trial}): mid-write load rejected`);
    assert.equal(cloudSnapshot(cloud), snapshotOf(A), "A's save stays intact");
  }
});

test("reconnect then mutate: after reloading the newer cloud version the next save succeeds", async () => {
  const s0 = board();
  const cloud = newCloud();
  seedCloud(cloud, s0);
  const A = MUTATIONS[0].a(s0);
  await executeChipSave(makeBackend(cloud, "A", rng(7), { claim: true }), planOf(A, 5));
  // B was offline; on reconnect it reloads (version 6, state A) and acts on that.
  const B = MUTATIONS[1].b(A);
  const r = await executeChipSave(makeBackend(cloud, "B", rng(8), { claim: true }), planOf(B, cloud.version));
  assert.equal(r.conflict, false);
  assert.equal(cloud.version, 9);
  assert.equal(cloudSnapshot(cloud), snapshotOf(B));
});
