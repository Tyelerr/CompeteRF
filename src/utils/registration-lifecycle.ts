// src/utils/registration-lifecycle.ts
// ONE source of truth for the TD-facing registration lifecycle, shared by chip (now)
// and elimination (Phase 3). Deliberately format-agnostic and PURE — callers translate
// their own persisted fields into a LifecycleInput; this module owns the rules only.
//
// Visible lifecycle:
//   Pre-Registered  a player signed themselves up and the TD has not processed them yet
//   Registered      the TD has processed the player, but the entry fee is NOT collected
//   Ready           entry fee satisfied (paid, or no fee) AND no format hard blocker
//   No Show / Removed   exception states
//   (Waiting)       doubles-only sub-state: a team without a partner yet
//
// The invariant that makes "Ready" trustworthy:
//   Ready  ⇔  (paid OR entry fee not required)  AND  no hard blocker
// "Approved" / "Checked In" / "Verified" are NOT part of the visible lifecycle. They may
// still exist as internal engine fields; the Ready state sets/derives them.
//
// Phase-awareness (critical for legacy data):
//   setup      → derive from the invariant above; the engine's checked_in flag is NOT
//                trusted for display (a legacy checked_in+unpaid row shows Registered).
//   live/completed → reflect ACTUAL participation; never reinterpret history via the
//                paid invariant, never demote a live participant to Registered.

import { COLORS } from "../theme/colors";

export type LifecyclePhase = "setup" | "live" | "completed";

export type LifecycleStatus =
  | "prereg"
  | "registered"
  | "ready"
  | "no_show"
  | "removed"
  | "waiting";

export interface LifecycleInput {
  phase: LifecyclePhase;
  // Exception state, translated from the source's raw status (null when none).
  exception?: "no_show" | "removed" | null;
  // Doubles: the team has no partner yet (can never be Ready).
  waiting?: boolean;
  // Has the TD intentionally handled this entry (vs an untouched self-signup)?
  processed: boolean;
  // Entry fee satisfied: paid, OR the tournament requires no fee. Use paymentSatisfied()
  // to compute this consistently.
  paymentSatisfied: boolean;
  // A format-specific HARD blocker that prevents competing even when paid (e.g. missing
  // Fargo when the format needs it to assign chips). Optional; defaults to none.
  hardBlocker?: boolean;
  // The EXPLICIT Ready decision (the engine's checked_in flag). Ready is no longer
  // implied by "paid + eligible": the TD must explicitly mark a player Ready, and can
  // make an eligible/paid player Unready again without touching payment. In setup this
  // gates Ready; in live/completed it is the participation truth for faithful history.
  checkedIn?: boolean;
}

// Entry fee is satisfied when the tournament requires none, or it has been collected.
export const paymentSatisfied = (paid: boolean, entryFeeRequired: boolean): boolean =>
  !entryFeeRequired || paid;

// The single Ready gate. Ready = payment satisfied AND no hard blocker.
export const readyGate = (a: {
  paid: boolean;
  entryFeeRequired: boolean;
  hardBlocker?: boolean;
}): boolean => paymentSatisfied(a.paid, a.entryFeeRequired) && !a.hardBlocker;

// ── Maximum-Fargo cap (shared) ───────────────────────────────────────────────
// How many points a rating is OVER the tournament max (0 when at/under, or when either
// value is missing — a missing rating is a separate concern, not an over-cap). One source
// of truth for the chip card, Mark Ready, and the Add Player warning. Callers supply the
// rating already resolved for the format (singles = player Fargo; doubles = team rating).
export const fargoOverBy = (
  rating: number | null | undefined,
  maxFargo: number | null | undefined,
): number => (rating == null || maxFargo == null ? 0 : rating > maxFargo ? rating - maxFargo : 0);
export const isFargoOverCap = (
  rating: number | null | undefined,
  maxFargo: number | null | undefined,
): boolean => fargoOverBy(rating, maxFargo) > 0;

export const deriveLifecycle = (i: LifecycleInput): LifecycleStatus => {
  if (i.exception === "no_show") return "no_show";
  if (i.exception === "removed") return "removed";
  if (i.waiting) return "waiting";
  if (i.phase !== "setup") {
    // Live / completed: show real participation; do NOT re-derive via the paid invariant.
    return i.checkedIn ? "ready" : i.processed ? "registered" : "prereg";
  }
  // Setup: Ready = ELIGIBLE (payment satisfied + no hard blocker) AND the TD has
  // explicitly marked them Ready (checkedIn). A paid, eligible player who has not been
  // marked Ready — or who was manually made Unready — is Registered, not Ready.
  if (i.paymentSatisfied && !i.hardBlocker && i.checkedIn) return "ready";
  return i.processed ? "registered" : "prereg";
};

export const LIFECYCLE_META: Record<LifecycleStatus, { label: string; color: string }> = {
  prereg: { label: "Pre-Registered", color: COLORS.warning }, // amber — needs TD attention
  registered: { label: "Registered", color: COLORS.primary }, // blue — handled, not paid
  ready: { label: "Ready", color: COLORS.success }, // green — eligible to compete
  no_show: { label: "No Show", color: COLORS.error },
  removed: { label: "Removed", color: COLORS.textMuted },
  waiting: { label: "Waiting for Partner", color: COLORS.warning },
};

// Display order for rosters/counters: eligible first, then those needing action.
export const LIFECYCLE_RANK: Record<LifecycleStatus, number> = {
  ready: 0,
  registered: 1,
  prereg: 2,
  waiting: 3,
  no_show: 4,
  removed: 5,
};
