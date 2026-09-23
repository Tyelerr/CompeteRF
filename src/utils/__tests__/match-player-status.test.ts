// src/utils/__tests__/match-player-status.test.ts
// Run: npx tsx --test src/utils/__tests__/match-player-status.test.ts
// What the TD sees beside each player (○ / ✓ plus a separate unresolved-message indicator) and,
// crucially, that state from an older assignment is never shown against the current one.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { MatchPlayerStatus } from "../../models/types/match-checkin.types";
import { byMatchId, glyphFor, openIssueFor, statusForAssignment } from "../match-player-status";

const A1 = "2026-09-22T18:00:00.000Z";
const A2 = "2026-09-22T19:30:00.000Z";
const row = (over: Partial<MatchPlayerStatus> = {}): MatchPlayerStatus => ({
  id: 1, tournament_id: 2595, match_id: "W1M2", registration_id: 501, assigned_at: A1, draw_number: 1,
  checked_in_at: null, issue_reason: null, issue_message: null, issue_at: null, resolved_at: null, ...over,
});
const args = (over: Record<string, unknown> = {}) => ({ matchId: "W1M2", registrationId: 501, assignedAt: A1, ...over });

test("no row yet → ○ (waiting on the player)", () => {
  assert.equal(glyphFor([], args()), "not_checked_in");
  assert.equal(glyphFor(null, args()), "not_checked_in");
});

test("check-in and an open message are INDEPENDENT states", () => {
  // ✓ with no message
  assert.equal(glyphFor([row({ checked_in_at: A1 })], args()), "checked_in");
  assert.equal(openIssueFor([row({ checked_in_at: A1 })], args()), null);
  // ○ with a message
  const openIssue = row({ issue_at: A1, issue_reason: "running_late" });
  assert.equal(glyphFor([openIssue], args()), "not_checked_in");
  assert.equal(openIssueFor([openIssue], args())?.issue_reason, "running_late");
  // ✓ AND a message — contacting the TD never clears the check-in
  const both = row({ checked_in_at: A1, issue_at: A1, issue_reason: "equipment" });
  assert.equal(glyphFor([both], args()), "checked_in");
  assert.ok(openIssueFor([both], args()));
  // resolved → the indicator disappears, the ✓ stays
  const resolved = row({ checked_in_at: A1, issue_at: A1, resolved_at: A2 });
  assert.equal(glyphFor([resolved], args()), "checked_in");
  assert.equal(openIssueFor([resolved], args()), null);
  // resolved with no check-in stays ○
  assert.equal(glyphFor([row({ issue_at: A1, resolved_at: A2 })], args()), "not_checked_in");
  assert.equal(openIssueFor([row({ issue_at: A1, resolved_at: A2 })], args()), null);
});

test("a message only counts for the CURRENT assignment and never for a finished match", () => {
  const old = [row({ issue_at: A1, assigned_at: A1, issue_reason: "dispute" })];
  assert.equal(openIssueFor(old, args({ assignedAt: A2 })), null, "previous assignment");
  assert.equal(openIssueFor(old, args({ status: "completed" })), null);
  assert.equal(openIssueFor(old, args({ assignedAt: null })), null);
  assert.equal(openIssueFor(old, args({ registrationId: null })), null);
});

test("one player's message never shows on the other player", () => {
  const rows = [row({ id: 1, registration_id: 501, issue_at: A1, issue_reason: "watch_shot" }), row({ id: 2, registration_id: 502, checked_in_at: A1 })];
  assert.ok(openIssueFor(rows, args({ registrationId: 501 })));
  assert.equal(openIssueFor(rows, args({ registrationId: 502 })), null);
  assert.equal(glyphFor(rows, args({ registrationId: 502 })), "checked_in");
});

test("a check-in from a PREVIOUS assignment is never shown on the new one", () => {
  const old = [row({ checked_in_at: A1, assigned_at: A1 })];
  assert.equal(glyphFor(old, args({ assignedAt: A2 })), "not_checked_in", "new table ⇒ fresh check-in required");
  assert.equal(statusForAssignment(old, args({ assignedAt: A2 })), null);
  // …and the row for the current assignment is the one that counts
  const both = [row({ checked_in_at: A1, assigned_at: A1 }), row({ id: 2, checked_in_at: A2, assigned_at: A2 })];
  assert.equal(glyphFor(both, args({ assignedAt: A2 })), "checked_in");
  assert.equal(statusForAssignment(both, args({ assignedAt: A2 }))?.id, 2);
});

test("no glyph at all when there is nothing to check in for", () => {
  assert.equal(glyphFor([row({ checked_in_at: A1 })], args({ assignedAt: null })), null, "unassigned (e.g. after Clear Table)");
  assert.equal(glyphFor([row({ checked_in_at: A1 })], args({ status: "completed" })), null, "finished match");
  assert.equal(glyphFor([row()], args({ registrationId: null })), null, "unknown player (bye / TBD)");
});

test("rows are matched per player and per match, never mixed up", () => {
  const rows = [
    row({ id: 1, registration_id: 501, checked_in_at: A1 }),
    row({ id: 2, registration_id: 502 }),
    row({ id: 3, match_id: "W2M1", registration_id: 501, checked_in_at: A1 }),
  ];
  assert.equal(glyphFor(rows, args({ registrationId: 501 })), "checked_in");
  assert.equal(glyphFor(rows, args({ registrationId: 502 })), "not_checked_in", "the opponent stays ○");
  assert.equal(glyphFor(rows, args({ matchId: "W2M1", registrationId: 502 })), "not_checked_in");
  // string ids from the API compare equal to numeric ones
  assert.equal(glyphFor([row({ registration_id: "501" as unknown as number, checked_in_at: A1 })], args()), "checked_in");
});

test("byMatchId groups rows for one pass over the TD's match list", () => {
  const grouped = byMatchId([row({ id: 1 }), row({ id: 2, registration_id: 502 }), row({ id: 3, match_id: "L1M1" })]);
  assert.deepEqual(Object.keys(grouped).sort(), ["L1M1", "W1M2"]);
  assert.equal(grouped.W1M2.length, 2);
  assert.deepEqual(byMatchId(null), {});
});

test("timestamps are compared as instants, not strings", () => {
  const rows = [row({ checked_in_at: A1, assigned_at: "2026-09-22T18:00:00+00:00" })];
  assert.equal(glyphFor(rows, args({ assignedAt: A1 })), "checked_in", "same instant, different spelling");
});
