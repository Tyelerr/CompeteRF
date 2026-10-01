// src/utils/giveaway-rules.ts
// Assembles the Official Giveaway Rules (copy lives ONLY in src/models/constants/giveaway-rules.ts)
// for one giveaway or for the public page, plus the small display helpers that must agree with the
// rules: Entry Limit, Ends, draw-odds labels. Pure — shared verbatim by web, iOS and Android.
// Unit-tested in src/utils/__tests__/giveaway-rules.test.ts.

import { GiveawayRulesSectionId, RULES_COPY } from "../models/constants/giveaway-rules";
import type { PublicReferralTerms } from "../models/types/earning-rules.types";
import { GiveawayEntryMode } from "../models/types/giveaway.types";
import { toArizonaWallClock } from "./arizona-time";

export interface RulesSection {
  id: GiveawayRulesSectionId;
  heading: string;
  body: string;
}

/** The fields of a giveaway the rules depend on. */
export interface GiveawayRulesSubject {
  entry_mode?: GiveawayEntryMode | null;
  per_user_max?: number | null;
  max_entries?: number | null;
  end_date?: string | null;
}

export type GiveawayEndCondition = "entries" | "date" | "both" | "none";

/** The end condition actually enforced (capacity and/or date), derived from the stored fields. */
export function endConditionOf(g: GiveawayRulesSubject): GiveawayEndCondition {
  const hasCap = (g.max_entries ?? 0) > 0;
  const hasDate = !!g.end_date && !isNaN(new Date(g.end_date).getTime());
  if (hasCap && hasDate) return "both";
  if (hasCap) return "entries";
  if (hasDate) return "date";
  return "none";
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** { date: "October 5, 2026", time: "11:59 PM" } — the stored end_date read in Arizona time. */
export function arizonaDateParts(iso: string): { date: string; time: string } | null {
  const az = toArizonaWallClock(iso);
  if (!az) return null;
  const hours12 = az.hours % 12 === 0 ? 12 : az.hours % 12;
  return {
    date: `${MONTH_NAMES[az.month - 1]} ${az.day}, ${az.year}`,
    time: `${hours12}:${String(az.minutes).padStart(2, "0")} ${az.hours < 12 ? "AM" : "PM"}`,
  };
}

/** "11:59 PM Arizona time on October 5, 2026" */
export function formatArizonaDeadline(iso: string): string | null {
  const p = arizonaDateParts(iso);
  return p ? `${p.time} Arizona time on ${p.date}` : null;
}

const entriesWord = (n: number) => `${n.toLocaleString("en-US")} total ${n === 1 ? "entry" : "entries"}`;

/** Detail-row value for "Entry Limit". */
export function entryLimitLabel(g: GiveawayRulesSubject): string {
  if (g.entry_mode === "wallet") {
    return g.per_user_max && g.per_user_max > 0 ? `Up to ${g.per_user_max} per person` : "Multiple per person";
  }
  return "1 per person";
}

/** Detail-row value for "Ends" (null when the giveaway has no end condition). */
export function endsLabel(g: GiveawayRulesSubject): string | null {
  const cond = endConditionOf(g);
  const cap = g.max_entries ?? 0;
  const p = g.end_date ? arizonaDateParts(g.end_date) : null;
  const when = p ? `${p.date}, ${p.time} (Arizona time)` : "";
  switch (cond) {
    case "entries":
      return `At ${entriesWord(cap)}`;
    case "date":
      return when;
    case "both":
      return `At ${entriesWord(cap)} or ${when}, whichever comes first`;
    default:
      return null;
  }
}

/** Sentence for this giveaway's own end condition inside the rules. */
export function endConditionSentence(g: GiveawayRulesSubject): string | null {
  const cond = endConditionOf(g);
  const cap = g.max_entries ?? 0;
  const deadline = g.end_date ? formatArizonaDeadline(g.end_date) : null;
  switch (cond) {
    case "entries":
      return `This giveaway ends as soon as ${entriesWord(cap)} have been received. It has no end date.`;
    case "date":
      return `This giveaway ends at ${deadline}. It has no entry capacity.`;
    case "both":
      return `This giveaway ends when ${entriesWord(cap)} have been received or at ${deadline}, whichever happens first.`;
    default:
      return null;
  }
}

/**
 * The Official Rules sections, numbered in order.
 *   giveaway = null  → the public page: every entry method and end condition.
 *   giveaway given   → that giveaway's entry method and its actual end condition.
 *   referralTerms    → the live public Earning Rules (get_public_referral_terms); null = unavailable,
 *                      in which case Referral Rewards is shown without amounts.
 */
export function buildOfficialRules(
  giveaway: GiveawayRulesSubject | null,
  referralTerms: PublicReferralTerms | null = null,
): RulesSection[] {
  const mode: GiveawayEntryMode | "all" = giveaway ? (giveaway.entry_mode === "wallet" ? "wallet" : "legacy_single") : "all";
  const showSingle = mode !== "wallet";
  const showWallet = mode !== "legacy_single";

  const howToEnter =
    mode === "all"
      ? [RULES_COPY.howToEnterCommon, "", RULES_COPY.howToEnterModes, "", `• ${RULES_COPY.howToEnterSingle}`, "", `• ${RULES_COPY.howToEnterWallet(null)}`].join("\n")
      : [RULES_COPY.howToEnterCommon, "", mode === "wallet" ? RULES_COPY.howToEnterWallet(giveaway?.per_user_max ?? null) : RULES_COPY.howToEnterSingle].join("\n");

  const ownEnd = giveaway ? endConditionSentence(giveaway) : null;
  const entryPeriod = [ownEnd ?? RULES_COPY.entryPeriodGeneral, RULES_COPY.entryPeriodLate].join(ownEnd ? " " : "\n\n");

  const odds = [showSingle ? RULES_COPY.oddsSingle : null, showWallet ? RULES_COPY.oddsWallet : null].filter(Boolean);
  const winnerSelection = [RULES_COPY.winnerSelection, "", ...odds.map((o) => (mode === "all" ? `• ${o}` : o))].join("\n");

  const numbered: { id: GiveawayRulesSectionId; title: string; body: string }[] = [];
  const add = (id: GiveawayRulesSectionId, title: string, body: string) => numbered.push({ id, title, body });
  add("eligibility", "Eligibility", RULES_COPY.eligibility);
  add("how-to-enter", "How to Enter", howToEnter);
  if (showWallet) add("entries", "Giveaway Entries", RULES_COPY.entries);
  if (showWallet) add("referrals", "Referral Rewards", RULES_COPY.referrals(referralTerms));
  add("entry-period", "Entry Period", entryPeriod);
  add("winner-selection", "Winner Selection and Odds", winnerSelection);
  add("notification", "Winner Notification", RULES_COPY.notification);
  add("prizes", "Prizes", RULES_COPY.prizes);
  add("identity", "Identity Verification", RULES_COPY.identity);
  if (showWallet) add("cancellation", "Cancellation", RULES_COPY.cancellation);
  add("general", "General Conditions", RULES_COPY.general);
  add("privacy", "Privacy", RULES_COPY.privacy);
  add("governing-law", "Governing Law", RULES_COPY.governingLaw);

  return [
    { id: "intro", heading: "", body: RULES_COPY.intro },
    { id: "sponsor", heading: "Sponsor", body: RULES_COPY.sponsor },
    { id: "platform", heading: "Platform Disclaimer", body: RULES_COPY.platform },
    ...numbered.map((s, i) => ({ id: s.id, heading: `${i + 1}. ${s.title}`, body: s.body })),
  ];
}

/** Admin draw-odds label: "1 in N" is only true when every entrant holds exactly one entry. */
export function drawOddsLabel(mode: GiveawayEntryMode | null | undefined, totalEntries: number): string {
  if (totalEntries <= 0) return "—";
  if (mode === "wallet") return "Weighted by entries";
  return `1 in ${totalEntries.toLocaleString("en-US")}`;
}

/** True when the rules for this giveaway (null = public page) include the Referral Rewards section. */
export const rulesShowReferralTerms = (giveaway: GiveawayRulesSubject | null): boolean =>
  !giveaway || giveaway.entry_mode === "wallet";
