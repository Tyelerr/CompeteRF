// src/utils/check-in-timer.ts
// The match check-in timer: how long an ASSIGNED match has been waiting to actually start.
//
// Model (all derived from server-owned timestamps — nothing here needs a screen to stay open):
//   • starts at matchState[match].assignedAt — never at push delivery, app open or Check In
//   • keeps running while the match is assigned, waiting, or checked in but not started
//   • STOPS at Start Match (status in_progress) and at completion — Check In never stops it,
//     because tapping Check In does not prove anyone is at the table
//   • thresholds are tournament settings, optionally pushed out for ONE assignment by a TD
//     "Extend Time" (extraMinutes), which never changes the tournament defaults
//
// Pure: no React, no clock of its own. The UI re-renders on its own ticker and passes `now`.
import { MatchLiveState, TournamentLiveSettings } from "../models/types/tournament-settings.types";

export interface CheckInSettings {
  /** When off, check-in is informational: no warnings gate Start Match. */
  required: boolean;
  /** Amber "⚠ Not Checked In" / "⚠ Match Not Started" after this many minutes. */
  warnAfterMinutes: number;
  /** Red "🔴 Forfeit Review" (a TD decision, never automatic) after this many minutes. */
  forfeitReviewAfterMinutes: number;
}

export const CHECK_IN_DEFAULTS: CheckInSettings = {
  required: false,
  warnAfterMinutes: 5,
  forfeitReviewAfterMinutes: 10,
};

export const CHECK_IN_LIMITS = { minMinutes: 1, maxMinutes: 120 } as const;

const clampMinutes = (v: unknown, fallback: number): number => {
  // NOTE: Number(null) and Number("") are 0, which would silently clamp to the minimum instead of
  // falling back — so only a real number (or a numeric string) counts as "set".
  if (v == null || v === "" || typeof v === "boolean") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(CHECK_IN_LIMITS.maxMinutes, Math.max(CHECK_IN_LIMITS.minMinutes, Math.round(n)));
};

/** Read + clamp the tournament's settings (live_settings.checkIn), falling back to the defaults. */
export const readCheckInSettings = (ls: TournamentLiveSettings | null | undefined): CheckInSettings => {
  const raw = (ls as { checkIn?: Partial<CheckInSettings> } | null | undefined)?.checkIn;
  const warn = clampMinutes(raw?.warnAfterMinutes, CHECK_IN_DEFAULTS.warnAfterMinutes);
  const review = clampMinutes(raw?.forfeitReviewAfterMinutes, CHECK_IN_DEFAULTS.forfeitReviewAfterMinutes);
  return {
    required: raw?.required === true,
    warnAfterMinutes: warn,
    // Forfeit Review can never come before the warning.
    forfeitReviewAfterMinutes: Math.max(review, warn),
  };
};

/** Validation for the Settings form — returns the problems, empty when fine. */
export const validateCheckInSettings = (input: Partial<CheckInSettings>): string[] => {
  const errors: string[] = [];
  const inRange = (v: unknown) =>
    Number.isFinite(Number(v)) &&
    Number(v) >= CHECK_IN_LIMITS.minMinutes &&
    Number(v) <= CHECK_IN_LIMITS.maxMinutes;
  if (input.warnAfterMinutes != null && !inRange(input.warnAfterMinutes))
    errors.push(`Warning must be ${CHECK_IN_LIMITS.minMinutes}–${CHECK_IN_LIMITS.maxMinutes} minutes.`);
  if (input.forfeitReviewAfterMinutes != null && !inRange(input.forfeitReviewAfterMinutes))
    errors.push(`Forfeit Review must be ${CHECK_IN_LIMITS.minMinutes}–${CHECK_IN_LIMITS.maxMinutes} minutes.`);
  if (
    input.warnAfterMinutes != null &&
    input.forfeitReviewAfterMinutes != null &&
    Number(input.forfeitReviewAfterMinutes) < Number(input.warnAfterMinutes)
  )
    errors.push("Forfeit Review must be at or after the warning.");
  return errors;
};

