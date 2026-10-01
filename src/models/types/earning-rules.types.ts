// src/models/types/earning-rules.types.ts
// Giveaway-Entry earning rules (Super Admin → Giveaway Management → Earning Rules).
// Server contract: supabase/migrations/20261015120000_giveaway_earning_rules.sql
//   get_giveaway_earning_rules / set_giveaway_earning_rules / list_flagged_referrals /
//   review_referral_flag — all super_admin-only SECURITY DEFINER RPCs.

export interface ReferralMilestone {
  /** Successful referrals needed (rewarded or capped referrer credits). */
  threshold: number;
  /** Bonus Giveaway Entries, awarded once per threshold. */
  bonus: number;
}

export interface GiveawayEarningRules {
  referral_rewards_enabled: boolean;
  referrer_reward: number;
  referred_reward: number;
  attribution_window_days: number;
  monthly_referrer_cap: number;
  velocity_flag_threshold: number;
  milestones_enabled: boolean;
  milestones: ReferralMilestone[];
  updated_at: string | null;
  updated_by_name: string | null;
}

/**
 * The PUBLIC subset of the earning rules — get_public_referral_terms() (anon + authenticated),
 * migration 20261016120000. Shown in the Official Giveaway Rules and the Refer Friends disclosure.
 * No review/fraud thresholds, audit fields or raw flags (milestones is [] when disabled).
 */
export interface PublicReferralTerms {
  referral_rewards_enabled: boolean;
  referrer_reward: number;
  referred_reward: number;
  attribution_window_days: number;
  monthly_referrer_cap: number;
  /** Milestones actually paid (bonus > 0), ascending; [] when milestone bonuses are off. */
  milestones: ReferralMilestone[];
}

/** Fields the RPC accepts (partial update). */
export type EarningRulesPatch = Partial<Omit<GiveawayEarningRules, "updated_at" | "updated_by_name">>;

export interface EarningRulesStats {
  referrals_total: number;
  referrals_this_month: number;
  referrer_credits_this_month: number;
  referred_credits_this_month: number;
  milestone_awards_total: number;
  capped_total: number;
  flagged_open: number;
}

export interface EarningRulesSnapshot {
  rules: GiveawayEarningRules;
  stats: EarningRulesStats;
}

export interface SaveEarningRulesResult {
  ok: boolean;
  status: "saved" | "invalid" | "unknown_field" | "out_of_range" | string;
  field?: string | null;
  rules?: GiveawayEarningRules;
}

export type ReferralRewardStatus = "pending" | "rewarded" | "capped" | "failed" | "not_eligible";

export interface FlaggedReferral {
  id: number;
  created_at: string;
  flagged_at: string;
  flag_reason: string | null;
  reviewed_at: string | null;
  reward_status: ReferralRewardStatus;
  referred_reward_status: ReferralRewardStatus;
  referrer_id: number | null;
  referrer_name: string | null;
  referrer_username: string | null;
  referred_id: number;
  referred_name: string | null;
  referred_username: string | null;
}
