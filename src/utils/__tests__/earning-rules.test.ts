// src/utils/__tests__/earning-rules.test.ts
// Run: npx tsx --test src/utils/__tests__/earning-rules.test.ts
// Earning Rules editor helpers: draft round-trip, validation mirrors the server limits, and the
// patch contains only changed fields (milestones compared order-insensitively).

import { test } from "node:test";
import assert from "node:assert/strict";
import { GiveawayEarningRules } from "../../models/types/earning-rules.types";
import {
  buildRulesPatch,
  draftFromRules,
  hasRulesErrors,
  milestonesFromDraft,
  validateRulesDraft,
} from "../earning-rules";

const saved: GiveawayEarningRules = {
  referral_rewards_enabled: true,
  referrer_reward: 1,
  referred_reward: 1,
  attribution_window_days: 7,
  monthly_referrer_cap: 25,
  velocity_flag_threshold: 5,
  milestones_enabled: true,
  milestones: [
    { threshold: 5, bonus: 5 },
    { threshold: 10, bonus: 5 },
    { threshold: 25, bonus: 5 },
    { threshold: 50, bonus: 5 },
  ],
  updated_at: null,
  updated_by_name: null,
};

test("draft round-trip: unchanged draft → empty patch, no errors", () => {
  const d = draftFromRules(saved);
  assert.deepEqual(buildRulesPatch(saved, d), {});
  assert.equal(hasRulesErrors(validateRulesDraft(d)), false);
});

test("patch carries only changed fields", () => {
  const d = draftFromRules(saved);
  d.referred_reward = "2";
  d.referral_rewards_enabled = false;
  assert.deepEqual(buildRulesPatch(saved, d), { referral_rewards_enabled: false, referred_reward: 2 });
});

test("milestones: reorder alone is not a change; edits/add/remove are, sent sorted", () => {
  const d = draftFromRules(saved);
  d.milestones.reverse();
  assert.deepEqual(buildRulesPatch(saved, d), {});
  d.milestones.push({ key: "x", threshold: "3", bonus: "2" });
  const p = buildRulesPatch(saved, d);
  assert.deepEqual(p.milestones?.map((m) => m.threshold), [3, 5, 10, 25, 50]);
  d.milestones = d.milestones.filter((m) => m.threshold !== "50" && m.key !== "x");
  assert.deepEqual(buildRulesPatch(saved, d).milestones?.map((m) => m.threshold), [5, 10, 25]);
});

test("validation: whole numbers within server limits", () => {
  const d = draftFromRules(saved);
  d.referrer_reward = "101";
  d.attribution_window_days = "0";
  d.monthly_referrer_cap = "2.5";
  d.velocity_flag_threshold = "";
  const e = validateRulesDraft(d);
  assert.deepEqual(Object.keys(e.fields).sort(), ["attribution_window_days", "monthly_referrer_cap", "referrer_reward", "velocity_flag_threshold"]);
  assert.equal(hasRulesErrors(e), true);
});

test("validation: milestone rows (duplicate threshold, range, non-numeric, count)", () => {
  const d = draftFromRules(saved);
  d.milestones.push({ key: "dup", threshold: "10", bonus: "1" });
  d.milestones.push({ key: "zero", threshold: "0", bonus: "1" });
  d.milestones.push({ key: "txt", threshold: "x", bonus: "1" });
  d.milestones.push({ key: "big", threshold: "7", bonus: "5000" });
  const e = validateRulesDraft(d);
  assert.deepEqual(Object.keys(e.milestones).sort(), ["big", "dup", "txt", "zero"]);
  const many = draftFromRules(saved);
  many.milestones = Array.from({ length: 21 }, (_, i) => ({ key: `k${i}`, threshold: String(i + 1), bonus: "1" }));
  assert.notEqual(validateRulesDraft(many).milestonesGeneral, null);
});

test("milestonesFromDraft sorts by threshold and trims", () => {
  const d = draftFromRules(saved);
  d.milestones = [{ key: "a", threshold: " 9 ", bonus: "1" }, { key: "b", threshold: "2", bonus: " 3" }];
  assert.deepEqual(milestonesFromDraft(d), [{ threshold: 2, bonus: 3 }, { threshold: 9, bonus: 1 }]);
});
