// src/utils/__tests__/chip-save-conflict.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-save-conflict.test.ts
// Multi-device conflict (soft CAS, CHIP_APPLY_ENABLED off). Before any row is written,
// executeChipSave reads the live chip_config.version: if another device already saved past the
// version this device loaded, it writes NOTHING and reports { conflict, aborted }. The VM then
// pauses its save queue (nothing more is written), flags the conflict (banner + every change
// refused) until the TD reloads the newest cloud state. The queue half of that is exercised
// here with the real createChipSaveQueue and an onSaved that mirrors the VM's.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { ChipPersistBackend, ChipRowTable, ChipSavePlan, ChipSaveResult, executeChipSave } from "../../models/services/chip.persist";
import { createChipSaveQueue } from "../../models/services/chip.save-queue";

type Row = Record<string, unknown>;
class FakeCloud implements ChipPersistBackend {
  version = 5;
  writes: string[] = [];
  readVersionCalls = 0;
  failRead = false;
  async upsertConfig() {
    this.writes.push("config");
  }
  async upsertConfigSoft() {
    this.writes.push("config_soft");
  }
  async syncRows(table: ChipRowTable) {
    this.writes.push(table);
  }
  async insertEvents() {
    this.writes.push("events");
  }
  async markSuperseded() {
    this.writes.push("superseded");
  }
  async bumpVersion(expected: number | null | undefined) {
    const conflict = expected != null && expected !== this.version;
    this.version += 1;
    return { version: this.version, conflict };
  }
  async readVersion() {
    this.readVersionCalls++;
    return this.failRead ? null : this.version;
  }
}
// Old backends (and the non-version-checked save call sites) have no readVersion.
class LegacyCloud extends FakeCloud {
  readVersion = undefined as unknown as FakeCloud["readVersion"];
}

const plan = (expectedVersion?: number | null, tag = "s"): ChipSavePlan => ({
  configCore: { queue: [tag] },
  configExtended: {},
  configRestorePoints: { restore_points: [] },
  configSoft: {},
  entries: { rows: [{ id: "e1" } as Row], ids: ["e1"] },
  matches: { rows: [], ids: [] },
  tables: { rows: [], ids: [] },
  events: [],
  supersededEventIds: [],
  expectedVersion,
});

test("E. stale device: a newer cloud version aborts the save before ANY write", async () => {
  const cloud = new FakeCloud(); // cloud is at v5 (another device saved)
  const res = await executeChipSave(cloud, plan(4));
  assert.deepEqual(res, { version: 5, conflict: true, aborted: true });
  assert.deepEqual(cloud.writes, [], "nothing was overwritten");
  assert.equal(cloud.version, 5, "version not bumped");
});

test("E. up-to-date device saves normally (no conflict)", async () => {
  const cloud = new FakeCloud();
  const res = await executeChipSave(cloud, plan(5));
  assert.equal(res.conflict, false);
  assert.ok(!res.aborted);
  assert.equal(res.version, 6);
  assert.ok(cloud.writes.includes("config") && cloud.writes.includes("chip_entries"));
});

test("E. unknown live version (read failed / no row) or no expected version → unchanged behavior", async () => {
  const unreadable = new FakeCloud();
  unreadable.failRead = true;
  const r1 = await executeChipSave(unreadable, plan(4));
  assert.ok(!r1.aborted, "a transient read failure never blocks a save");
  assert.equal(r1.conflict, true, "the post-write bumpVersion still reports it");
  const noExpected = new FakeCloud();
  const r2 = await executeChipSave(noExpected, plan(null));
  assert.equal(noExpected.readVersionCalls, 0);
  assert.deepEqual(r2, { version: 6, conflict: false });
  const legacy = new LegacyCloud();
  const r3 = await executeChipSave(legacy, plan(4));
  assert.ok(!r3.aborted);
  assert.equal(r3.conflict, true);
});

// The VM's soft-conflict handling: pause the queue (hold everything), flag, never mark saved.
const vmQueue = (cloud: FakeCloud, loadedVersion: number) => {
  const ui = { conflict: false, savedVersion: loadedVersion, confirmed: [] as string[] };
  const queue = createChipSaveQueue<string, ChipSaveResult>({
    save: (tag) => executeChipSave(cloud, plan(ui.savedVersion, tag)),
    onSaved: (res, tag) => {
      if (res.conflict) {
        void queue.pause();
        ui.conflict = true;
        if (res.aborted) return;
      }
      ui.savedVersion = res.version;
      ui.confirmed.push(tag);
    },
    sleep: () => Promise.resolve(),
  });
  return { queue, ui };
};

test("E. the conflict path does not silently continue: flagged, paused, nothing more written", async () => {
  const cloud = new FakeCloud(); // another device moved the cloud to v5
  const { queue, ui } = vmQueue(cloud, 4); // this device loaded v4
  queue.enqueue("stale-1");
  assert.equal(await queue.flush(), true);
  assert.equal(ui.conflict, true, "the TD is told");
  assert.deepEqual(ui.confirmed, [], "the aborted save is NOT reported as saved");
  assert.deepEqual(cloud.writes, []);
  assert.equal(queue.isPaused(), true, "saving is paused");
  // Anything that still reaches the queue (a later auto-save) is HELD, never written.
  queue.enqueue("stale-2");
  await queue.flush();
  assert.deepEqual(cloud.writes, [], "no automatic overwrite after the conflict");
  assert.equal(queue.hasUnsaved(), true);
  // Reload Latest: drop this device's stale snapshot, resume, continue from the cloud version.
  queue.dropUnsaved();
  queue.resume();
  ui.conflict = false;
  ui.savedVersion = cloud.version; // the reload picked up v5
  queue.enqueue("after-reload");
  assert.equal(await queue.flush(), true);
  assert.deepEqual(ui.confirmed, ["after-reload"]);
  assert.equal(ui.conflict, false);
  assert.ok(cloud.writes.length > 0, "writes resume only after the reload");
});

test("E. a save that raced past the pre-check (written, then conflict) still stops further writes", async () => {
  const cloud = new FakeCloud();
  const { queue, ui } = vmQueue(cloud, 5);
  // Another device saves between this device's version read and its bumpVersion.
  const origRead = cloud.readVersion.bind(cloud);
  cloud.readVersion = async () => {
    const v = await origRead();
    cloud.version += 1; // the racing save lands right after the check
    return v;
  };
  queue.enqueue("raced");
  await queue.flush();
  assert.equal(ui.conflict, true, "detected after the fact and surfaced");
  assert.equal(queue.isPaused(), true);
  const writesSoFar = cloud.writes.length;
  queue.enqueue("next");
  await queue.flush();
  assert.equal(cloud.writes.length, writesSoFar, "nothing more is written until reload");
});
