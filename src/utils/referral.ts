// src/utils/referral.ts
// Pure referral-code helpers shared by the /r landing page, the signup code field and the
// share card. The server is authoritative (resolve_referral_code / claim_referral); these only
// normalize input and build links.

export const REFERRAL_LINK_BASE = "https://thecompeteapp.com/r/";

/** Display/storage form: trimmed, upper-case. Matching on the server is case-insensitive. */
export const normalizeReferralCode = (raw: string): string => raw.trim().toUpperCase();

/** Cheap client pre-check mirroring the server format (A-Z0-9, 3-16). */
export const isWellFormedReferralCode = (raw: string): boolean =>
  /^[A-Z0-9]{3,16}$/.test(normalizeReferralCode(raw));

export const buildReferralLink = (code: string): string =>
  `${REFERRAL_LINK_BASE}${encodeURIComponent(normalizeReferralCode(code))}`;

/** Display form of the link without the scheme, e.g. "thecompeteapp.com/r/TYELERR". */
export const displayReferralLink = (code: string): string =>
  buildReferralLink(code).replace(/^https?:\/\//, "");
