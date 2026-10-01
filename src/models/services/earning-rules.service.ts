// src/models/services/earning-rules.service.ts
// Giveaway-Entry earning rules + referral review (Super Admin). Server RPCs only — the rules table
// has no client write access; every change is validated and audit_log'd server-side.

import { supabase } from "../../lib/supabase";
import {
  EarningRulesPatch,
  EarningRulesSnapshot,
  FlaggedReferral,
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
