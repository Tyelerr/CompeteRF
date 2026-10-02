// src/utils/__tests__/chip-save-delta.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-save-delta.test.ts
//
// Delta saves (chip.persist): when the cloud is exactly this device's last write (same version,
// guaranteed by the claim/finalize CAS), unchanged rows / config sections / events are not
// re-sent. These tests prove the cloud still ends up EXACTLY equal to a full save after every
// action of whole events (real engine + the real buildChipSavePlan), that any version change
// falls back to a full save, that removals still prune, that a failed attempt's retry converges,
// and they report the request / byte savings per action (comparative, in-memory).
/// <reference types="node" />

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ChipPersistBackend, ChipRowTable, executeChipSave, resetOwnChipClaimsForTests } from "../../models/services/chip.persist";
import { buildChipSavePlan } from "../../models/services/chip.rows";
import {
  addTables,
  assignNextTeam,
  chipFinalsState,
  seatFinals,
  emptyChipState,
  recordWinner,
  removeTable,
  reorderQueue,
  setTableLocked,
  settleChipState,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { ChipEntry, ChipState } from "../../models/types/chip.types";

const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};
const TID = 77;

class Cloud implements ChipPersistBackend {
  version = 0;
  config: Record<string, unknown> = {};
  rows: Record<ChipRowTable, Map<string, Record<string, unknown>>> = { chip_entries: new Map(), chip_matches: new Map(), chip_tables: new Map() };
  events = new Map<string, Record<string, unknown>>();
  requests = 0;
  bytes = 0;
  failNextRows = 0;
  private hit(payload: unknown) {
    this.requests++;
    this.bytes += JSON.stringify(payload ?? null).length;
  }
  async upsertConfig(p: Record<string, unknown>) { this.hit(p); this.config = { ...this.config, ...p }; }
  async upsertConfigSoft(p: Record<string, unknown>) { this.hit(p); this.config = { ...this.config, ...p }; }
  async syncRows(t: ChipRowTable, rows: Record<string, unknown>[], ids: string[], o?: { prune?: boolean }) {
    if (this.failNextRows > 0) { this.failNextRows--; throw Object.assign(new Error("network"), { status: 503 }); }
    if (rows.length) this.hit(rows);
    for (const r of rows) this.rows[t].set(String(r.id), r);
    if (o?.prune !== false) {
      this.hit(ids); // the prune request (ids in the URL)
      for (const k of [...this.rows[t].keys()]) if (!ids.includes(k)) this.rows[t].delete(k);
    }
  }
  async insertEvents(rows: Record<string, unknown>[]) { this.hit(rows); for (const r of rows) if (!this.events.has(String(r.id))) this.events.set(String(r.id), r); }
  async markSuperseded(ids: string[]) { this.hit(ids); for (const id of ids) { const e = this.events.get(id); if (e) this.events.set(id, { ...e, superseded: true }); } }
  async readVersion() { this.requests++; return this.version; }
  async bumpVersion() { this.requests += 2; this.version++; return { version: this.version, conflict: false }; }
  async claimVersion(expected: number) { this.requests++; if (this.version !== expected) return "changed" as const; this.version++; return "claimed" as const; }
}

// The cloud must hold exactly what a FULL save of `s` would write.
const assertCloudIs = (c: Cloud, s: ChipState, ctx: string) => {
  const p = buildChipSavePlan(TID, s);
  const norm = (rows: Record<string, unknown>[]) => JSON.stringify([...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))));
  assert.equal(norm([...c.rows.chip_entries.values()]), norm(p.entries.rows), `${ctx}: entries`);
  assert.equal(norm([...c.rows.chip_matches.values()]), norm(p.matches.rows), `${ctx}: matches`);
  assert.equal(norm([...c.rows.chip_tables.values()]), norm(p.tables.rows), `${ctx}: tables`);
  assert.deepEqual(c.config.queue, p.configCore.queue, `${ctx}: queue`);
  assert.equal(JSON.stringify(c.config.restore_points), JSON.stringify(p.configRestorePoints.restore_points), `${ctx}: restore points`);
  assert.equal(JSON.stringify(c.config.round_remaining), JSON.stringify(p.configExtended.round_remaining), `${ctx}: extended`);
  for (const ev of p.events) assert.ok(c.events.has(String(ev.id)), `${ctx}: event ${ev.id}`);
  for (const id of p.supersededEventIds) assert.equal(c.events.get(id)?.superseded, true, `${ctx}: superseded ${id}`);
};

