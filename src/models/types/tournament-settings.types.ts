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

export type RaceMode = "fixed" | "groups";

// ── Generated bracket (V1: Round 1 only, stored in live_settings.bracket) ─────
export interface BracketSlot {
  registrationId?: number | null; // null for a bye slot
  name: string;
  fargo?: number | null;
}
export interface BracketMatch {
  matchNumber: number;
  p1: BracketSlot | null;
  p2: BracketSlot | null; // null => bye (p1 advances)
  bye: boolean;
  raceTo: number | null;
}
export interface GeneratedBracket {
  generatedAt: string;
  drawType: "random"; // V1: random only
  format: string; // tournament_format at generation time
  bracketSize: number;
  byes: number;
  round1: BracketMatch[];
}

export interface TournamentLiveSettings {
  // Bracket sizing / capacity
  bracketSize?: number | null; // null/undefined => unlimited
  maxPlayers?: number | null;
  tableCount?: number | null;

  // Race configuration
  raceMode?: RaceMode; // "fixed" uses the per-bracket races below; "groups" uses raceGroups
  // Fixed race, per bracket side. Losers side is unused for single elimination.
  fixedRaceWinners?: number | null;
  fixedRaceLosers?: number | null;
  fixedRaceFinals?: number | null;
  raceGroups?: RaceGroup[];

  // Feature toggles (choice stored now; some features land in later phases)
  qrCheckIn?: boolean;
  spectatorView?: boolean;
  liveBracket?: boolean; // a.k.a. "Live Bracket / View Tournament"
  autoAdvanceWinners?: boolean;
  autoAssignTables?: boolean;
  autoGenerateNextRound?: boolean;
  matchTimer?: boolean;
  matchTimerMinutes?: number | null;

  // Generated draw (built on the Bracket / Draw page, not in Settings).
  bracket?: GeneratedBracket | null;
}
