// src/utils/tournament-phase.ts
// Single authoritative tournament lifecycle derivation, shared by the Manage
// Tournament hub (its header/gating), the admin/bar/TD Tournament Manager list
// badges, and anywhere else that needs the real phase. No React, no Supabase.
//
// The visible "status" on a tournament row is NOT tournament.status (which stays
// "active" for the entire pre-completion lifecycle). It is the phase derived from
// (status, live_state, whether a bracket has been drawn, and — before registration
// opens — whether the required Settings are complete). This is the same logic the
// live bracket header and public LIVE card use.

import { COLORS } from "../theme/colors";
import { settingsComplete } from "./settings-complete";

// Front-end lifecycle. No dedicated DB column — derived from saved fields.
export type ManagePhase =
  | "setup_incomplete"
  | "ready_to_open"
  | "registration_open"
  | "registration_closed"
  | "bracket_drawn"
  | "running"
  | "completed"
  | "archived";

// The minimal tournament shape the derivation reads. Both the full Tournament and
// the lighter list/card row types structurally satisfy this (all fields optional).
export interface TournamentPhaseInput {
  status?: string | null;
  live_state?: string | null;
  live_settings?: { bracket?: unknown; raceMode?: string | null } | null;
  // Settings-completion inputs (only used to split setup_incomplete vs ready_to_open):
  name?: string | null;
  game_type?: string | null;
  tournament_format?: string | null;
  venue_id?: number | null;
  tournament_date?: string | null;
  start_time?: string | null;
  table_size?: string | null;
  equipment?: string | null;
  entry_fee?: number | null;
  max_fargo?: number | null;
  open_tournament?: boolean | null;
}

// The badge (Setup Incomplete vs Ready) uses the SHARED Settings-completion check.
const requiredComplete = (t: TournamentPhaseInput): boolean =>
  settingsComplete({
    name: t.name ?? undefined,
    gameType: t.game_type ?? undefined,
    format: t.tournament_format ?? undefined,
    venueId: t.venue_id ?? undefined,
    date: t.tournament_date ?? undefined,
    time: t.start_time ?? undefined,
    tableSize: t.table_size ?? undefined,
    equipment: t.equipment ?? undefined,
    entryFee: t.entry_fee ?? undefined,
    maxFargo: t.max_fargo ?? undefined,
    open: t.open_tournament ?? undefined,
    raceMode: t.live_settings?.raceMode ?? null,
  });

export const derivePhase = (t: TournamentPhaseInput | null): ManagePhase => {
  if (!t) return "setup_incomplete";
  if (t.status === "archived") return "archived";
  if (t.status === "completed" || t.live_state === "finished") return "completed";
  const ls = t.live_state ?? "not_started";
  if (ls === "in_progress") return "running";
  if (ls === "registration_closed")
    // Registration only closes when the bracket is drawn.
    return t.live_settings?.bracket ? "bracket_drawn" : "registration_closed";
  if (ls === "registration_open") return "registration_open";
  return requiredComplete(t) ? "ready_to_open" : "setup_incomplete";
};

// A tournament row's visible badge phase — the lifecycle phase, plus "cancelled"
// (a non-lifecycle status that never reaches derivePhase).
export type BadgePhase = ManagePhase | "cancelled";

export const deriveBadgePhase = (t: TournamentPhaseInput | null): BadgePhase =>
  t?.status === "cancelled" ? "cancelled" : derivePhase(t);

// Compact label + color per phase for list/card badges. Labels mirror the admin
// header + public LIVE card vocabulary; colors reuse existing theme tokens.
export const PHASE_BADGE_META: Record<BadgePhase, { label: string; color: string }> = {
  setup_incomplete: { label: "Setup", color: COLORS.warning },
  ready_to_open: { label: "Ready", color: COLORS.primary },
  registration_open: { label: "Registration Open", color: COLORS.success },
  registration_closed: { label: "Registration Closed", color: COLORS.warning },
  bracket_drawn: { label: "Bracket Drawn", color: COLORS.primary },
  running: { label: "Running", color: COLORS.success },
  completed: { label: "Completed", color: COLORS.textSecondary },
  archived: { label: "Archived", color: COLORS.textSecondary },
  cancelled: { label: "Cancelled", color: COLORS.error },
};

// The {label, color} to render for a tournament row/card status badge.
export const tournamentBadge = (
  t: TournamentPhaseInput | null,
): { label: string; color: string } => PHASE_BADGE_META[deriveBadgePhase(t)];
