// src/models/services/referral.service.ts
// Referral attribution RPCs. Clients never read or write the referral tables directly —
// every operation goes through a SECURITY DEFINER function that derives the caller from auth.

import { supabase } from "../../lib/supabase";
import {
  ReferralClaimResult,
  ReferralCodeResolution,
  ReferralSource,
} from "../types/referral.types";
import { normalizeReferralCode } from "../../utils/referral";

const INVALID: ReferralCodeResolution = { valid: false, code: null, inviter: null };

export const referralService = {
  /** The signed-in user's active code (created server-side on demand if missing). */
  async getMyReferralCode(): Promise<string | null> {
    const { data, error } = await supabase.rpc("get_my_referral_code");
    if (error) {
      console.error("Error fetching referral code:", error);
      return null;
    }
    return (data as string | null) ?? null;
  },

  /** Public: is this code valid, and a minimal inviter label ("Tyler H."). */
  async resolveCode(code: string): Promise<ReferralCodeResolution> {
    const normalized = normalizeReferralCode(code);
    if (!normalized) return INVALID;
    const { data, error } = await supabase.rpc("resolve_referral_code", { p_code: normalized });
    if (error || !data) {
      if (error) console.error("Error resolving referral code:", error);
      return INVALID;
    }
    return data as ReferralCodeResolution;
  },

  /**
   * Attribute the signed-in user to the code's owner. Throws only on transport/RPC errors;
   * every business outcome comes back as { ok, status }.
   */
  async claim(code: string, source: ReferralSource): Promise<ReferralClaimResult> {
    const { data, error } = await supabase.rpc("claim_referral", {
      p_code: normalizeReferralCode(code),
      p_source: source,
    });
    if (error) throw error;
    return data as ReferralClaimResult;
  },
};
