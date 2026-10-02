// src/utils/__tests__/player-poll.test.ts
// Run: npx tsx --test src/utils/__tests__/player-poll.test.ts
// Player-screen poll policy: a hook polls only while its tab is focused and it is the designated
// poller. Plus the Profile-tab request-rate model before/after (the observers app/(tabs)/profile.tsx
// mounts while a player is in a live elimination event).
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { playerPollActive, playerPollInterval } from "../player-poll";

test("poll only when focused AND the designated poller; nothing without a resource", () => {
  assert.equal(playerPollInterval(5000, 12), 5000, "default: callers that don't know poll");
  assert.equal(playerPollInterval(5000, 12, { focused: false }), false, "off-tab");
  assert.equal(playerPollInterval(5000, 12, { poll: false }), false, "cache reader");
  assert.equal(playerPollInterval(5000, null), false);
  assert.equal(playerPollActive({ focused: true, poll: true }), true);
});

// Each entry: an observer's interval (ms) in a given state. Before = what profile.tsx mounted.
const rate = (timers: (number | false)[]) => timers.reduce<number>((a, t) => a + (t ? 1000 / t : 0), 0);
test("Profile tab, live elimination event: request rate before → after (focused and off-tab)", () => {
  type Timers = { focused: (number | false)[]; offTab: (number | false)[] };
  const before: Timers = {
    // tournament row: usePlayerLiveMatch + usePlayerMatchActions' nested usePlayerLiveMatch
    // live RPC: Profile's own (focus-gated) + 2 nested useProfileTournaments that ignored focus
    focused: [5000, 5000, 30000, 30000, 30000],
    offTab: [5000, 5000, false, 30000, 30000],
  };
  const after: Timers = {
    focused: [playerPollInterval(5000, 1, { focused: true }), playerPollInterval(5000, 1, { focused: true, poll: false }), 30000, false, false],
    offTab: [playerPollInterval(5000, 1, { focused: false }), playerPollInterval(5000, 1, { focused: false, poll: false }), false, false, false],
  };
  const r = { bf: rate(before.focused), bo: rate(before.offTab), af: rate(after.focused), ao: rate(after.offTab) };
  console.log(`PROFILE req/s per player — focused ${r.bf.toFixed(3)} → ${r.af.toFixed(3)}; other tabs ${r.bo.toFixed(3)} → ${r.ao.toFixed(3)}`);
  assert.ok(r.af < r.bf / 1.5, "focused: one tournament poller, one live-RPC poller");
  assert.equal(r.ao, 0, "nothing polls while the player is on another tab");
});
