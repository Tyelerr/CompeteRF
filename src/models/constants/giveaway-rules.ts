// src/models/constants/giveaway-rules.ts
// THE single source of the Official Giveaway Rules copy. Rendered by the giveaway detail modal,
// the entry modal (both web + native) and the public page /legal/giveaway-rules. Assembled per
// giveaway by buildOfficialRules() in src/utils/giveaway-rules.ts — never copy this text into a
// component. A giveaway's own rules_text is shown AFTER these sections as "Additional Rules"; it
// never replaces them.
//
// Sections marked "unchanged" carry the previous wording verbatim (taken from the entry-modal
// copy, the version users agreed to) — they are pending separate legal review and must not be
// edited as part of product work.
//
// TODO(legal-review): Giveaway Entries giveaways can only be entered with earned entries
// (referrals / milestone bonuses / admin grants). Whether that model needs an alternate free
// method of entry, or raises a "consideration" question, is with counsel. Do NOT add AMOE wording
// here until it is approved.
// TODO(legal-review): age-of-majority states, US-residency verification, state exclusions /
// registration, tax reporting, winner publicity, governing law and the 7-day claim window
// (enforced manually by admins via Redraw, not server-side) are open legal questions.

import type { PublicReferralTerms } from "../types/earning-rules.types";

export const GIVEAWAY_RULES_TITLE = "Official Giveaway Rules";
/** Bump whenever the rules text below changes. */
export const GIVEAWAY_RULES_LAST_UPDATED = "October 1, 2026";
export const GIVEAWAY_RULES_PATH = "/legal/giveaway-rules";

export const GIVEAWAY_SPONSOR = {
  name: "Compete Tournaments LLC",
  location: "Phoenix, Arizona",
} as const;

/**
 * Referral reward AMOUNTS AND LIMITS are never hardcoded here: they are the live Earning Rules, read
 * through the public read-only RPC get_public_referral_terms() (migration 20261016120000) and passed
 * in as PublicReferralTerms. A Super Admin change shows up without an app release. null = not
 * available (loading / RPC missing) → the generic wording below is shown without numbers.
 */

/** Section ids double as deep-link targets: /legal/giveaway-rules?section=<id>. */
export type GiveawayRulesSectionId =
  | "intro"
  | "sponsor"
  | "platform"
  | "eligibility"
  | "how-to-enter"
  | "entries"
  | "referrals"
  | "entry-period"
  | "winner-selection"
  | "notification"
  | "prizes"
  | "identity"
  | "cancellation"
  | "general"
  | "privacy"
  | "governing-law";

const BULLET = "•";

