// src/viewmodels/hooks/use.my.referral.code.ts
// Share-card state: the signed-in user's referral code + link, and Copy / Share actions.
// Copy is dependency-free (same approach as TeamRegisterModal): web uses the Clipboard API;
// native falls back to the share sheet, which offers "Copy".

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Share } from "react-native";
import { referralService } from "../../models/services/referral.service";
import { buildReferralLink, displayReferralLink } from "../../utils/referral";
import { useAuthStore } from "../stores/auth.store";

const SHARE_MESSAGE = (link: string, code: string) =>
  `Join me on Compete — find pool tournaments near you.\n${link}\n\nReferral code: ${code}`;

export function useMyReferralCode() {
  const profileId = useAuthStore((s) => s.profile?.id_auto ?? null);
  // Keyed by profile so a logout / account switch never shows the previous user's code.
  const [fetched, setFetched] = useState<{ profileId: number; code: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    referralService.getMyReferralCode().then((c) => {
      if (alive) setFetched({ profileId, code: c });
    });
    return () => {
      alive = false;
    };
  }, [profileId]);

  const code = profileId && fetched?.profileId === profileId ? fetched.code : null;
  const loading = !!profileId && fetched?.profileId !== profileId;

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const link = code ? buildReferralLink(code) : null;
  const displayLink = code ? displayReferralLink(code) : null;

  const share = useCallback(async () => {
    if (!code || !link) return;
    const message = SHARE_MESSAGE(link, code);
    if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: "Compete", text: message, url: link });
        return;
      } catch {
        return; // dismissed
      }
    }
    try {
      await Share.share({ message });
    } catch {
      /* dismissed */
    }
  }, [code, link]);

  const copyLink = useCallback(async () => {
    if (!link) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 2000);
        return;
      } catch {
        /* fall through to share */
      }
    }
    await share();
  }, [link, share]);

  return { code, link, displayLink, loading, copied, copyLink, share };
}
