// src/utils/__tests__/player-match-link.test.ts
// Run: npx tsx --test src/utils/__tests__/player-match-link.test.ts
// Where a tapped Table Assigned notification lands, including every stale case.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PlayerMatchSnapshot,
  STALE_MATCH_NOTICE,
  parseAssignmentDeepLink,
  resolvePlayerMatchTarget,
} from "../player-match-link";

const A1 = "2026-09-22T18:00:00.000Z";
const A2 = "2026-09-22T19:30:00.000Z";
const link = (over: Partial<ReturnType<typeof parseAssignmentDeepLink>> = {}) => ({
  tournamentId: 2595, matchId: "W1M2", assignedAt: A1, action: "check_in", ...over,
});
const current = (over: Partial<PlayerMatchSnapshot> = {}): PlayerMatchSnapshot => ({
  tournamentId: 2595, matchId: "W1M2", assignedAt: A1, tableId: 38, status: "scheduled", ...over,
});

test("parses the deep link the notification builder writes", () => {
  const p = parseAssignmentDeepLink(`/(tabs)/profile?liveId=2595&matchId=W1M2&assignedAt=${encodeURIComponent(A1)}&action=check_in`);
  assert.deepEqual(p, { tournamentId: 2595, matchId: "W1M2", assignedAt: A1, action: "check_in" });
});

test("parses expo-router params objects and tolerates junk", () => {
  assert.deepEqual(parseAssignmentDeepLink({ liveId: "7", matchId: ["L1M1"], assignedAt: A1, action: "check_in" }),
    { tournamentId: 7, matchId: "L1M1", assignedAt: A1, action: "check_in" });
  assert.deepEqual(parseAssignmentDeepLink(null), { tournamentId: null, matchId: null, assignedAt: null, action: null });
  assert.equal(parseAssignmentDeepLink("/(tabs)/profile?liveId=abc").tournamentId, null);
  // snake_case payload keys also work (in-app notification rows)
  assert.equal(parseAssignmentDeepLink({ tournament_id: "9", match_id: "W2M1" }).matchId, "W2M1");
});

test("exact assignment still current → open the Check-In modal", () => {
  const t = resolvePlayerMatchTarget(link(), current());
  assert.deepEqual(t, { kind: "check_in", tournamentId: 2595, matchId: "W1M2" });
  // an in-progress match is still the player's current context
  assert.equal(resolvePlayerMatchTarget(link(), current({ status: "in_progress" })).kind, "check_in");
});

test("table changed → the newer assignment of the same match opens as the current match", () => {
  const t = resolvePlayerMatchTarget(link({ assignedAt: A1 }), current({ assignedAt: A2, tableId: 46 }));
  assert.equal(t.kind, "current_match");
  assert.equal(t.matchId, "W1M2");
  assert.equal(t.notice, STALE_MATCH_NOTICE);
});

test("the player has moved on to a different match → show that one", () => {
  const t = resolvePlayerMatchTarget(link(), current({ matchId: "W2M1", assignedAt: A2, tableId: 39 }));
  assert.equal(t.kind, "current_match");
  assert.equal(t.matchId, "W2M1");
});

test("completed / cleared / no match left → Tournament View with a notice, never a broken modal", () => {
  for (const snap of [
    current({ status: "completed" }),
    current({ tableId: null }), // Clear Table
    current({ matchId: null, tableId: null }),
    null,
    undefined,
  ]) {
    const t = resolvePlayerMatchTarget(link(), snap);
    assert.equal(t.kind, "no_active_match", JSON.stringify(snap));
    assert.equal(t.tournamentId, 2595, "still their tournament, not generic details");
    assert.equal(t.notice, STALE_MATCH_NOTICE);
  }
});

test("a notification for one tournament never opens another", () => {
  const t = resolvePlayerMatchTarget(link({ tournamentId: 2595 }), current({ tournamentId: 1234 }));
  assert.equal(t.kind, "no_active_match");
  assert.equal(t.tournamentId, 2595);
  assert.equal(t.matchId, null);
});

test("generic tournament details only when the tournament cannot be resolved", () => {
  assert.equal(resolvePlayerMatchTarget(link({ tournamentId: null }), current()).kind, "tournament_detail");
  // every other case stays inside the player's own Tournament View
  for (const t of [resolvePlayerMatchTarget(link(), current()), resolvePlayerMatchTarget(link(), null)])
    assert.notEqual(t.kind, "tournament_detail");
});

test("an older payload without assignedAt still opens the match by id", () => {
  assert.equal(resolvePlayerMatchTarget(link({ assignedAt: null }), current()).kind, "check_in");
  assert.equal(resolvePlayerMatchTarget(link({ assignedAt: null, matchId: "L1M1" }), current()).kind, "current_match");
});
