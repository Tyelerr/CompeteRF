// src/utils/tournament-view.ts
// ONE source of truth for "does this tournament belong in the player's Profile →
// Tournament View right now?" Tournament View is a GAMEPLAY state, not a registration or
// preparation state. The authoritative lifecycle, kept strictly separate:
//
//   Registered → Registration Closed → Bracket Prepared/Drawn → Tournament LIVE/In Progress → Completed
//
// Tournament View activates ONLY at "LIVE / In Progress" and only for a valid participant.
// The authoritative signal for both formats is the tournaments row live_state === "in_progress":
//   • Elimination: the TD's "Start Tournament" action sets live_state = "in_progress"
//     (drawing the bracket only reaches the "registration_closed" / bracket_drawn phase — it
//     does NOT go live, so a drawn-but-not-started bracket must NOT activate Tournament View).
//   • Chip: chipService.start() sets live_state = "in_progress" (and chip_config.started_at).
//
// NOT live: registration_closed (pre-game), bracket drawn without Start (preparation),
// completed (over). Those keep the player on the normal Profile View, with the event under
// Profile → My Tournaments → Registered Tournaments.

import { isTournamentCompleted, isTournamentArchived } from "./tournament.archive";

// Loose structural inputs so a full PlayerTournament or a leaner projection both fit.
export interface TournamentViewFields {
  // Player participation status (tournament_players.status). Cancelled / no-show / removed
  // players are not in the field even if the event is live.
  status?: string | null;
  tournament?: {
    live_state?: string | null;
    status?: string | null;
    // Overlays that mark a tournament removed/over WITHOUT resetting live_state — both are
    // needed to decide "current" (delete sets status='cancelled'; archive sets archived_at).
    archived_at?: string | null;
    completed_at?: string | null;
  } | null;
}

// Participation states that mean the player is NOT an active entrant.
const EXCLUDED_PARTICIPATION = new Set([
  "cancelled",
  "no_show",
  "removed",
  "withdrawn",
]);

// A DELETED tournament: deletion sets tournaments.status='cancelled' (see
// useTournamentDetail.isDeleted / tournamentService.deleteTournament) but does NOT reset
// live_state, so a deleted event can still read as live_state='in_progress'.
export const isTournamentDeleted = (t: TournamentViewFields): boolean =>
  String(t.tournament?.status ?? "").toLowerCase() === "cancelled";

// ── SINGLE source of truth: is this tournament genuinely CURRENT / RUNNING right now? ──────
// live_state is the authoritative lifecycle phase, and ONLY 'in_progress' means running:
//   not_started / registration_open / registration_closed → pre-game (Registered/Upcoming)
//   in_progress                                            → running (this predicate)
//   finished                                               → over (Completed)
// On top of that, DELETE (status='cancelled') and ARCHIVE (archived_at set, or completed +30d)
// are overlays that flag a tournament removed/over WITHOUT resetting live_state — so they are
// excluded here as well. Everything terminal/removed lives in ONE predicate so no caller has
// to re-derive a growing "not X, not Y" exclusion list. (See the truth table in the PR/report.)
export const isTournamentCurrent = (t: TournamentViewFields): boolean => {
  const tt = t.tournament;
  if (!tt) return false;
  if (tt.live_state !== "in_progress") return false; // only in_progress is running
  if (isTournamentCompleted(tt)) return false;        // status=completed / live_state=finished
  if (isTournamentDeleted(t)) return false;           // status=cancelled (deleted)
  if (isTournamentArchived(tt)) return false;         // archived_at set, or completed +30d
  return true;
};

// Back-compat alias — the authoritative "gameplay is live" signal IS "current".
export const tournamentGameplayStarted = isTournamentCurrent;

// Does this tournament belong in the player's Tournament View right now? = the event is
// current/running AND the viewer is still an active participant (not cancelled/no-show/removed).
export const isTournamentViewEligible = (t: TournamentViewFields): boolean => {
  if (EXCLUDED_PARTICIPATION.has(String(t.status ?? "").toLowerCase()))
    return false;
  return isTournamentCurrent(t);
};
