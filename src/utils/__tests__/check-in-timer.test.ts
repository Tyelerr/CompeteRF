// src/utils/__tests__/check-in-timer.test.ts
// Run: npx tsx --test src/utils/__tests__/check-in-timer.test.ts
// The check-in timer model: starts at assignedAt, ignores Check In / Contact TD, stops at Start
// Match, thresholds from settings, per-assignment extension. No automatic penalties anywhere.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_IN_DEFAULTS,
  CHECK_IN_LIMITS,
  CheckInSettings,
  canPlayerStart,
  computeCheckInTimer,
  formatElapsed,
  readCheckInSettings,
  validateCheckInSettings,
} from "../check-in-timer";

const ASSIGNED = "2026-09-23T19:00:00.000Z"; // 7:00 PM
const T0 = Date.parse(ASSIGNED);
const at = (min: number, sec = 0) => T0 + min * 60_000 + sec * 1000;
const on: CheckInSettings = { required: true, warnAfterMinutes: 5, forfeitReviewAfterMinutes: 10 };
const match = (over: Record<string, unknown> = {}) => ({ assignedAt: ASSIGNED, status: "scheduled", tableId: 38, ...over }) as any;
const timer = (min: number, bothCheckedIn = false, over: Record<string, unknown> = {}, settings = on, extendedMinutes = 0) =>
  computeCheckInTimer({ match: match(over), bothCheckedIn, settings, extendedMinutes, now: at(min) });

// ── Settings ────────────────────────────────────────────────────────────────────────────────
test("settings default to off / 5 / 10 and are read from live_settings.checkIn", () => {
  assert.deepEqual(readCheckInSettings(null), CHECK_IN_DEFAULTS);
  assert.deepEqual(readCheckInSettings({} as any), CHECK_IN_DEFAULTS);
  assert.deepEqual(
    readCheckInSettings({ checkIn: { required: true, warnAfterMinutes: 3, forfeitReviewAfterMinutes: 8 } } as any),
    { required: true, warnAfterMinutes: 3, forfeitReviewAfterMinutes: 8 },
  );
});

test("thresholds are configurable, clamped, and Forfeit Review never precedes the warning", () => {
  const s = readCheckInSettings({ checkIn: { warnAfterMinutes: 0, forfeitReviewAfterMinutes: 999 } } as any);
  assert.equal(s.warnAfterMinutes, CHECK_IN_LIMITS.minMinutes);
  assert.equal(s.forfeitReviewAfterMinutes, CHECK_IN_LIMITS.maxMinutes);
  // review earlier than warn → pushed out to the warning
  const s2 = readCheckInSettings({ checkIn: { warnAfterMinutes: 10, forfeitReviewAfterMinutes: 4 } } as any);
  assert.equal(s2.forfeitReviewAfterMinutes, 10);
  // junk falls back
  const s3 = readCheckInSettings({ checkIn: { warnAfterMinutes: "soon", forfeitReviewAfterMinutes: null } } as any);
  assert.equal(s3.warnAfterMinutes, 5);
  assert.equal(s3.forfeitReviewAfterMinutes, 10);
});

test("the Settings form rejects out-of-range and inverted values", () => {
  assert.deepEqual(validateCheckInSettings({ warnAfterMinutes: 5, forfeitReviewAfterMinutes: 10 }), []);
  assert.equal(validateCheckInSettings({ warnAfterMinutes: 0 }).length, 1);
  assert.equal(validateCheckInSettings({ forfeitReviewAfterMinutes: 999 }).length, 1);
  assert.equal(validateCheckInSettings({ warnAfterMinutes: 10, forfeitReviewAfterMinutes: 5 }).length, 1);
  assert.equal(validateCheckInSettings({ warnAfterMinutes: 45, forfeitReviewAfterMinutes: 60 }).length, 0, "custom values are fine");
});

// ── The timeline from the brief ─────────────────────────────────────────────────────────────
test("7:00 assigned → 7:01 A checks in → 7:03 both in → 7:05 warn → 7:10 Forfeit Review", () => {
  assert.equal(timer(1).label, "1:00", "counts from assignedAt, not from the check-in");
  assert.equal(timer(3, true).label, "3:00", "checking in does NOT stop the timer");
  assert.equal(timer(5, true).label, "⚠ Match Not Started · 5:00");
  assert.equal(timer(5, false).label, "⚠ Not Checked In · 5:00");
  assert.equal(timer(10, true).label, "🔴 Forfeit Review · 10:00");
  assert.equal(timer(10, true).phase, "review");
});

