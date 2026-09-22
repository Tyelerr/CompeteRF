// src/utils/__tests__/queue-settings.test.ts
// Run: npx tsx --test src/utils/__tests__/queue-settings.test.ts
// Auto Assign On/Off and Queue Order are independent: only the explicit toggle payload carries
// autoAssignEnabled, so no queue action can turn Auto Assign on or off.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { autoAssignPayload, keepModeMovePayload, manualReorderPayload, queueModePayload } from "../queue-settings";
import { AUTO_ASSIGN_MODES } from "../queue.utils";

test("mode change / Move & Keep / Move & Switch to Manual never carry autoAssignEnabled", () => {
  const payloads = [
    ...AUTO_ASSIGN_MODES.map((m) => queueModePayload(m.value)),
    keepModeMovePayload([{ matchId: "W1M3", place: "top" }]),
    keepModeMovePayload([]),
    manualReorderPayload(["W1M2", "W1M1"]),
  ];
  for (const p of payloads) {
    assert.equal("autoAssignEnabled" in p, false, JSON.stringify(p));
    assert.equal(JSON.stringify(p).includes("autoAssignEnabled"), false);
  }
});

test("Move & Switch to Manual = Manual + displayed order + pins cleared, nothing else", () => {
  assert.deepEqual(manualReorderPayload(["a", "b"]), { queueOrder: ["a", "b"], autoAssignMode: "manual", queuePins: [] });
});

test("Move & Keep {mode} writes only pins (mode unchanged)", () => {
  assert.deepEqual(Object.keys(keepModeMovePayload([{ matchId: "x", place: "bottom" }])), ["queuePins"]);
});

test("the explicit toggle is the only On/Off writer and touches nothing else", () => {
  assert.deepEqual(autoAssignPayload(true), { autoAssignEnabled: true });
  assert.deepEqual(autoAssignPayload(false), { autoAssignEnabled: false });
});
