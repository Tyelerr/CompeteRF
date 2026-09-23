// src/models/types/referral.types.ts
// Referral attribution (Phase 1): who referred whom. No rewards.
// Server contract: supabase/migrations/20261002120000_referral_attribution.sql

export type ReferralSource = "link" | "manual";

/** Outcome of claim_referral — business results are returned, never thrown. */
export type ReferralClaimStatus =
  | "claimed"             // new attribution recorded
  | "already_claimed"     // already attributed to THIS code's owner (idempotent repeat)
  | "already_attributed"  // already has a different referrer — never switched
  | "invalid_code"
  | "self_referral"
  | "mutual_referral"
  | "window_expired"      // account older than the 7-day claim window
  | "not_authenticated"
  | "no_profile";

export interface ReferralClaimResult {
  ok: boolean;
  status: ReferralClaimStatus;
}

/** resolve_referral_code — the only referrer data the client ever receives. */
export interface ReferralCodeResolution {
  valid: boolean;
  code: string | null;
  /** Minimal display label, e.g. "Tyler H." */
  inviter: string | null;
}

/** A referral code carried from a /r link or the signup field until it is claimed. */
export interface PendingReferral {
  code: string;
  source: ReferralSource;
  savedAt: number; // epoch ms
  /** referral_visits id for funnel analytics (supplemental — never required for attribution). */
  visitId?: string | null;
}

/** Funnel analytics (referral_visits). Supplemental to claim_referral, never authoritative. */
export type ReferralVisitChannel = "web" | "app_link" | "install_referrer";
export type ReferralVisitPlatform = "ios" | "android" | "desktop" | "unknown";
export type ReferralVisitEvent = "app_open" | "install";