test("Start Match stops the timer; completion too", () => {
  assert.equal(timer(8, true, { status: "in_progress", startedAt: ASSIGNED }).phase, "inactive");
  assert.equal(timer(8, true, { status: "in_progress" }).label, "", "warning clears the moment it starts");
  assert.equal(timer(30, true, { status: "completed" }).phase, "inactive");
});

test("no assignment → no timer (Clear Table, unassigned, or a missing stamp)", () => {
  assert.equal(timer(9, true, { tableId: null }).phase, "inactive");
  assert.equal(timer(9, true, { assignedAt: null }).phase, "inactive");
  assert.equal(computeCheckInTimer({ match: null, bothCheckedIn: true, settings: on, now: at(9) }).phase, "inactive");
  // a NEW assignment restarts the clock from its own stamp
  const later = computeCheckInTimer({
    match: match({ assignedAt: new Date(at(20)).toISOString() }), bothCheckedIn: false, settings: on, now: at(21),
  });
  assert.equal(later.label, "1:00");
});

test("Contact TD never affects the timer (message state is independent)", () => {
  // the caller passes only check-in completeness; there is no issue input at all
  assert.equal(timer(7, true).label, "⚠ Match Not Started · 7:00");
  assert.equal(timer(7, false).label, "⚠ Not Checked In · 7:00");
});

// ── Extension ───────────────────────────────────────────────────────────────────────────────
test("Extend Time pushes BOTH thresholds out for this assignment only", () => {
  assert.equal(timer(6, false, {}, on, 5).phase, "waiting", "+5 → the warning moves to 10");
  assert.equal(timer(11, false, {}, on, 5).phase, "warn");
  assert.equal(timer(16, false, {}, on, 5).phase, "review", "review moves to 15");
  assert.equal(timer(6, false, {}, on, 5).extendedMinutes, 5, "the card can show 'Extended +5 min'");
  // the tournament defaults are untouched
  assert.deepEqual(on, { required: true, warnAfterMinutes: 5, forfeitReviewAfterMinutes: 10 });
});

test("reviewAt is an absolute instant, so the server alert and the UI agree", () => {
  assert.equal(timer(1).reviewAt, at(10));
  assert.equal(timer(1, false, {}, on, 5).reviewAt, at(15));
});

// ── Start Match gating ──────────────────────────────────────────────────────────────────────
test("a player may start only their own assigned, not-started match", () => {
  assert.deepEqual(canPlayerStart({ match: match(), bothCheckedIn: true, settings: on }), { ok: true });
  assert.equal(canPlayerStart({ match: match({ tableId: null }), bothCheckedIn: true, settings: on }).reason, "no_table");
  assert.equal(canPlayerStart({ match: match({ status: "in_progress" }), bothCheckedIn: true, settings: on }).reason, "already_started");
  assert.equal(canPlayerStart({ match: match({ status: "completed" }), bothCheckedIn: true, settings: on }).reason, "already_started");
  assert.equal(canPlayerStart({ match: null, bothCheckedIn: true, settings: on }).reason, "no_match");
});

test("check-in gates Start Match only when the TD requires check-in", () => {
  assert.equal(canPlayerStart({ match: match(), bothCheckedIn: false, settings: on }).reason, "waiting_for_check_in");
  const off: CheckInSettings = { ...on, required: false };
  assert.deepEqual(canPlayerStart({ match: match(), bothCheckedIn: false, settings: off }), { ok: true },
    "check-in off → the existing start behaviour is unchanged");
});

test("with check-in off the timer still runs but never blocks anything", () => {
  const off: CheckInSettings = { required: false, warnAfterMinutes: 5, forfeitReviewAfterMinutes: 10 };
  assert.equal(timer(7, false, {}, off).phase, "warn", "the TD still sees how long it has waited");
  assert.deepEqual(canPlayerStart({ match: match(), bothCheckedIn: false, settings: off }), { ok: true });
});

test("elapsed formatting", () => {
  assert.equal(formatElapsed(0), "0:00");
  assert.equal(formatElapsed(3_000), "0:03");
  assert.equal(formatElapsed(222_000), "3:42");
  assert.equal(formatElapsed(3_672_000), "61:12");
  assert.equal(formatElapsed(-5), "0:00", "a future stamp never shows a negative clock");
});
