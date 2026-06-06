// src/models/types/tournament-settings.types.ts
// Shape of the `tournaments.live_settings` JSONB column. Holds the live-engine
// setup choices that do NOT have their own columns. Existing columns
// (entry_fee, added_money, side_pots, max_fargo, etc.) are persisted directly
// on the tournament row and are NOT duplicated here.
//
// Every field is optional; the blob defaults to {} for tournaments created
// before this feature. Toggles are stored even when the underlying feature
// ships later (the TD's choice is recorded now).

// One A/B/C race group: players whose Fargo falls in [minFargo, maxFargo]
// race to `raceTo`. (Renamed from the old "Fargo Handicap Groups" concept.)
export interface RaceGroup {
  id: string; // stable client id (not a DB key)
  label: string; // e.g. "A", "B", "C"
  minFargo: number;
  maxFargo: number;
  raceTo: number;
}

export type RaceMode = "fixed" | "groups" | "differential";

// ── Generated bracket (V1: Round 1 only, stored in live_settings.bracket) ─────
export interface BracketSlot {
  registrationId?: number | null; // null for a bye slot
  name: string;
  fargo?: number | null;
  raceTo?: number | null; // this player's race in their match (handicap-aware)
}
export interface BracketMatch {
  matchNumber: number;
  p1: BracketSlot | null;
  p2: BracketSlot | null; // null => bye (p1 advances)
  bye: boolean;
  raceTo: number | null; // common race (fixed mode); per-slot otherwise
}
export interface GeneratedBracket {
  generatedAt: string;
  drawType: "random"; // V1: random only
  format: string; // tournament_format at generation time
  drawNumber: number; // increments each (re)draw
  players: number;
  bracketSize: number;
  byes: number;
  round1: BracketMatch[];
}

// Live per-match state (Phase 2). Stored in live_settings.matchState keyed by
// the round-1 match number (as a string). Absent => "scheduled".
export type MatchStatus = "scheduled" | "in_progress" | "completed";
export type MatchResult = "normal" | "forfeit" | "withdraw";
export interface MatchLiveState {
  status: MatchStatus;
  tableId?: number | null; // assigned tournament_tables.id
  startedAt?: string | null; // ISO timestamp the match started (drives the timer)
  completedAt?: string | null;
  winner?: 1 | 2 | null; // which slot won (1 = p1, 2 = p2)
  p1Score?: number | null;
  p2Score?: number | null;
  timerSeconds?: number | null; // custom allowed-time override (seconds)
  result?: MatchResult | null; // how the match ended
}

// One entry in the draw history (append-only) — stored in live_settings.drawLog.
export interface DrawLogEntry {
  drawNumber: number;
  tdUserId?: number | null; // profiles.id_auto
  tdName?: string;
  timestamp: string;
  reason: string; // "Initial draw" for #1
  players: number;
  bracketSize: number;
  drawType: "random";
}

export interface TournamentLiveSettings {
  // NOTE: bracket size is NOT configured here — it's derived on the Bracket /
  // Draw page from the checked-in player count (next power of two, with byes)
  // and recorded on the generated bracket below.

  // Race configuration
  raceMode?: RaceMode; // "fixed" uses the per-bracket races below; "groups" uses raceGroups
  // Fixed race, per bracket side. Losers side is unused for single elimination.
  fixedRaceWinners?: number | null; // also the single-elim "Match Race To"
  fixedRaceLosers?: number | null;
  fixedRaceFinals?: number | null;
  // A/B/C race groups (race by Fargo band).
  raceGroups?: RaceGroup[];
  // Fargo Differential: auto race per match from the two players' Fargo gap.
  // Lower player races to min; higher player gets +1 game per `perGame` of gap,
  // capped at max. Rounding defaults to "down".
  fargoDiffMinRace?: number | null;
  fargoDiffPerGame?: number | null;
  fargoDiffMaxRace?: number | null;
  fargoDiffRounding?: "down" | "up";

  // NOTE: there are no live-feature toggles. The public/live bracket view,
  // winner+loser auto-advance on scoring, table suggestion at match start, and
  // per-match timers are all built-in live behaviors (Phase 2).

  // Generated draw (built on the Bracket / Draw page, not in Settings).
  bracket?: GeneratedBracket | null;
  // Append-only draw history (every Draw / Redraw).
  drawLog?: DrawLogEntry[];
  // Live per-match state keyed by match number (Matches tab). See MatchLiveState.
  matchState?: Record<string, MatchLiveState>;
}