export const RULES_COPY = {
  // unchanged
  intro:
    "NO PURCHASE NECESSARY TO ENTER OR WIN. A purchase or payment of any kind will not increase your chances of winning. Void where prohibited by law.",

  sponsor: `Giveaways in the Compete app are sponsored and administered by ${GIVEAWAY_SPONSOR.name}, ${GIVEAWAY_SPONSOR.location} (“Compete”). Apple Inc. and Google LLC are not sponsors of the giveaway.`,

  // unchanged
  platform:
    "This promotion is in no way sponsored, endorsed, administered by, or associated with Apple Inc. or Google LLC. By entering, participants agree to release Apple and Google from any responsibility related to this promotion.",

  // unchanged
  eligibility:
    "Giveaways hosted on the Compete app are open to legal residents of the United States who are 18 years of age or older at the time of entry. Employees, officers, and directors of Compete and its affiliates, and their immediate family members, are not eligible to participate. Void where prohibited or restricted by law.",

  howToEnterCommon:
    "No purchase necessary. To enter a giveaway, you must have a registered Compete account in good standing. Complete the entry form with your full legal name (as it appears on your government-issued ID), date of birth, email address, and phone number. All information must be accurate and truthful.",
  howToEnterModes: "Each giveaway listing shows its entry method:",
  howToEnterSingle:
    "Single Free Entry giveaways: limit one (1) entry per person per giveaway. Multiple entries, duplicate accounts, or false or fraudulent information will result in disqualification.",
  howToEnterWallet: (perUserMax: number | null) =>
    `Giveaway Entries giveaways: you choose how many of your Giveaway Entries to allocate to the giveaway, up to ${
      perUserMax ? `this giveaway’s per-person maximum of ${perUserMax}` : "the giveaway’s per-person maximum shown on the listing"
    } and subject to its total entry capacity, if any. Each allocated Giveaway Entry is one entry in the drawing. Allocated entries are committed to that giveaway and cannot be withdrawn or moved to another giveaway, except that they are returned if the giveaway is cancelled before a winner is drawn. Duplicate accounts or false or fraudulent information will result in disqualification.`,

  entries: [
    "Giveaway Entries are promotional chances used to enter Giveaway Entries giveaways. They are not money and have no cash value. They cannot be bought, and they cannot be sold, transferred, or exchanged between users. Giveaway Entries are tied to the Compete account that holds them.",
    "",
    `${BULLET} Your Giveaway Entries balance shows the entries you have not used yet. Entries you allocate to a giveaway leave your balance and are committed to that giveaway.`,
    `${BULLET} Unused Giveaway Entries in your balance do not expire under the current program.`,
    `${BULLET} You can earn Giveaway Entries through Compete programs, such as referrals and referral milestone bonuses (see Referral Rewards).`,
    `${BULLET} Giveaway Entries can be used in any eligible Giveaway Entries giveaway. Each giveaway may have its own per-person maximum and total entry capacity.`,
    `${BULLET} Giveaway Entries obtained through fraud, self-referral, duplicate accounts, or other violations of these Official Rules or the Compete Terms of Service may be removed.`,
    `${BULLET} Deleting your Compete account forfeits any unused Giveaway Entries balance.`,
    `${BULLET} If a Giveaway Entries giveaway is cancelled before a winner is drawn, the entries allocated to it are returned to each entrant’s balance.`,
  ].join("\n"),

  referrals: (t: PublicReferralTerms | null) => {
    const lines = [
      "Compete may award Giveaway Entries for referrals under the referral reward terms in effect when a referral is claimed. A referral qualifies only if the new user joins Compete through your invite link or referral code and the invite is claimed within the attribution window after the new account is created. Each account can be referred only once, and you cannot refer yourself.",
      "",
      "Current referral rewards:",
      "",
      ...currentReferralLines(t),
      "",
      `${BULLET} Referrals may be reviewed for abuse. Giveaway Entries earned through fraud, self-referral, duplicate accounts, or other rule violations may be removed.`,
      `${BULLET} Compete may change referral reward amounts and limits at any time. Changes apply to referrals claimed afterward and do not change entries already issued.`,
    ];
    return lines.join("\n");
  },

  entryPeriodGeneral: [
    "Each giveaway listing shows how that giveaway ends:",
    "",
    `${BULLET} By entry capacity — the giveaway ends as soon as its total entry capacity is reached.`,
    `${BULLET} By end date — the giveaway ends at the end date and time shown on the listing (Arizona time).`,
    `${BULLET} By both — the giveaway ends when its capacity is reached or at its end date and time, whichever happens first.`,
  ].join("\n"),
  entryPeriodLate: "Entries received after a giveaway ends will not be accepted.",

  winnerSelection:
    "Winners are selected at random from all eligible entries received during the entry period. The random drawing is conducted by Compete.",
  oddsSingle:
    "Single Free Entry giveaways: each eligible entrant has one entry, and therefore one chance to win. The odds of winning depend on the number of eligible entries received.",
  oddsWallet:
    "Giveaway Entries giveaways: each allocated Giveaway Entry is one chance to win. Your odds of winning equal the number of your eligible entries divided by the total number of eligible entries in that giveaway.",

  // 7-day window: previous wording kept; see TODO(legal-review) above.
  notification:
    "The winner will be notified through the Compete app and/or the email address or phone number provided at the time of entry. The winner must respond within seven (7) days of notification to claim their prize. If the winner does not respond within that time, is found ineligible or disqualified, or does not satisfy the claim requirements in these Official Rules (including identity verification), the prize may be forfeited and an alternate winner may be selected from the remaining eligible entries.",

  // unchanged
  prizes:
    "The prize for each giveaway is described on the giveaway listing page. Prize values are approximate. Prizes are non-transferable and cannot be exchanged for cash or other items. Compete reserves the right to substitute a prize of equal or greater value. Winners are solely responsible for any applicable taxes, fees, or other costs associated with the prize.",

  // unchanged
  identity:
    "Winners may be required to present a valid government-issued photo ID to verify their identity and age before receiving their prize. The name on the ID must match the name provided at the time of entry. Failure to verify identity may result in forfeiture of the prize.",

  cancellation:
    "If a Giveaway Entries giveaway is cancelled before a winner is drawn, no winner is drawn and all Giveaway Entries allocated to it are returned to each entrant’s Giveaway Entries balance.",

  // unchanged
  general:
    "By entering a giveaway, you agree to be bound by these Official Rules and the decisions of Compete, which are final and binding. Compete reserves the right to cancel, suspend, or modify any giveaway at any time for any reason.",

  // unchanged
  privacy:
    "Information collected during giveaway entry is subject to the Compete Privacy Policy. Your information will be used for giveaway administration, winner notification, and prize fulfillment. Your information will not be sold to third parties.",

  // unchanged
  governingLaw:
    "These Official Rules are governed by the laws of the United States and the state in which Compete operates, without regard to conflict of law provisions.",
} as const;