export type CheckInPhase =
  | "inactive" // no current assignment, or the match is started/finished — no timer
  | "waiting" // running, below the warning threshold
  | "warn" // past the warning threshold
  | "review"; // past the Forfeit Review threshold (a TD decision, never automatic)

export interface CheckInTimerState {
  phase: CheckInPhase;
  /** Milliseconds since assignedAt (0 when inactive). */
  elapsedMs: number;
  /** mm:ss for the compact display. */
  elapsed: string;
  /** "Not Checked In" (someone is missing) vs "Match Not Started" (both in, nobody started). */
  reason: "not_checked_in" | "not_started" | null;
  /** Compact label for the card, e.g. "3:42" · "⚠ Not Checked In · 6:12" · "🔴 Forfeit Review · 10:00". */
  label: string;
  /** Extra minutes a TD granted for THIS assignment (0 when none). */
  extendedMinutes: number;
  /** When the review threshold is (or was) reached — the server alert uses the same instant. */
  reviewAt: number | null;
}

export const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * The timer for ONE assignment. `bothCheckedIn` is "both sides are present" — a player tap or a
 * TD manual mark; the caller decides that from match_player_status.
 */
export const computeCheckInTimer = (args: {
  match: Pick<MatchLiveState, "assignedAt" | "status" | "tableId"> | null | undefined;
  bothCheckedIn: boolean;
  settings: CheckInSettings;
  /** TD "Extend Time" for this assignment only (minutes). */
  extendedMinutes?: number | null;
  now: number;
}): CheckInTimerState => {
  const idle: CheckInTimerState = {
    phase: "inactive", elapsedMs: 0, elapsed: "0:00", reason: null, label: "", extendedMinutes: 0, reviewAt: null,
  };
  const m = args.match;
  const assignedAt = m?.assignedAt ? Date.parse(m.assignedAt) : NaN;
  // No assignment, or the match already started / finished → the timer is over.
  if (!m || m.tableId == null || !Number.isFinite(assignedAt)) return idle;
  if (m.status === "in_progress" || m.status === "completed") return idle;

  const extendedMinutes = Math.max(0, Math.round(Number(args.extendedMinutes ?? 0)) || 0);
  const extraMs = extendedMinutes * 60_000;
  const elapsedMs = Math.max(0, args.now - assignedAt);
  const elapsed = formatElapsed(elapsedMs);
  const warnAt = assignedAt + args.settings.warnAfterMinutes * 60_000 + extraMs;
  const reviewAt = assignedAt + args.settings.forfeitReviewAfterMinutes * 60_000 + extraMs;
  const reason: "not_checked_in" | "not_started" = args.bothCheckedIn ? "not_started" : "not_checked_in";
  const reasonText = reason === "not_checked_in" ? "Not Checked In" : "Match Not Started";

  if (args.now >= reviewAt) {
    return { phase: "review", elapsedMs, elapsed, reason, label: `🔴 Forfeit Review · ${elapsed}`, extendedMinutes, reviewAt };
  }
  if (args.now >= warnAt) {
    return { phase: "warn", elapsedMs, elapsed, reason, label: `⚠ ${reasonText} · ${elapsed}`, extendedMinutes, reviewAt };
  }
  return { phase: "waiting", elapsedMs, elapsed, reason: null, label: elapsed, extendedMinutes, reviewAt };
};

/**
 * May this player press Start Match? Check-in completeness only gates it when the TD turned
 * "Require Match Check-In" on; a manager is never blocked (handled by the caller).
 */
export const canPlayerStart = (args: {
  match: Pick<MatchLiveState, "status" | "tableId"> | null | undefined;
  bothCheckedIn: boolean;
  settings: CheckInSettings;
}): { ok: boolean; reason?: "no_match" | "no_table" | "already_started" | "waiting_for_check_in" } => {
  const m = args.match;
  if (!m) return { ok: false, reason: "no_match" };
  if (m.status === "in_progress" || m.status === "completed") return { ok: false, reason: "already_started" };
  if (m.tableId == null) return { ok: false, reason: "no_table" };
  if (args.settings.required && !args.bothCheckedIn) return { ok: false, reason: "waiting_for_check_in" };
  return { ok: true };
};
