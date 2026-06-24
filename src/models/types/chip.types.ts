// src/models/types/chip.types.ts
// Chip Tournament data model. Lives entirely inside tournaments.live_settings.chip
// (a TD-owned JSONB blob) — see CHIP_TOURNAMENT.md. The chip format is its own
// ecosystem: a live winner-stays chip queue, NOT a bracket. The engine
// (chip.engine.ts) operates purely over a ChipState; the service persists it.

// One player per entry, or two (team name is always "P1 / P2").
export type ChipFormat = "singles" | "scotch_doubles";

// Lifecycle of an entry within a running chip tournament.
export type ChipEntryStatus = "queued" | "playing" | "eliminated";

export type ChipMatchStatus = "in_progress" | "finished" | "forfeit";

// One row of the Fargo→chips table. For singles the player's Fargo is matched;
// for scotch doubles the COMBINED team Fargo (p1 + p2) is matched.
export interface ChipTier {
  id: string; // stable client id
  minFargo: number; // inclusive
  maxFargo: number | null; // inclusive; null = no upper bound ("700+")
  chips: number;
}

export interface ChipSettings {
  format: ChipFormat;
  tiers: ChipTier[]; // the Fargo chip table (fully customizable)
  // Buy-backs: when allowed, a player eliminated at 0 chips can be bought back in
  // by the TD (re-enters the queue with fresh chips). Winner-stays and performance
  // tracking are always on; stream tables are marked per-table in Tables setup.
  buyBacksAllowed: boolean;
}

// A player or team. For singles, p2* are null and teamFargo == p1Fargo.
export interface ChipEntry {
  id: string;
  p1Name: string;
  p1Fargo: number | null;
  p1Phone?: string | null;
  p2Name?: string | null;
  p2Fargo?: number | null;
  teamFargo: number | null; // p1Fargo (+ p2Fargo for doubles)
  startChips: number; // assigned at start from the chip table
  chips: number; // current chips remaining
  paid: boolean;
  checkedIn: boolean;
  status: ChipEntryStatus;
  wins: number;
  losses: number;
  streak: number; // current consecutive wins (0 if last result was a loss)
  bestStreak: number;
  eliminations: number; // opponents eliminated by this entry
  queuePosition?: number | null; // denormalized for display; queue[] is the source
  tableId?: string | null; // current table when status === "playing"
  eliminatedAt?: string | null;
  createdAt: string;
}

export interface ChipTable {
  id: string;
  label: string; // "Table 1"
  isStream: boolean;
  streamUrl?: string | null;
  status: "open" | "in_use";
  matchId?: string | null; // the in-progress match on this table
  // The winner staying on this table, waiting for a challenger (winner-stays). Set
  // when a match ends but no eligible challenger is queued yet; cleared when the
  // next match starts.
  holderId?: string | null;
  // Table-specific anti-repeat: the entry that just lost HERE. The next challenger
  // pulled from the queue skips this entry (they can still face the holder on a
  // different table). Cleared on reshuffle.
  lastLoserId?: string | null;
}

export interface ChipMatch {
  id: string;
  tableId: string;
  aId: string; // entry id (the holder/stayer once a winner is recorded)
  bId: string; // entry id (the challenger)
  winnerId?: string | null;
  loserId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  status: ChipMatchStatus;
}

export type ChipEventType =
  | "match_result"
  | "elimination"
  | "chip_loss"
  | "player_added"
  | "shuffle"
  | "forfeit"
  | "table_added"
  | "table_removed"
  | "chip_adjust"
  | "move"
  | "undo"
  | "manual";

export interface ChipEvent {
  id: string;
  type: ChipEventType;
  at: string; // ISO timestamp
  text: string; // human-readable line for the History timeline
  by?: number | null; // profiles.id_auto of the actor (TD)
  payload?: Record<string, unknown>;
}

// The whole chip blob, stored at live_settings.chip.
export interface ChipState {
  settings: ChipSettings;
  entries: ChipEntry[];
  tables: ChipTable[];
  matches: ChipMatch[]; // append-only log (in-progress + finished)
  queue: string[]; // entry ids, front (index 0) = next up
  events: ChipEvent[];
  startedAt?: string | null;
  finishedAt?: string | null;
  winnerId?: string | null; // last entry standing
  reshuffleCount?: number;
}

// Performance label (shared with the Fargo performance algorithm).
export type ChipPerformanceLabel =
  | "exceptional"
  | "above"
  | "expected"
  | "below"
  | "underperformed";

// Derived dashboard / story-card snapshot (computed, never persisted).
export interface ChipDashboard {
  playersRemaining: number;
  eliminated: number;
  queueCount: number;
  activeTables: number;
  matchesPlayed: number;
  avgMatchMs: number | null;
  longestMatchMs: number | null;
  chipLeaderId: string | null;
  hotStreakId: string | null;
  eliminationLeaderId: string | null;
  lastChipIds: string[]; // entries on their final chip (Death Row)
  finalFour: boolean;
}
