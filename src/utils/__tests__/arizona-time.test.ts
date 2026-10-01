// src/utils/__tests__/arizona-time.test.ts
// Run: npx tsx --test src/utils/__tests__/arizona-time.test.ts
// Giveaway end-date contract: a date-based giveaway ends at 11:59:59 PM Arizona time on the selected
// calendar date, identically in Create and Edit, independent of the device/browser time zone.
// (Run with TZ=Pacific/Auckland or TZ=America/New_York — results must not change.)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arizonaDatePartsFromISO,
  arizonaEndOfDayISO,
  isValidCalendarDate,
  sameCalendarDate,
  toArizonaWallClock,
} from "../arizona-time";
import { endDateForSave } from "../giveaway-end-rule";
import { buildOfficialRules, endsLabel } from "../giveaway-rules";
import { getEndsLabel } from "../giveaway-console";

const OCT5 = { month: "10", day: "5", year: "2026" };

test("Create stores 11:59:59 PM Arizona on the selected date", () => {
  const iso = arizonaEndOfDayISO(OCT5)!;
  assert.equal(iso, "2026-10-05T23:59:59-07:00");
  assert.equal(new Date(iso).toISOString(), "2026-10-06T06:59:59.000Z"); // the instant Postgres stores
  assert.deepEqual(toArizonaWallClock(iso), { year: 2026, month: 10, day: 5, hours: 23, minutes: 59, seconds: 59 });
  assert.equal(arizonaEndOfDayISO({ month: "1", day: "9", year: "2027" }), "2027-01-09T23:59:59-07:00"); // zero-padded
});

test("Edit shows the same Arizona calendar date Create saved (round-trip, both value forms)", () => {
  assert.deepEqual(arizonaDatePartsFromISO("2026-10-05T23:59:59-07:00"), OCT5);
  assert.deepEqual(arizonaDatePartsFromISO("2026-10-06T06:59:59+00:00"), OCT5); // as PostgREST returns it
  assert.deepEqual(arizonaDatePartsFromISO("2026-10-06T06:59:59.000Z"), OCT5);
  // The old UTC parse read this value as Oct 6 — the reported Create/Edit day disagreement.
  assert.notDeepEqual({ month: "10", day: String(new Date("2026-10-06T06:59:59Z").getUTCDate()), year: "2026" }, OCT5);
  // Round-trip is stable for every day of a year (month ends, leap day, year end).
  for (let d = new Date(Date.UTC(2028, 0, 1)); d.getUTCFullYear() === 2028; d = new Date(d.getTime() + 86400000)) {
    const parts = { month: String(d.getUTCMonth() + 1), day: String(d.getUTCDate()), year: "2028" };
    assert.deepEqual(arizonaDatePartsFromISO(arizonaEndOfDayISO(parts)), parts);
  }
  assert.deepEqual(arizonaDatePartsFromISO(null), { month: "", day: "", year: "" });
  assert.deepEqual(arizonaDatePartsFromISO("garbage"), { month: "", day: "", year: "" });
});

test("invalid / incomplete dates are rejected", () => {
  assert.equal(isValidCalendarDate({ month: "2", day: "31", year: "2026" }), false);
  assert.equal(isValidCalendarDate({ month: "2", day: "29", year: "2028" }), true);
  assert.equal(isValidCalendarDate({ month: "2", day: "29", year: "2027" }), false);
  assert.equal(arizonaEndOfDayISO({ month: "4", day: "31", year: "2026" }), null);
  assert.equal(arizonaEndOfDayISO({ month: "", day: "5", year: "2026" }), null);
  assert.equal(sameCalendarDate({ month: "05", day: "07", year: "2026" }, { month: "5", day: "7", year: "2026" }), true);
});

test("Scenario: create date-only, edit without changing the date → end_date untouched", () => {
  const stored = arizonaEndOfDayISO(OCT5)!; // Create
  const loaded = { end_type: "date" as const, end_date: arizonaDatePartsFromISO(stored) }; // Edit loads
  assert.deepEqual(loaded.end_date, OCT5);
  assert.equal(endDateForSave(loaded, loaded), undefined); // nothing written → deadline cannot shift
  // A legacy row stored at another time (old midnight-UTC format) is also left exactly as is.
  const legacy = { end_type: "date" as const, end_date: arizonaDatePartsFromISO("2026-04-13T00:00:00+00:00") };
  assert.deepEqual(legacy.end_date, { month: "4", day: "12", year: "2026" }); // its real Arizona date
  assert.equal(endDateForSave(legacy, legacy), undefined);
});

test("Scenario: edit to another date → 11:59:59 PM Arizona on the new date (same as Create)", () => {
  const original = { end_type: "date" as const, end_date: OCT5 };
  const edited = { end_type: "date" as const, end_date: { month: "10", day: "12", year: "2026" } };
  const saved = endDateForSave(edited, original);
  assert.equal(saved, "2026-10-12T23:59:59-07:00");
  assert.equal(saved, arizonaEndOfDayISO(edited.end_date)); // Create and Edit agree exactly
  assert.equal(endDateForSave({ end_type: "date", end_date: { month: "2", day: "31", year: "2027" } }, original), "invalid");
});

test("Scenario: both-mode and switching end types", () => {
  const both = { end_type: "both" as const, end_date: OCT5 };
  assert.equal(endDateForSave(both, both), undefined);
  // capacity → both: a date is added, so it is written in Arizona time
  assert.equal(
    endDateForSave(both, { end_type: "entries", end_date: { month: "", day: "", year: "" } }),
    "2026-10-05T23:59:59-07:00",
  );
  assert.equal(endDateForSave({ end_type: "entries", end_date: OCT5 }, both), undefined); // cleared by caller
});

test("public Ends, Official Rules Entry Period and admin console all read the same Arizona date", () => {
  const g = { entry_mode: "wallet" as const, per_user_max: 10, max_entries: 5000, end_date: "2026-10-06T06:59:59+00:00" };
  assert.equal(endsLabel(g), "At 5,000 total entries or October 5, 2026, 11:59 PM (Arizona time), whichever comes first");
  const period = buildOfficialRules(g).find((s) => s.id === "entry-period")!.body;
  assert.match(period, /or at 11:59 PM Arizona time on October 5, 2026, whichever happens first/);
  assert.equal(getEndsLabel({ end_date: g.end_date, max_entries: 5000, ended_at: null, status: "active" }).primary, "Oct 5, 2026");
  const dateOnly = { entry_mode: "legacy_single" as const, max_entries: null, end_date: "2026-10-06T06:59:59+00:00" };
  assert.equal(endsLabel(dateOnly), "October 5, 2026, 11:59 PM (Arizona time)");
});

test("automatic end timing: the sweep's end_date <= now() flips exactly after 11:59:59 PM Arizona", () => {
  const end = new Date(arizonaEndOfDayISO(OCT5)!).getTime();
  const sweepEnds = (nowIso: string) => end <= new Date(nowIso).getTime(); // _giveaway_end_due_sweep predicate
  assert.equal(sweepEnds("2026-10-05T23:59:58-07:00"), false); // still open on Oct 5 in Arizona
  assert.equal(sweepEnds("2026-10-05T23:59:59-07:00"), true);
  assert.equal(sweepEnds("2026-10-06T00:04:59-07:00"), true); // cron (*/5) marks it ended by 12:05 AM
  assert.equal(sweepEnds("2026-10-05T16:59:00-07:00"), false); // the old Edit value (4:59 PM) no longer applies
});
