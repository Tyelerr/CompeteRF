// src/utils/earning-rules.ts
// Pure helpers for the Earning Rules editor: limits (mirroring the server CHECKs in
// 20261015120000_giveaway_earning_rules.sql), draft validation, and the minimal patch to send.
// The server re-validates everything; this only gives instant, field-level feedback.
// Unit-tested in src/utils/__tests__/earning-rules.test.ts.

import { EarningRulesPatch, GiveawayEarningRules, ReferralMilestone } from "../models/types/earning-rules.types";

export const RULE_LIMITS = {
  referrer_reward: { min: 0, max: 100 },
  referred_reward: { min: 0, max: 100 },
  attribution_window_days: { min: 1, max: 90 },
  monthly_referrer_cap: { min: 0, max: 1000 },
  velocity_flag_threshold: { min: 1, max: 1000 },
  milestone_threshold: { min: 1, max: 100000 },
  milestone_bonus: { min: 0, max: 1000 },
  milestone_count: 20,
} as const;

export type NumericRuleField =
  | "referrer_reward"
  | "referred_reward"
  | "attribution_window_days"
  | "monthly_referrer_cap"
  | "velocity_flag_threshold";

export const NUMERIC_RULE_FIELDS: NumericRuleField[] = [
  "referrer_reward",
  "referred_reward",
  "attribution_window_days",
  "monthly_referrer_cap",
  "velocity_flag_threshold",
];

/** Editable form state — numbers as strings so inputs can be empty mid-edit. */
export interface RulesDraft {
  referral_rewards_enabled: boolean;
  referrer_reward: string;
  referred_reward: string;
  attribution_window_days: string;
  monthly_referrer_cap: string;
  velocity_flag_threshold: string;
  milestones_enabled: boolean;
  milestones: { key: string; threshold: string; bonus: string }[];
}

let keySeq = 0;
export const newMilestoneKey = () => `m${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export function draftFromRules(r: GiveawayEarningRules): RulesDraft {
  return {
    referral_rewards_enabled: r.referral_rewards_enabled,
    referrer_reward: String(r.referrer_reward),
    referred_reward: String(r.referred_reward),
    attribution_window_days: String(r.attribution_window_days),
    monthly_referrer_cap: String(r.monthly_referrer_cap),
    velocity_flag_threshold: String(r.velocity_flag_threshold),
    milestones_enabled: r.milestones_enabled,
    milestones: r.milestones.map((m) => ({ key: newMilestoneKey(), threshold: String(m.threshold), bonus: String(m.bonus) })),
  };
}

const parseWhole = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

export interface RulesDraftErrors {
  fields: Partial<Record<NumericRuleField, string>>;
  /** Per milestone key: message for that row. */
  milestones: Record<string, string>;
  milestonesGeneral: string | null;
}

export function validateRulesDraft(d: RulesDraft): RulesDraftErrors {
  const errors: RulesDraftErrors = { fields: {}, milestones: {}, milestonesGeneral: null };
  for (const f of NUMERIC_RULE_FIELDS) {
    const n = parseWhole(d[f]);
    const { min, max } = RULE_LIMITS[f];
    if (n === null) errors.fields[f] = "Enter a whole number";
    else if (n < min || n > max) errors.fields[f] = `Must be ${min}–${max.toLocaleString()}`;
  }
  if (d.milestones.length > RULE_LIMITS.milestone_count) {
    errors.milestonesGeneral = `At most ${RULE_LIMITS.milestone_count} milestones`;
  }
  const seen = new Map<number, string>();
  for (const m of d.milestones) {
    const t = parseWhole(m.threshold);
    const b = parseWhole(m.bonus);
    if (t === null || b === null) {
      errors.milestones[m.key] = "Whole numbers only";
    } else if (t < RULE_LIMITS.milestone_threshold.min || t > RULE_LIMITS.milestone_threshold.max) {
      errors.milestones[m.key] = `Referrals must be 1–${RULE_LIMITS.milestone_threshold.max.toLocaleString()}`;
    } else if (b > RULE_LIMITS.milestone_bonus.max) {
      errors.milestones[m.key] = `Bonus must be 0–${RULE_LIMITS.milestone_bonus.max.toLocaleString()}`;
    } else if (seen.has(t)) {
      errors.milestones[m.key] = `Duplicate: ${t} referrals is already a milestone`;
    } else {
      seen.set(t, m.key);
    }
  }
  return errors;
}

export const hasRulesErrors = (e: RulesDraftErrors) =>
  Object.keys(e.fields).length > 0 || Object.keys(e.milestones).length > 0 || e.milestonesGeneral !== null;

/** Sorted milestone list from a (valid) draft. */
export function milestonesFromDraft(d: RulesDraft): ReferralMilestone[] {
  return d.milestones
    .map((m) => ({ threshold: Number(m.threshold.trim()), bonus: Number(m.bonus.trim()) }))
    .sort((a, b) => a.threshold - b.threshold);
}

const sameMilestones = (a: ReferralMilestone[], b: ReferralMilestone[]) =>
  a.length === b.length && a.every((m, i) => m.threshold === b[i].threshold && m.bonus === b[i].bonus);

/** Only the fields that differ from the saved rules (empty object = nothing to save). */
export function buildRulesPatch(saved: GiveawayEarningRules, d: RulesDraft): EarningRulesPatch {
  const patch: EarningRulesPatch = {};
  if (d.referral_rewards_enabled !== saved.referral_rewards_enabled) patch.referral_rewards_enabled = d.referral_rewards_enabled;
  if (d.milestones_enabled !== saved.milestones_enabled) patch.milestones_enabled = d.milestones_enabled;
  for (const f of NUMERIC_RULE_FIELDS) {
    const n = Number(d[f].trim());
    if (n !== saved[f]) patch[f] = n;
  }
  const ms = milestonesFromDraft(d);
  const savedSorted = [...saved.milestones].sort((a, b) => a.threshold - b.threshold);
  if (!sameMilestones(ms, savedSorted)) patch.milestones = ms;
  return patch;
}
