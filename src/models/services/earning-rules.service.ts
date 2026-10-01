// src/models/services/earning-rules.service.ts
// Giveaway-Entry earning rules + referral review (Super Admin). Server RPCs only — the rules table
// has no client write access; every change is validated and audit_log'd server-side.

import { supabase } from "../../lib/supabase";
import {
  EarningRulesPatch,
  EarningRulesSnapshot,
  FlaggedReferral,
  PublicReferralTerms,
  SaveEarningRulesResult,
} from "../types/earning-rules.types";

export const earningRulesService = {
  async get(): Promise<EarningRulesSnapshot> {
    const { data, error } = await supabase.rpc("get_giveaway_earning_rules");
    if (error) throw error;
    return data as EarningRulesSnapshot;
  },

  /** Partial update — only the keys in `patch` change. */
  async save(patch: EarningRulesPatch): Promise<SaveEarningRulesResult> {
    const { data, error } = await supabase.rpc("set_giveaway_earning_rules", { p_rules: patch });
    if (error) throw error;
    return data as SaveEarningRulesResult;
  },

  /**
   * Public referral terms (anon-callable, read-only). Throws on failure (e.g. before migration
   * 20261016120000 is applied) so React Query keeps the last good value on a failed refetch; with no
   * value at all the rules fall back to their generic wording without numbers.
   */
  async getPublicTerms(): Promise<PublicReferralTerms | null> {
    const { data, error } = await supabase.rpc("get_public_referral_terms");
    if (error) throw error;
    return (data as PublicReferralTerms) ?? null;
  },

  async listFlagged(): Promise<FlaggedReferral[]> {
    const { data, error } = await supabase.rpc("list_flagged_referrals");
    if (error) throw error;
    return (data as FlaggedReferral[]) ?? [];
  },

  async reviewFlag(referralId: number): Promise<{ ok: boolean; status: string }> {
    const { data, error } = await supabase.rpc("review_referral_flag", { p_referral_id: referralId });
    if (error) throw error;
    return data as { ok: boolean; status: string };
  },
};