const entry = (i: number): ChipEntry =>
  ({ id: `e${String(i).padStart(3, "0")}`, p1Name: `P${i}`, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500,
     startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued",
     wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: "2026-10-01T00:00:00.000Z" }) as ChipEntry;
const act = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  const next = settleChipState(fn(c));
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[ev.length - 1].text);
};
const startBoard = (n: number, tables: number, chips: number, seed: number): ChipState => {
  Math.random = rng(seed);
  let s = emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t", minFargo: 0, maxFargo: null, chips }] }, entries: Array.from({ length: n }, (_, i) => entry(i)) };
  return act(settleChipState(startChipTournament(addTables(s, tables))), startAllMatches);
};
const realRandom = Math.random;
beforeEach(() => { resetOwnChipClaimsForTests(); Math.random = realRandom; });

test("delta saves: the cloud equals a full save after EVERY action of whole events", async () => {
  for (const [n, tables, chips, seed] of [[8, 2, 2, 1], [16, 4, 3, 2], [24, 6, 2, 3]] as const) {
    const c = new Cloud();
    let s = startBoard(n, tables, chips, seed);
    let v = 0;
    const save = async (st: ChipState, ctx: string) => {
      const r = await executeChipSave(c, buildChipSavePlan(TID, st, { expectedVersion: v }));
      assert.equal(r.conflict, false, ctx);
      v = r.version;
      assertCloudIs(c, st, ctx);
    };
    await save(s, "initial");
    const rand = rng(seed * 11);
    let steps = 0;
    while (!s.winnerId && steps < 5000) {
      steps++;
      const r = rand();
      if (r < 0.08 && s.queue.length > 1) s = act(s, (x) => reorderQueue(x, s.queue[Math.floor(rand() * s.queue.length)], "bottom"));
      else if (r < 0.12) { const t = s.tables[Math.floor(rand() * s.tables.length)]; s = act(s, (x) => setTableLocked(x, t.id, !t.locked)); }
      else {
        const fin = chipFinalsState(s);
        if (fin.kind === "select") s = act(s, (x) => seatFinals(x, fin.tableIds[0]));
        for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) s = act(s, (x) => startPendingMatch(x, t.id));
        const m = s.matches.find((x) => x.status === "in_progress");
        if (m) s = act(s, (x) => recordWinner(x, m.id, rand() < 0.5 ? m.aId : m.bId));
        else {
          for (const t of s.tables) if (t.locked) s = act(s, (x) => setTableLocked(x, t.id, false));
          const t = s.tables.find((tb) => !tb.matchId && !tb.pendingChallengerId && !tb.inactive && (tb.holderId ? s.queue.length : s.queue.length > 1));
          if (t) s = act(s, (x) => assignNextTeam(x, t.id));
        }
      }
      await save(s, `n=${n} seed=${seed} step=${steps}`);
    }
    assert.ok(s.winnerId, `n=${n}: finished`);
  }
});

test("any version change (another device / reload) → the next save is FULL; removals still prune", async () => {
  const c = new Cloud();
  const s0 = startBoard(8, 3, 3, 9);
  let r = await executeChipSave(c, buildChipSavePlan(TID, s0, { expectedVersion: 0 }));
  // another device saves (version moves, a row changes out from under us)
  c.version += 2;
  c.rows.chip_entries.set("e000", { ...c.rows.chip_entries.get("e000")!, chips: 99 });
  // this device reloads at the new version and saves the SAME board → must re-send everything
  const before = c.requests;
  r = await executeChipSave(c, buildChipSavePlan(TID, s0, { expectedVersion: c.version }));
  assert.equal(r.conflict, false);
  assertCloudIs(c, s0, "full save after a version change");
  assert.ok(c.requests - before >= 8, "full save");
  // remove a table → delta save must still delete its row
  const s1 = act(s0, (x) => removeTable(x, x.tables[x.tables.length - 1].id));
  await executeChipSave(c, buildChipSavePlan(TID, s1, { expectedVersion: r.version }));
  assertCloudIs(c, s1, "after removing a table");
});

