// src/utils/referral.ts
// Pure referral-code helpers shared by the /r landing page, the signup code field, the share
// card and the Android install-referrer capture. The server is authoritative
// (resolve_referral_code / claim_referral); these only normalize input and build links.

import { Platform } from "react-native";
import { APP_STORE_URL, PLAY_STORE_URL } from "../models/constants/app-stores";
import { ReferralVisitPlatform } from "../models/types/referral.types";

export const REFERRAL_LINK_BASE = "https://thecompeteapp.com/r/";

/**
 * PHASE B SWITCH. Leave false until Android + iOS builds containing the /r route are LIVE in the
 * stores. While false, "Open Compete" only routes to the stores (current store builds have no
 * /r route and would open to a not-found screen). When flipped (together with adding "/r/*" to
 * public/.well-known/apple-app-site-association): Android tries the installed app via an intent
 * link, and iOS pages carry the Smart App Banner.
 */
export const NATIVE_REFERRAL_LINKS_LIVE = false;

const ANDROID_PACKAGE = "com.thecompeteapp.competerf";
const IOS_APP_ID = "6759150538";

/** Display/storage form: trimmed, upper-case. Matching on the server is case-insensitive. */
export const normalizeReferralCode = (raw: string): string => raw.trim().toUpperCase();

/** Cheap client pre-check mirroring the server format (A-Z0-9, 3-16). */
export const isWellFormedReferralCode = (raw: string): boolean =>
  /^[A-Z0-9]{3,16}$/.test(normalizeReferralCode(raw));

export const buildReferralLink = (code: string, visitId?: string | null): string =>
  `${REFERRAL_LINK_BASE}${encodeURIComponent(normalizeReferralCode(code))}${visitId ? `?v=${encodeURIComponent(visitId)}` : ""}`;

/** Display form of the link without the scheme, e.g. "thecompeteapp.com/r/TYELERR". */
export const displayReferralLink = (code: string): string =>
  buildReferralLink(code).replace(/^https?:\/\//, "");

/**
 * Play Store listing carrying the referral through install: Google hands the `referrer` value back
 * to the app on first launch (Play Install Referrer) → "ref_code=CODE&v=VISIT".
 */
export const buildPlayStoreReferralUrl = (code: string, visitId?: string | null): string => {
  const referrer = `ref_code=${normalizeReferralCode(code)}${visitId ? `&v=${visitId}` : ""}`;
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
};

/**
 * PHASE B (Android Chrome): opens the installed app at /r/CODE via its App Link; if the app isn't
 * installed Chrome follows the fallback to the Play Store (with the install referrer). One tap, no
 * loops, no error dialogs.
 */
export const buildAndroidOpenAppUrl = (code: string, visitId?: string | null): string => {
  const path = `r/${encodeURIComponent(normalizeReferralCode(code))}${visitId ? `?v=${encodeURIComponent(visitId)}` : ""}`;
  const fallback = encodeURIComponent(buildPlayStoreReferralUrl(code, visitId));
  return `intent://thecompeteapp.com/${path}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
};

/** PHASE B (iOS Safari): Smart App Banner — Apple shows Open / Get natively (no error dialogs). */
export const smartAppBannerContent = (code: string, visitId?: string | null): string =>
  `app-id=${IOS_APP_ID}, app-argument=${buildReferralLink(code, visitId)}`;

export const APP_STORE_REFERRAL_URL = APP_STORE_URL;

/** Parses a Play install-referrer string ("ref_code=CODE&v=UUID&…"); organic installs → null. */
export const parseInstallReferrer = (raw: string | null | undefined): { code: string; visitId: string | null } | null => {
  if (!raw) return null;
  let code: string | null = null;
  let visitId: string | null = null;
  for (const part of raw.split("&")) {
    const [k, v = ""] = part.split("=");
    let value = v;
    try {
      value = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    if (k === "ref_code") code = value;
    if (k === "v") visitId = value;
  }
  if (!code || !isWellFormedReferralCode(code)) return null;
  return { code: normalizeReferralCode(code), visitId };
};

/**
 * A referral code from pasted text: a bare code ("tyelerr"), a referral link
 * ("thecompeteapp.com/r/TYELERR…"), or the landing page's copied message. Null if none found.
 */
export const extractReferralCode = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const fromLink = text.match(/\/r\/([A-Za-z0-9]{3,16})/);
  if (fromLink) return normalizeReferralCode(fromLink[1]);
  const trimmed = text.trim();
  if (/^[A-Za-z0-9]{3,16}$/.test(trimmed)) return normalizeReferralCode(trimmed);
  return null;
};

/** Coarse platform only (no user-agent string is ever stored). */
export const detectReferralPlatform = (): ReferralVisitPlatform => {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
};