/** "a, b, c, and d" */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const entriesText = (n: number) => `+${n} Giveaway ${n === 1 ? "Entry" : "Entries"}`;

/** The "Current referral rewards" bullets for the live terms (see RULES_COPY.referrals). */
function currentReferralLines(t: PublicReferralTerms | null): string[] {
  if (!t) {
    return [`${BULLET} The current reward amounts and limits are not available right now. Please check back later.`];
  }
  if (!t.referral_rewards_enabled) {
    return [`${BULLET} Referral rewards are currently paused. Referrals claimed while rewards are paused do not earn Giveaway Entries.`];
  }
  const lines: string[] = [];
  const days = t.attribution_window_days;
  lines.push(`${BULLET} Attribution window: the invite must be claimed within ${days} ${days === 1 ? "day" : "days"} after the new account is created.`);
  const referrerPaid = t.referrer_reward > 0;
  if (referrerPaid && t.monthly_referrer_cap > 0) {
    lines.push(`${BULLET} You (the referrer) receive ${entriesText(t.referrer_reward)} for each qualifying referral, up to ${t.monthly_referrer_cap} per-referral ${t.monthly_referrer_cap === 1 ? "reward" : "rewards"} per calendar month (Arizona time). Referrals beyond that limit still count toward milestone bonuses.`);
  } else if (referrerPaid) {
    lines.push(`${BULLET} Per-referral rewards to referrers are not currently being issued. Qualifying referrals still count toward milestone bonuses.`);
  } else {
    lines.push(`${BULLET} Referrers do not currently receive a per-referral reward.`);
  }
  lines.push(
    t.referred_reward > 0
      ? `${BULLET} The new user receives ${entriesText(t.referred_reward)}.`
      : `${BULLET} New users do not currently receive a referral reward.`,
  );
  // Milestones count referrals whose referrer reward was issued or capped, so they apply only
  // while the referrer reward is on (mirrors _referral_issue_signup_reward).
  const ms = referrerPaid ? t.milestones.filter((m) => m.bonus > 0) : [];
  if (ms.length > 0) {
    const sameBonus = ms.every((m) => m.bonus === ms[0].bonus);
    lines.push(
      sameBonus
        ? `${BULLET} Milestone bonuses: ${entriesText(ms[0].bonus)} each time you reach ${listJoin(ms.map((m) => String(m.threshold)))} successful referrals. Each milestone is awarded once.`
        : `${BULLET} Milestone bonuses: ${ms.map((m) => `${entriesText(m.bonus)} at ${m.threshold} successful referrals`).join("; ")}. Each milestone is awarded once.`,
    );
  }
  return lines;
}

/**
 * Short line for the Refer Friends card, from the same live terms as the rules. Null when there is
 * nothing to promise (terms unavailable, rewards paused, or no reward for either side).
 * Shown only while REFERRAL_REWARDS_LIVE (src/utils/referral.ts) is on.
 */
export function referralCardNote(t: PublicReferralTerms | null): string | null {
  if (!t || !t.referral_rewards_enabled) return null;
  const mine = t.referrer_reward > 0 && t.monthly_referrer_cap > 0 ? t.referrer_reward : 0;
  const theirs = t.referred_reward;
  if (mine > 0 && mine === theirs) return `When a friend joins with your invite, you each get ${entriesText(mine)}. Limits apply.`;
  if (mine > 0 && theirs > 0) return `When a friend joins with your invite, you get ${entriesText(mine)} and they get ${entriesText(theirs)}. Limits apply.`;
  if (mine > 0) return `Get ${entriesText(mine)} when a friend joins with your invite. Limits apply.`;
  if (theirs > 0) return `Friends who join with your invite get ${entriesText(theirs)}. Limits apply.`;
  return null;
}
