// src/viewmodels/hooks/use.my.referral.code.ts
// Share-card state: the signed-in user's referral code + invite link, and Copy / Share actions.
// Share = short branded copy + the smart invite link (thecompeteapp.com/invite/<CODE>); the link's
// Open Graph tags give Messages / iMessage / Slack / Discord / Facebook a branded preview card, so
// no image is attached (attaching one turns it into an image share and drops the link preview).
// The code is no longer in the share text — it stays visible / copyable on the card.
// Copy is dependency-free (same approach as TeamRegisterModal): web uses the Clipboard API;
// native falls back to the share sheet, which offers "Copy".

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Share } from "react-native";
import { referralService } from "../../models/services/referral.service";
import { INVITE_SHARE_TEXT, INVITE_SHARE_TITLE, buildReferralLink } from "../../utils/referral";
import { useAuthStore } from "../stores/auth.store";

export function useMyReferralCode() {
  const profileId = useAuthStore((s) => s.profile?.id_auto ?? null);
  // Keyed by profile so a logout / account switch never shows the previous user's code.
  const [fetched, setFetched] = useState<{ profileId: number; code: string | null } | null>(null);
  // Which value was just copied (web only) — drives the brief "Copied" feedback.
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
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

  const share = useCallback(async () => {
    if (!code || !link) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: INVITE_SHARE_TITLE, text: INVITE_SHARE_TEXT, url: link });
        return;
      } catch {
        return; // dismissed
      }
    }
    try {
      // iOS shares `url` as a real link (rich preview from the page's Open Graph tags) next to the
      // text. Android ignores `url`, so there the link ends the message.
      await Share.share(
        Platform.OS === "ios"
          ? { message: INVITE_SHARE_TEXT, url: link }
          : { message: `${INVITE_SHARE_TEXT}\n${link}`, title: INVITE_SHARE_TITLE },
        { subject: INVITE_SHARE_TITLE, dialogTitle: "Share Compete" },
      );
    } catch {
      /* dismissed */
    }
  }, [code, link]);

  const writeClipboard = useCallback(async (value: string, what: "link" | "code"): Promise<boolean> => {
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.clipboard) return false;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 2000);
      return true;
    } catch {
      return false;
    }
  }, []);

  const copyLink = useCallback(async () => {
    if (!link) return;
    if (await writeClipboard(link, "link")) return;
    await share(); // native / no Clipboard API: the share sheet offers "Copy"
  }, [link, share, writeClipboard]);

  /** Web only: copy just the code (tapping the code pill). */
  const copyCode = useCallback(async () => {
    if (code) await writeClipboard(code, "code");
  }, [code, writeClipboard]);

  return { code, link, loading, copied, copyLink, copyCode, share };
}
