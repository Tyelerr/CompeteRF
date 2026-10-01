// src/utils/__tests__/giveaway-end-rule.test.ts
// Run: npx tsx --test src/utils/__tests__/giveaway-end-rule.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { END_TYPE_OPTIONS, describeEndRule, formatEndDateParts } from "../giveaway-end-rule";

test("all three end rules are offered", () => {
  assert.deepEqual(END_TYPE_OPTIONS.map((o) => o.value), ["entries", "date", "both"]);
});

test("formatEndDateParts", () => {
  assert.equal(formatEndDateParts({ month: "12", day: "1", year: "2026" }), "December 1, 2026");
  assert.equal(formatEndDateParts({ month: "", day: "1", year: "2026" }), null);
  assert.equal(formatEndDateParts({ month: "13", day: "1", year: "2026" }), null);
});

test("describeEndRule: entries only / date only / both, with and without values", () => {
  assert.equal(describeEndRule("entries", "50", null), "Ends as soon as 50 entries are reached. No end date.");
  assert.equal(describeEndRule("entries", "1", null), "Ends as soon as 1 entry is reached. No end date.");
  assert.equal(
    describeEndRule("date", "", "December 1, 2026"),
    "Ends on December 1, 2026 at 11:59 PM (Arizona time). Unlimited entries until then.",
  );
  assert.equal(
    describeEndRule("both", 5000, "December 1, 2026"),
    "Ends when 5,000 entries are reached or on December 1, 2026 at 11:59 PM (Arizona time) — whichever happens first.",
  );
  assert.match(describeEndRule("both", "", null), /the entry capacity is reached or on the end date/);
});
