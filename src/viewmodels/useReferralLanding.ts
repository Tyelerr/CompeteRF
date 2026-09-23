// src/viewmodels/useReferralLanding.ts
// /r/[code] landing. Resolves the code (valid + "Invited by Tyler H."), then:
//   • logged out  → saves it as the pending referral (source "link") and offers
//                   Create Account / Log In / Get the App, with the code shown for manual entry;
//   • logged in   → claims it right away and reports the outcome (never replaces an existing
//                   referrer — the server refuses that).
// No automatic App Store bounce.

import { useEffect, useRef, useState } from "react";
import { pendingReferralService } from "../models/services/pending-referral.service";
import { referralService } from "../models/services/referral.service";
import { ReferralClaimStatus } from "../models/types/referral.types";
import { normalizeReferralCode } from "../utils/referral";
import { useAuthStore } from "./stores/auth.store";

export type ReferralLandingState = "loading" | "invalid" | "guest" | "claiming" | "claimed" | "not_claimed";

const CLAIM_MESSAGES: Record<ReferralClaimStatus, string> = {
  claimed: "You're connected! Thanks for joining through a friend.",
  already_claimed: "You're already connected through this invite.",
  already_attributed: "Your account is already connected to a referral.",
  invalid_code: "This invite link isn't valid anymore.",
  self_referral: "This is your own invite link — share it with friends!",
  mutual_referral: "This invite can't be used with your account.",
  window_expired: "Invite links are for new accounts. Thanks for already being part of Compete!",
  not_authenticated: "Please log in again to use this invite.",
  no_profile: "Finish creating your profile to use this invite.",
};

const RETRYABLE: ReferralClaimStatus[] = ["not_authenticated", "no_profile"];

export function useReferralLanding(rawCode: string | undefined) {
  const profileId = useAuthStore((s) => s.profile?.id_auto ?? null);
  const authLoading = useAuthStore((s) => s.isLoading);

  const code = normalizeReferralCode(rawCode ?? "");
  const [state, setState] = useState<ReferralLandingState>("loading");
  const [inviter, setInviter] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (authLoading || handled.current) return;
    handled.current = true;

    (async () => {
      const res = await referralService.resolveCode(code);
      if (!res.valid || !res.code) {
        setState("invalid");
        return;
      }
      setInviter(res.inviter);

      if (!profileId) {
        await pendingReferralService.save(res.code, "link");
        setState("guest");
        return;
      }

      setState("claiming");
      try {
        const result = await referralService.claim(res.code, "link");
        if (!RETRYABLE.includes(result.status)) await pendingReferralService.clear();
        setMessage(CLAIM_MESSAGES[result.status] ?? null);
        setState(result.ok ? "claimed" : "not_claimed");
      } catch {
        // Keep it pending — the background claim retries after the next profile load.
        await pendingReferralService.save(res.code, "link");
        setMessage("We couldn't connect your invite right now. We'll try again automatically.");
        setState("not_claimed");
      }
    })();
  }, [authLoading, profileId, code]);

  return { code, state, inviter, message, isLoggedIn: !!profileId };
}
