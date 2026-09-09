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

import { isTournamentCompleted } from "./tournament.archive";

// Loose structural inputs so a full PlayerTournament or a leaner projection both fit.
export interface TournamentViewFields {
  // Player participation status (tournament_players.status). Cancelled / no-show / removed
  // players are not in the field even if the event is live.
  status?: string | null;
  tournament?: {
    live_state?: string | null;
    status?: string | null;
  } | null;
}

// Participation states that mean the player is NOT an active entrant.
const EXCLUDED_PARTICIPATION = new Set([
  "cancelled",
  "no_show",
  "removed",
  "withdrawn",
]);

// Is this tournament officially LIVE / in progress? (Not merely registration-closed or
// bracket-prepared, and not completed.) The single authoritative gameplay signal.
export const tournamentGameplayStarted = (t: TournamentViewFields): boolean => {
  const tt = t.tournament;
  if (!tt) return false;
  if (isTournamentCompleted(tt)) return false;
  return tt.live_state === "in_progress";
};

// Does this tournament belong in the player's Tournament View right now? True for both
// "active" and "live-after-elimination" (both keep the event in Tournament View while it is
// live). Excludes: not-yet-live events (registered / registration-closed / bracket-drawn),
// completed events, and players who are not active participants (cancelled / no-show / removed).
export const isTournamentViewEligible = (t: TournamentViewFields): boolean => {
  if (EXCLUDED_PARTICIPATION.has(String(t.status ?? "").toLowerCase()))
    return false;
  return tournamentGameplayStarted(t);
};
