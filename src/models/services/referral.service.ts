// src/models/services/referral.service.ts
// Referral attribution RPCs. Clients never read or write the referral tables directly —
// every operation goes through a SECURITY DEFINER function that derives the caller from auth.

import { supabase } from "../../lib/supabase";
import {
  ReferralClaimResult,
  ReferralCodeResolution,
  ReferralSource,
  ReferralVisitChannel,
  ReferralVisitEvent,
  ReferralVisitPlatform,
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

  // ── Funnel analytics (referral_visits) ─────────────────────────────────────────────────────
  // Supplemental only: these never throw and never affect attribution — claim() is the authority.

  /** Logs a Raw Click; returns the visit id, or null if untracked (invalid code / rate limit / error). */
  async logVisit(
    code: string,
    channel: ReferralVisitChannel,
    platform: ReferralVisitPlatform,
    campaign?: string | null,
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc("log_referral_visit", {
        p_code: normalizeReferralCode(code),
        p_channel: channel,
        p_platform: platform,
        p_campaign: campaign ?? null,
      });
      return error ? null : ((data as string | null) ?? null);
    } catch {
      return null;
    }
  },

  /** Marks App Open / Install on a visit (first time only). */
  async markVisit(visitId: string, event: ReferralVisitEvent): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc("mark_referral_visit", { p_visit_id: visitId, p_event: event });
      return !error && data === true;
    } catch {
      return false;
    }
  },

  /** After a successful claim: connect the caller's referral to the visit that brought them. */
  async linkVisit(visitId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc("link_referral_visit", { p_visit_id: visitId });
      return !error && data === true;
    } catch {
      return false;
    }
  },
};
