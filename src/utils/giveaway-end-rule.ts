// src/utils/giveaway-end-rule.ts
// "End giveaway by" — one shared vocabulary for Create / Edit (both entry methods):
//   entries → ends when the entry capacity is reached
//   date    → ends on the end date (11:59 PM Arizona time); unlimited entries until then
//   both    → whichever happens first
// Server side: enter_wallet_giveaway closes at capacity immediately; the giveaway-end-sweep cron
// (every 5 min) ends anything past its date or at capacity. Unit-tested in
// src/utils/__tests__/giveaway-end-rule.test.ts.

import { arizonaEndOfDayISO, CalendarDateParts, sameCalendarDate } from "./arizona-time";

export type GiveawayEndType = "date" | "entries" | "both";

export const END_TYPE_OPTIONS: { value: GiveawayEndType; label: string }[] = [
  { value: "entries", label: "👥 Entry capacity" },
  { value: "date", label: "📅 End date" },
  { value: "both", label: "⚡ Both" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "December 1, 2026" from month/day/year form parts (month 1–12), or null if incomplete. */
export function formatEndDateParts(p: { month: string; day: string; year: string }): string | null {
  const m = parseInt(p.month, 10);
  const d = parseInt(p.day, 10);
  const y = parseInt(p.year, 10);
  if (!m || !d || !y || m < 1 || m > 12) return null;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * Plain-language summary of the selected ending rule, filled in with the current values when they
 * are set (placeholders otherwise). `isWallet` adds the per-user note for Giveaway Entries mode.
 */
export function describeEndRule(
  endType: GiveawayEndType,
  maxEntries: string | number | null | undefined,
  endDateLabel: string | null,
): string {
  const n = typeof maxEntries === "number" ? maxEntries : parseInt(String(maxEntries ?? ""), 10);
  const cap = Number.isFinite(n) && n > 0 ? `${n.toLocaleString("en-US")} ${n === 1 ? "entry is" : "entries are"}` : "the entry capacity is";
  const when = endDateLabel ? `${endDateLabel} at 11:59 PM (Arizona time)` : "the end date (11:59 PM Arizona time)";
  switch (endType) {
    case "entries":
      return `Ends as soon as ${cap} reached. No end date.`;
    case "date":
      return `Ends on ${when}. Unlimited entries until then.`;
    case "both":
    default:
      return `Ends when ${cap} reached or on ${when} — whichever happens first.`;
  }
}

/**
 * Edit Giveaway: the end_date to save for a date / both giveaway (Create and Edit share the
 * Arizona contract in src/utils/arizona-time.ts — the form shows the stored end_date's Arizona
 * calendar date; a chosen date means 11:59:59 PM Arizona time).
 *   • undefined  — don't write end_date: not date-based, or the same calendar date as loaded
 *                  (saving other fields never shifts the stored deadline);
 *   • string     — the new 11:59:59 PM Arizona value;
 *   • "invalid"  — incomplete, or not a real calendar date.
 */
export function endDateForSave(
  form: { end_type: GiveawayEndType; end_date: CalendarDateParts },
  original: { end_type: GiveawayEndType; end_date: CalendarDateParts },
): string | undefined | "invalid" {
  if (form.end_type !== "date" && form.end_type !== "both") return undefined;
  const wasDateBased = original.end_type === "date" || original.end_type === "both";
  if (wasDateBased && original.end_date.year && sameCalendarDate(form.end_date, original.end_date)) return undefined;
  return arizonaEndOfDayISO(form.end_date) ?? "invalid";
}
