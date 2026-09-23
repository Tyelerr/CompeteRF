// src/viewmodels/hooks/use.pending.referral.claim.ts
// The single background claim path. Once a profile is loaded, any pending referral (from a /r
// link or the signup code field) is sent to claim_referral exactly once, then cleared on every
// final outcome. Transient outcomes (no session / profile yet, network error) keep it for the
// next attempt; it still expires after 30 days. The server enforces every rule — including the
// 7-day window, so an old account that logs in after clicking a link is simply refused.
// Mounted once in app/(tabs)/_layout.tsx.

import { useEffect, useRef } from "react";
import { pendingReferralService } from "../../models/services/pending-referral.service";
import { referralService } from "../../models/services/referral.service";
import { ReferralClaimStatus } from "../../models/types/referral.types";
import { useAuthStore } from "../stores/auth.store";

const RETRYABLE: ReferralClaimStatus[] = ["not_authenticated", "no_profile"];

export function usePendingReferralClaim() {
  const profileId = useAuthStore((s) => s.profile?.id_auto ?? null);
  const attemptedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!profileId || attemptedFor.current === profileId) return;
    attemptedFor.current = profileId;

    (async () => {
      const pending = await pendingReferralService.get();
      if (!pending) return;
      try {
        const result = await referralService.claim(pending.code, pending.source);
        if (!RETRYABLE.includes(result.status)) {
          await pendingReferralService.clear();
        } else {
          attemptedFor.current = null;
        }
      } catch (err) {
        console.warn("Pending referral claim failed; will retry later:", err);
        attemptedFor.current = null;
      }
    })();
  }, [profileId]);
}
