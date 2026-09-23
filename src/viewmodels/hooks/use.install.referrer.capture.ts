// src/viewmodels/hooks/use.install.referrer.capture.ts
// ANDROID ONLY. On the first launch after install, reads the Google Play Install Referrer. If the
// install came through a Compete referral Play link ("ref_code=CODE&v=VISIT"), it:
//   • saves CODE as the pending referral (source "link") — the normal claim path
//     (usePendingReferralClaim → claim_referral) attributes it once the user has an account;
//   • marks Install on the visit (or logs an install_referrer visit if there was no web visit).
// Organic installs ("utm_source=google-play&utm_medium=organic") do nothing. Runs once per install
// (flag in AsyncStorage); a thrown error leaves the flag unset so the next launch retries.
// Never overwrites a referral the user already has pending. iOS has no equivalent signal.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { useEffect } from "react";
import { Platform } from "react-native";
import { isVisitId, pendingReferralService } from "../../models/services/pending-referral.service";
import { referralService } from "../../models/services/referral.service";
import { parseInstallReferrer } from "../../utils/referral";

const CHECKED_KEY = "installReferrerChecked:v1";

export function useInstallReferrerCapture() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      try {
        if (await AsyncStorage.getItem(CHECKED_KEY)) return;
        const parsed = parseInstallReferrer(await Application.getInstallReferrerAsync());
        if (parsed) {
          const existing = await pendingReferralService.get();
          let visit = isVisitId(parsed.visitId) ? parsed.visitId : null;
          if (!visit) visit = await referralService.logVisit(parsed.code, "install_referrer", "android");
          if (visit) await referralService.markVisit(visit, "install");
          if (!existing) await pendingReferralService.save(parsed.code, "link", visit);
        }
        await AsyncStorage.setItem(CHECKED_KEY, String(Date.now()));
      } catch (err) {
        console.warn("Install referrer check failed; will retry next launch:", err);
      }
    })();
  }, []);
}
