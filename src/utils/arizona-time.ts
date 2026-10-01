// src/utils/arizona-time.ts
// Giveaway end dates are calendar dates in Arizona time. Arizona (America/Phoenix) does not
// observe DST, so it is always UTC−7 — all conversions here are fixed-offset arithmetic on UTC
// fields, never the device/browser time zone and never Intl (consistent on web, iOS and Android).
//
// Contract for a date-based giveaway: end_date (timestamptz) = 11:59:59 PM Arizona time on the
// selected calendar date, written as "YYYY-MM-DDT23:59:59-07:00". The server only compares
// instants (end_date <= now() in enter_wallet_giveaway, publish_giveaway and the
// giveaway-end-sweep cron), so this one value drives entry cut-off and the automatic end.
// Unit-tested in src/utils/__tests__/arizona-time.test.ts.

export const ARIZONA_UTC_OFFSET = "-07:00";
const ARIZONA_OFFSET_MS = -7 * 60 * 60 * 1000;

export interface CalendarDateParts {
  /** "1"–"12" (no padding — matches the form dropdown values). */
  month: string;
  /** "1"–"31" */
  day: string;
  /** "2026" */
  year: string;
}

export interface ArizonaWallClock {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** The Arizona wall-clock reading of an instant, or null for an unparseable value. */
export function toArizonaWallClock(iso: string): ArizonaWallClock | null {
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return null;
  const az = new Date(ms + ARIZONA_OFFSET_MS);
  return {
    year: az.getUTCFullYear(),
    month: az.getUTCMonth() + 1,
    day: az.getUTCDate(),
    hours: az.getUTCHours(),
    minutes: az.getUTCMinutes(),
    seconds: az.getUTCSeconds(),
  };
}

/** True when y-m-d is a real calendar date (rejects e.g. February 31). */
export function isValidCalendarDate(parts: CalendarDateParts): boolean {
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1970 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The stored end_date for a selected date: 11:59:59 PM Arizona time. Null when incomplete/invalid. */
export function arizonaEndOfDayISO(parts: CalendarDateParts): string | null {
  if (!parts.month || !parts.day || !parts.year || !isValidCalendarDate(parts)) return null;
  const mm = String(Number(parts.month)).padStart(2, "0");
  const dd = String(Number(parts.day)).padStart(2, "0");
  return `${Number(parts.year)}-${mm}-${dd}T23:59:59${ARIZONA_UTC_OFFSET}`;
}

/** The Arizona calendar date of a stored end_date, as form parts (empty parts if missing/invalid). */
export function arizonaDatePartsFromISO(iso: string | null | undefined): CalendarDateParts {
  const az = iso ? toArizonaWallClock(iso) : null;
  if (!az) return { month: "", day: "", year: "" };
  return { month: String(az.month), day: String(az.day), year: String(az.year) };
}

/** True when two date-part sets name the same calendar date ("05" == "5"). */
export function sameCalendarDate(a: CalendarDateParts, b: CalendarDateParts): boolean {
  return Number(a.year) === Number(b.year) && Number(a.month) === Number(b.month) && Number(a.day) === Number(b.day);
}