test("a failed attempt's retry converges to the full state", async () => {
  const c = new Cloud();
  let s = startBoard(10, 3, 3, 4);
  const r0 = await executeChipSave(c, buildChipSavePlan(TID, s, { expectedVersion: 0 }));
  const m = s.matches.find((x) => x.status === "in_progress")!;
  s = act(s, (x) => recordWinner(x, m.id, m.aId));
  c.failNextRows = 1;
  await assert.rejects(executeChipSave(c, buildChipSavePlan(TID, s, { expectedVersion: r0.version })));
  const r = await executeChipSave(c, buildChipSavePlan(TID, s, { expectedVersion: r0.version }));
  assert.equal(r.conflict, false);
  assertCloudIs(c, s, "after retry");
});

test("measure: requests and bytes per common action — full vs delta (report)", async () => {
  for (const n of [32, 64, 128]) {
    const c = new Cloud();
    let s = startBoard(n, Math.floor(n / 4), 5, n);
    let v = (await executeChipSave(c, buildChipSavePlan(TID, s, { expectedVersion: 0 }))).version;
    // play into the event so history exists
    for (let k = 0; k < n; k++) {
      for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) s = act(s, (x) => startPendingMatch(x, t.id));
      const m = s.matches.find((x) => x.status === "in_progress");
      if (!m) break;
      s = act(s, (x) => recordWinner(x, m.id, m.aId));
      v = (await executeChipSave(c, buildChipSavePlan(TID, s, { expectedVersion: v }))).version;
    }
    const actions: [string, (x: ChipState) => ChipState][] = [
      ["move queue item", (x) => reorderQueue(x, x.queue[x.queue.length - 1], "top")],
      ["record winner", (x) => { const m = x.matches.find((y) => y.status === "in_progress")!; return recordWinner(x, m.id, m.aId); }],
      ["lock table", (x) => setTableLocked(x, x.tables[0].id, true)],
    ];
    for (const [name, fn] of actions) {
      const next = act(s, fn);
      // full: a fresh device (no baseline) at this version
      const full = new Cloud();
      full.version = v;
      resetOwnChipClaimsForTests();
      await executeChipSave(full, buildChipSavePlan(TID, s, { expectedVersion: v })); // baseline write
      const f0 = { r: full.requests, b: full.bytes };
      resetOwnChipClaimsForTests(); // forget the baseline → the action save is FULL
      await executeChipSave(full, buildChipSavePlan(TID, next, { expectedVersion: full.version }));
      const fullReq = full.requests - f0.r;
      const fullBytes = full.bytes - f0.b;
      // delta: same device continues from its own last write
      const d0 = { r: full.requests, b: full.bytes };
      const after = act(next, (x) => x); // no-op settle
      void after;
      const deltaCloud = new Cloud();
      deltaCloud.version = v;
      resetOwnChipClaimsForTests();
      const base = await executeChipSave(deltaCloud, buildChipSavePlan(TID, s, { expectedVersion: v }));
      const b0 = { r: deltaCloud.requests, b: deltaCloud.bytes };
      await executeChipSave(deltaCloud, buildChipSavePlan(TID, next, { expectedVersion: base.version }));
      const deltaReq = deltaCloud.requests - b0.r;
      const deltaBytes = deltaCloud.bytes - b0.b;
      assertCloudIs(deltaCloud, next, `${name} n=${n}`);
      assert.ok(deltaBytes <= fullBytes && deltaReq <= fullReq);
      void d0;
      const rp = JSON.stringify(next.restorePoints ?? []).length;
      console.log(`SAVE n=${n} ${name}: full ${fullReq} req / ${(fullBytes / 1024).toFixed(0)} KB → delta ${deltaReq} req / ${(deltaBytes / 1024).toFixed(0)} KB (restore points ${(rp / 1024).toFixed(0)} KB, ${next.restorePoints?.length ?? 0} pts, events ${next.events.length})`);
    }
  }
});
