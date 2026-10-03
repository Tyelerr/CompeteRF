// src/utils/__tests__/format-gating.test.ts
// Run: npx tsx --test src/utils/__tests__/format-gating.test.ts
// Setup format gating: only Single Elimination, Double Elimination and Chip can be selected,
// open registration or draw a bracket. Everything else stays visible as "COMING SOON".
// Historical rows (legacy aliases / unsupported values) stay readable and never silently
// fall back to a single/double bracket.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOURNAMENT_FORMATS } from "../tournament-form-data";
import {
  COMING_SOON_BADGE,
  isBracketEngine,
  isFormatComingSoon,
  liveEngineFor,
  withFormatAvailability,
} from "../tournament-formats";
import { missingSettingsItems, SettingsCompleteInput } from "../settings-complete";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/^﻿/, "");

const LIVE = ["single-elimination", "double-elimination", "chip-tournament"];
const COMING_SOON = ["round-robin", "swiss", "modified-double", "split-bracket"];

test("Setup list: Single, Double and Chip are selectable; every other format is Coming Soon", () => {
  const byValue = new Map(TOURNAMENT_FORMATS.map((o) => [o.value, o]));
  for (const v of LIVE) {
    assert.ok(byValue.has(v), `${v} listed`);
    assert.equal(byValue.get(v)!.disabled, undefined, `${v} enabled`);
    assert.equal(byValue.get(v)!.badge, undefined);
  }
  for (const v of COMING_SOON) {
    assert.ok(byValue.has(v), `${v} still listed (visible)`);
    assert.equal(byValue.get(v)!.disabled, true, `${v} disabled`);
    assert.equal(byValue.get(v)!.badge, COMING_SOON_BADGE);
  }
  // The placeholder is untouched; no option is silently removed.
  assert.equal(byValue.get("")!.disabled, undefined);
  assert.equal(TOURNAMENT_FORMATS.length, 1 + LIVE.length + COMING_SOON.length);
  // Every real option is either live or Coming Soon — nothing in between.
  for (const o of TOURNAMENT_FORMATS.filter((x) => x.value)) {
    assert.equal(!!o.disabled, liveEngineFor(o.value) === null, o.value);
  }
});

test("legacy TD edit list gates Round Robin the same way", () => {
  const opts = withFormatAvailability([
    { label: "Single Elimination", value: "single_elimination" },
    { label: "Double Elimination", value: "double_elimination" },
    { label: "Round Robin", value: "round_robin" },
  ]);
  assert.deepEqual(opts.map((o) => !!o.disabled), [false, false, true]);
  const src = read("app/(tabs)/admin/edit-tournament-td/[id].tsx");
  assert.match(src, /const formatTypes = withFormatAvailability\(\[/);
});

test("old records stay readable: legacy aliases map to their engine, case/space-insensitive", () => {
  assert.equal(liveEngineFor("single-elimination"), "single");
  assert.equal(liveEngineFor("single-elim"), "single");
  assert.equal(liveEngineFor("single_elimination"), "single");
  assert.equal(liveEngineFor(" Double-Elim "), "double");
  assert.equal(liveEngineFor("double_elimination"), "double");
  assert.equal(liveEngineFor("chip-tournament"), "chip");
  assert.equal(isBracketEngine("double-elim"), true);
  assert.equal(isBracketEngine("chip-tournament"), false);
});

test("unsupported formats have NO engine — no silent single/double fallback", () => {
  for (const v of [...COMING_SOON, "round_robin", "modified-single", "other", "Double Round Robin"]) {
    assert.equal(liveEngineFor(v), null, v);
    assert.equal(isBracketEngine(v), false, v);
    assert.equal(isFormatComingSoon(v), true, v);
  }
  // Blank is "not chosen yet", not Coming Soon.
  assert.equal(isFormatComingSoon(""), false);
  assert.equal(isFormatComingSoon(null), false);
});

const base: SettingsCompleteInput = {
  name: "Test", gameType: "9-ball", format: "single-elimination", entryFee: 10, open: true,
  raceMode: "fixed", date: "2027-12-31", time: "19:00", venueId: 1, tableSize: "7ft", equipment: "Diamond",
} as unknown as SettingsCompleteInput;

test("Start Registration is blocked for a Coming Soon format (settings incomplete)", () => {
  const formatMissing = (format: string) =>
    missingSettingsItems({ ...base, format } as SettingsCompleteInput).some((m) => m.key === "format");
  for (const v of LIVE) assert.equal(formatMissing(v), false, `${v} passes`);
  assert.equal(formatMissing("double-elim"), false, "legacy alias still passes");
  for (const v of COMING_SOON) assert.equal(formatMissing(v), true, `${v} blocked`);
  assert.equal(formatMissing(""), true, "blank still required");
});

test("Generate Bracket refuses formats without a bracket engine (no includes('double') fallback)", () => {
  const src = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  const start = src.indexOf("const handleDrawBracket");
  assert.ok(start > 0);
  const body = src.slice(start, start + 2500);
  assert.match(body, /const engine = liveEngineFor\(format\);/);
  assert.match(body, /if \(engine !== "single" && engine !== "double"\) \{[\s\S]*?COMING_SOON_FORMAT_MESSAGE[\s\S]*?return;/);
  assert.match(body, /const doubleElim = engine === "double";/);
  assert.doesNotMatch(body, /\.includes\("double"\)/);
  assert.doesNotMatch(body, /\?\? "single-elimination"/, "no default-to-single fallback");
});

test("Dropdown: disabled options are visible but never selectable (web + native)", () => {
  const src = read("src/views/components/common/dropdown.tsx");
  assert.match(src, /onClick=\{\(\) => \{ if \(item\.disabled\) return; onSelect\(item\.value\);/, "web click ignored");
  assert.match(src, /cursor: isDisabled \? "not-allowed" : "pointer"/);
  assert.match(src, /disabled=\{item\.disabled\}/, "native press disabled");
  assert.match(src, /\{!!item\.badge && /);
});
