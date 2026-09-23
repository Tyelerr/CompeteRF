// src/viewmodels/useReferralLanding.ts
// /r/[code] landing. Resolves the code (valid + "Invited by Tyler H."), records a Raw Click
// (analytics only — at most one per browser per code per 24 h), then:
//   • logged out → saves the pending referral (with its visit id) and offers the CTAs;
//   • logged in  → claims right away (claim_referral stays authoritative) and links the visit.
// "Open Compete" (phones only — never automatic, so no redirect loops):
//   • Android: Play Store carrying the install referrer (ref_code + visit id). PHASE B: an intent
//     link that opens the installed app, falling back to that same Play link.
//   • iOS: copies the code and opens the App Store ("paste it when you create your account").
//     PHASE B adds the Smart App Banner (rendered by the screen) for the installed app.
// Inside the app (link opened the app): marks App Open on the visit instead.

import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import { isVisitId, pendingReferralService } from "../models/services/pending-referral.service";
import { referralService } from "../models/services/referral.service";
import { ReferralClaimStatus, ReferralVisitPlatform } from "../models/types/referral.types";
import {
  APP_STORE_REFERRAL_URL,
  NATIVE_REFERRAL_LINKS_LIVE,
  buildAndroidOpenAppUrl,
  buildPlayStoreReferralUrl,
  detectReferralPlatform,
  normalizeReferralCode,
} from "../utils/referral";
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
const isNative = Platform.OS !== "web";

interface Params {
  rawCode?: string;
  /** Visit id passed along when a link opened the app (Phase B). */
  visitParam?: string;
  campaign?: string;
}

export function useReferralLanding({ rawCode, visitParam, campaign }: Params) {
  const profileId = useAuthStore((s) => s.profile?.id_auto ?? null);
  const authLoading = useAuthStore((s) => s.isLoading);

  const code = normalizeReferralCode(rawCode ?? "");
  const [platform] = useState<ReferralVisitPlatform>(() => detectReferralPlatform());
  const [state, setState] = useState<ReferralLandingState>("loading");
  const [inviter, setInviter] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
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

      // ── Raw Click / App Open (analytics only; failures are ignored) ─────────────────────
      let visit: string | null = null;
      if (isNative) {
        visit = isVisitId(visitParam) ? visitParam : await referralService.logVisit(res.code, "app_link", platform, campaign);
        if (visit) referralService.markVisit(visit, "app_open");
      } else {
        visit = await pendingReferralService.getRecentVisit(res.code);
        if (!visit) {
          visit = await referralService.logVisit(res.code, "web", platform, campaign);
          if (visit) await pendingReferralService.rememberVisit(res.code, visit);
        }
      }
      setVisitId(visit);

      if (!profileId) {
        await pendingReferralService.save(res.code, "link", visit);
        setState("guest");
        return;
      }

      setState("claiming");
      try {
        const result = await referralService.claim(res.code, "link");
        if (!RETRYABLE.includes(result.status)) await pendingReferralService.clear();
        if (result.ok && visit) referralService.linkVisit(visit);
        setMessage(CLAIM_MESSAGES[result.status] ?? null);
        setState(result.ok ? "claimed" : "not_claimed");
      } catch {
        // Keep it pending — the background claim retries after the next profile load.
        await pendingReferralService.save(res.code, "link", visit);
        setMessage("We couldn't connect your invite right now. We'll try again automatically.");
        setState("not_claimed");
      }
    })();
  }, [authLoading, profileId, code, platform, visitParam, campaign]);

  /** Phone web "Open Compete" — one explicit tap, never an automatic redirect. */
  const openCompete = useCallback(async () => {
    if (platform === "android") {
      const url = NATIVE_REFERRAL_LINKS_LIVE ? buildAndroidOpenAppUrl(code, visitId) : buildPlayStoreReferralUrl(code, visitId);
      Linking.openURL(url).catch(() => {});
      return;
    }
    if (platform === "ios") {
      let copied = false;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(code);
          copied = true;
        }
      } catch {
        /* clipboard blocked — the code stays visible on the page */
      }
      setCopiedNotice(
        copied
          ? `Your referral code ${code} was copied. Paste it when you create your account.`
          : `Enter referral code ${code} when you create your account.`,
      );
      Linking.openURL(APP_STORE_REFERRAL_URL).catch(() => {});
    }
  }, [platform, code, visitId]);

  return {
    code,
    state,
    inviter,
    message,
    visitId,
    platform,
    isLoggedIn: !!profileId,
    openCompete,
    copiedNotice,
    showSmartBanner: NATIVE_REFERRAL_LINKS_LIVE && !isNative && platform === "ios",
  };
}
