// src/utils/schedule.ts
// Shared, timezone-aware "is this tournament's saved schedule stale?" check. A
// tournament that hasn't started yet but whose scheduled date/time is already in the
// past (in ITS OWN timezone) must be corrected by the TD before it can start. This
// is the SINGLE source of truth for that rule — every start/progression path calls it
// so there is no bypass. It never mutates the schedule; it only reports.

export const SCHEDULE_STALE_MESSAGE =
  "Scheduled start time has passed. Update the tournament date or start time before continuing.";

interface SchedulableTournament {
  tournament_date?: string | null; // "YYYY-MM-DD"
  start_time?: string | null; // "HH:MM" (24h)
  timezone?: string | null; // IANA, e.g. "America/Phoenix"
  live_state?: string | null; // "not_started" | "in_progress" | "finished"
  status?: string | null; // "draft" | "registration_open" | "completed" | …
}

// The current wall-clock parts in a given IANA timezone (device local on failure).
// We compare wall-clock-in-tz vs wall-clock-in-tz — no UTC offset math, no date-only
// UTC parsing — so America/Phoenix is compared against Phoenix time, not UTC.
const zonedNowParts = (
  timezone?: string | null,
): { y: number; mo: number; d: number; hh: number; mm: number } => {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    let hh = parseInt(get("hour"), 10);
    if (hh === 24) hh = 0; // some engines emit "24" for midnight
    return {
      y: parseInt(get("year"), 10),
      mo: parseInt(get("month"), 10),
      d: parseInt(get("day"), 10),
      hh,
      mm: parseInt(get("minute"), 10),
    };
  } catch {
    return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate(), hh: now.getHours(), mm: now.getMinutes() };
  }
};

// A single monotonic key for a wall-clock instant, so comparison is a plain <.
const key = (y: number, mo: number, d: number, hh: number, mm: number): number =>
  ((y * 100 + mo) * 100 + d) * 10000 + hh * 100 + mm;

// Is the saved schedule (combined date + time, in the tournament's timezone) before
// now? Returns false when no date is set (nothing to compare — a missing date is a
// separate "required field" concern, not a stale one).
export const isScheduledInPast = (
  dateStr?: string | null,
  timeStr?: string | null,
  timezone?: string | null,
): boolean => {
  if (!dateStr) return false;
  const [y, mo, d] = dateStr.split("-").map(Number);
  if (!y || !mo || !d) return false;
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const now = zonedNowParts(timezone);
  return (
    key(y, mo, d, hh || 0, mm || 0) < key(now.y, now.mo, now.d, now.hh, now.mm)
  );
};

// Only PRE-START tournaments are gated. Running (in_progress), paused-live (still
// in_progress), finished, and completed tournaments are never touched.
export const isPreStartState = (
  liveState?: string | null,
  status?: string | null,
): boolean =>
  liveState !== "in_progress" && liveState !== "finished" && status !== "completed";

// THE gate: true when a not-yet-started tournament's saved schedule is in the past.
export const isScheduleStale = (t: SchedulableTournament | null | undefined): boolean => {
  if (!t) return false;
  if (!isPreStartState(t.live_state, t.status)) return false;
  return isScheduledInPast(t.tournament_date, t.start_time, t.timezone);
};

// Convenience for start paths: returns the error message when blocked, else null.
export const scheduleStaleError = (
  t: SchedulableTournament | null | undefined,
): string | null => (isScheduleStale(t) ? SCHEDULE_STALE_MESSAGE : null);
