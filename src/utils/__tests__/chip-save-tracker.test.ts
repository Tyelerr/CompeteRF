// src/utils/__tests__/chip-save-tracker.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-save-tracker.test.ts
// A load must never read a save that another screen instance still has in flight (found in the
// signed-in verification: switching Live tabs remounted the manage screen mid-save, the new
// instance read a half-written snapshot, "repaired" it and saved it back over the TD's action).
// Reproduced with the real executeChipSave against a slow backend: a reader that waits via
// waitForChipSaves always sees the finished snapshot + bumped version.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { ChipPersistBackend, ChipRowTable, ChipSavePlan, executeChipSave } from "../../models/services/chip.persist";
import { chipSavesInFlight, trackChipSave, waitForChipSaves } from "../../models/services/chip.save-tracker";

class SlowCloud implements ChipPersistBackend {
  version = 7;
  tables = "old";
  private tick = () => new Promise((r) => setTimeout(r, 5));
  async upsertConfig() { await this.tick(); }
  async upsertConfigSoft() {}
  async syncRows(table: ChipRowTable, rows: Record<string, unknown>[]) {
    await this.tick();
    if (table === "chip_tables") this.tables = String(rows[0]?.state ?? "");
  }
  async insertEvents() { await this.tick(); }
  async markSuperseded() {}
  async bumpVersion(expected: number | null | undefined) {
    await this.tick();
    const conflict = expected != null && expected !== this.version;
    this.version += 1;
    return { version: this.version, conflict };
  }
  async readVersion() { return this.version; }
  read() { return { version: this.version, tables: this.tables }; }
}
const plan = (state: string, expectedVersion: number): ChipSavePlan => ({
  configCore: {}, configExtended: {}, configRestorePoints: {}, configSoft: {},
  entries: { rows: [], ids: [] }, matches: { rows: [], ids: [] },
  tables: { rows: [{ id: "t1", state }], ids: ["t1"] },
  events: [{ id: "e1" }], supersededEventIds: [], expectedVersion,
});

test("a mid-save read is torn; a read after waitForChipSaves is not", async () => {
  const cloud = new SlowCloud();
  const saving = trackChipSave(42, executeChipSave(cloud, plan("seated", 7)));
  while (cloud.tables !== "seated") await new Promise((r) => setTimeout(r, 1)); // mid-save: rows landed
  const torn = cloud.read();
  assert.deepEqual(torn, { version: 7, tables: "seated" }, "rows written, version not bumped yet (torn)");
  assert.equal(chipSavesInFlight(42), 1);
  await waitForChipSaves(42);
  assert.deepEqual(cloud.read(), { version: 8, tables: "seated" }, "the waiting reader sees the finished save");
  assert.equal(chipSavesInFlight(42), 0);
  assert.equal((await saving).version, 8);
});

test("waits for saves that start while waiting, per tournament, and survives a failed save", async () => {
  const order: string[] = [];
  const slow = (ms: number, tag: string, fail = false) =>
    new Promise<string>((res, rej) => setTimeout(() => {
      order.push(tag);
      if (fail) rej(new Error(tag));
      else res(tag);
    }, ms));
  const a = trackChipSave(1, slow(10, "a", true));
  a.catch(() => {});
  setTimeout(() => void trackChipSave(1, slow(10, "b")), 5); // starts while the first is in flight
  void trackChipSave(2, slow(50, "other-tournament"));
  await waitForChipSaves(1);
  assert.deepEqual(order, ["a", "b"], "both saves of tournament 1 finished; the other tournament is not awaited");
  assert.equal(chipSavesInFlight(1), 0);
  assert.equal(chipSavesInFlight(2), 1);
  await waitForChipSaves(2);
});
