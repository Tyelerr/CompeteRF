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
}
