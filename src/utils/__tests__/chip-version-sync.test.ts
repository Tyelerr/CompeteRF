// src/utils/__tests__/chip-version-sync.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-version-sync.test.ts
// Multi-TD freshness: when may the director screen probe chip_config.version, and when does a
// probe trigger the (guarded) silent reload. Plus an A/B walk-through on a cloud model: TD A
// changes the queue / records a winner; TD B sees it on its next probe, not while backgrounded
// or offline, catches up on return / reconnect, and a stale action is refused by the claim.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { canProbeChipVersion, chipVersionAction, ChipProbeGate } from "../chip-version-sync";

const idle: ChipProbeGate = {
  loaded: true, started: true, finished: false, online: true, cloudChanged: false, recoveryActive: false,
  queuePaused: false, saving: false, hasUnsaved: false, pendingDebounce: false, appActive: true,
};

test("probe gate: only an idle, live, online, foreground, authoritative board probes", () => {
  assert.equal(canProbeChipVersion(idle), true);
  const blockers: (keyof ChipProbeGate)[] = ["cloudChanged", "recoveryActive", "queuePaused", "saving", "hasUnsaved", "pendingDebounce", "finished"];
  for (const k of blockers) assert.equal(canProbeChipVersion({ ...idle, [k]: true }), false, k);
  for (const k of ["loaded", "started", "online", "appActive"] as const) assert.equal(canProbeChipVersion({ ...idle, [k]: false }), false, k);
});

test("reload only when the cloud moved past this board", () => {
  assert.equal(chipVersionAction(7, 5), "reload");
  assert.equal(chipVersionAction(5, 5), "none");
  assert.equal(chipVersionAction(4, 5), "none", "never 'downgrade'");
  assert.equal(chipVersionAction(null, 5), "none", "unknown → skip this tick");
});

test("A/B walk-through: B stays current, catches up after background / reconnect, stale action refused", () => {
  // cloud: version + a board label; each save = claim + finalize (+2)
  const cloud = { version: 10, board: "v10" };
  const save = (expected: number, board: string): "ok" | "conflict" => {
    if (cloud.version !== expected) return "conflict"; // the atomic claim
    cloud.version += 2;
    cloud.board = board;
    return "ok";
  };
  const B = { version: 10, board: "v10", gate: { ...idle } };
  const tick = () => {
    if (!canProbeChipVersion(B.gate)) return false;
    if (chipVersionAction(cloud.version, B.version) === "reload") { B.version = cloud.version; B.board = cloud.board; return true; }
    return false;
  };
  // TD A moves the queue → B sees it on the next probe
  assert.equal(save(10, "A:queue"), "ok");
  assert.equal(tick(), true);
  assert.equal(B.board, "A:queue");
  // TD A records a winner → B sees the new chips/queue/table state
  assert.equal(save(12, "A:winner"), "ok");
  tick();
  assert.equal(B.board, "A:winner");
  // B backgrounds: no probes; A keeps playing; B returns → the foreground probe catches up
  B.gate.appActive = false;
  save(14, "A:more");
  assert.equal(tick(), false);
  B.gate.appActive = true;
  assert.equal(tick(), true);
  assert.equal(B.board, "A:more");
  // B disconnects (offline controller), A saves; on reconnect the probe reloads
  B.gate.online = false;
  save(16, "A:offline-period");
  assert.equal(tick(), false);
  B.gate.online = true;
  tick();
  assert.equal(B.board, "A:offline-period");
  // B acts on a stale board (A saved between B's probes): the claim refuses it
  save(18, "A:latest");
  assert.equal(save(B.version, "B:stale-move"), "conflict");
  assert.equal(cloud.board, "A:latest", "nothing overwritten");
});
