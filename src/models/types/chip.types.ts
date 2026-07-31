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
  // Linked user (profiles.id_auto) — the TD selects a REAL user so same-named
  // players are disambiguated by player id. p2 for the scotch-doubles partner.
  p1ProfileId?: number | null;
  p2ProfileId?: number | null;
  // Phase 5: stable players.id for each member (present for team roster entries).
  // Used to edit/identify PENDING members (who have no id_auto).
  p1PlayerId?: string | null;
  p2PlayerId?: string | null;
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
  // ── Registration bridge (transient — NOT persisted to chip_entries) ──────────
  // Set when this entry was projected from a self-service tournament_players
  // registration rather than added directly by the TD. The chip Players setup
  // uses these to show approval state and offer the TD Fargo-confirm/approve.
  fromRegistration?: boolean;
  isTeam?: boolean; // projected from a tournament_teams row (P1 captain / P2 partner)
  regId?: number | null; // tournament_players.id this entry mirrors (singles only)
  regStatus?: string | null; // source status (tournament_players.status OR team status)
  fargoStatus?: string | null; // linked profile's fargo_status (unverified/verified)
  // Team origin (isTeam only): ids + per-member TD-Fargo-confirmed flags so the
  // chip Players UI can offer per-member "Confirm Fargo" + team "Unlock".
  teamId?: number | null;
  teamName?: string | null; // custom team name (e.g. "Desert Sharks"); usually null
  chipOverride?: number | null; // TD manual chip-count override (null = auto)
  paidSidePots?: string[]; // side-pot names this team bought into (tournament_teams.paid_side_pots)
  teamLocked?: boolean;
  teamApproved?: boolean;
  p1MemberId?: number | null;
  p2MemberId?: number | null;
  p1FargoVerified?: boolean;
  p2FargoVerified?: boolean;
}

export interface ChipTable {
  id: string;
  label: string; // "Table 1"
  isStream: boolean;
  streamUrl?: string | null;
  status: "open" | "in_use";
  // Table lifecycle during a live event (winner-stays queue). A table is "active"
  // unless `inactive` — inactive tables receive no new matches (TD closed them,
  // reversible via reactivate). `closing` = the TD marked it to close, but a match
  // is still in progress; it goes inactive when that match finishes (never
  // interrupts play).
  inactive?: boolean;
  closing?: boolean;
  // TD reserved this table: no automatic assignments, Auto Run skips it. It can
  // still hold/finish a match; it just won't receive new ones until unlocked.
  locked?: boolean;
  matchId?: string | null; // the in-progress match on this table
  // The winner staying on this table, waiting for a challenger (winner-stays). Set
  // when a match ends but no eligible challenger is queued yet; cleared when the
  // next match starts.
  holderId?: string | null;
  // Table-specific anti-repeat: the entry that just lost HERE. The next challenger
  // pulled from the queue skips this entry (they can still face the holder on a
  // different table). Cleared on reshuffle.
  lastLoserId?: string | null;
  // Winner-stays confirmation: a challenger has been pulled from the queue and
  // assigned to face the holder, but the match has NOT started yet (no timer).
  // The TD confirms with Start Match, which starts the match at 0:00. Cleared
  // when the match starts or the assignment is released back to the queue.
  pendingChallengerId?: string | null;
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
  | "redo"
  | "restore"
  | "manual";

export interface ChipEvent {
  id: string;
  type: ChipEventType;
  at: string; // ISO timestamp
  text: string; // human-readable line for the History timeline
  by?: number | null; // profiles.id_auto of the actor (TD)
  payload?: Record<string, unknown>;
  // Transaction id shared by every event ONE action logged (e.g. a completed
  // match logs match_result + chip_loss + elimination — all one txId). The Audit
  // Log shows the parent (highest-priority) event as a single row and folds the
  // rest in as "resulting changes". null/undefined = a standalone event.
  txId?: string | null;
  // Set true when a later Tournament Restore rolled the state back past this
  // action. The event STAYS in the log (full audit trail) but renders dimmed as
  // "Reverted by Tournament Restore" — it's history, no longer the active state.
  superseded?: boolean;
}

// A persisted restore point: the live state just BEFORE one logged action, so the
// Audit Log can roll the whole tournament back to any earlier moment — surviving
// reloads (unlike an in-memory undo stack). Only the mutable live fields are kept
// (names/Fargo/registration data never change during play and come from current).
export interface ChipEntrySnapshot {
  id: string;
  chips: number;
  status: ChipEntryStatus;
  tableId: string | null;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  eliminations: number;
  eliminatedAt: string | null;
}
// A live (in-progress) match at the moment the snapshot was taken — captured so a
// restore recreates the exact match (teams + table) and its ELAPSED timer, rather
// than inferring it from table seating and resetting the clock to 0:00.
export interface ChipMatchSnapshot {
  id: string;
  tableId: string;
  aId: string;
  bId: string;
  status: ChipMatchStatus;
  elapsedMs: number; // running time at the instant the snapshot was captured
  winnerId?: string | null;
  loserId?: string | null;
}
export interface ChipRestorePoint {
  primaryEventId: string; // the newest event id this action logged (the row users target)
  eventIds: string[]; // all event ids this action logged (marked superseded on restore)
  at: string; // when the action happened (ISO)
  label: string; // the action description (prefix-free)
  snapshot: {
    entries: ChipEntrySnapshot[];
    tables: ChipTable[];
    queue: string[];
    // Live matches at the snapshot moment (elapsed-preserving restore). Optional:
    // legacy restore points saved before this field fall back to seating-inference.
    matches?: ChipMatchSnapshot[];
    startedAt: string | null;
    finishedAt: string | null;
    winnerId: string | null;
    reshuffleCount: number;
    reshufflePending: boolean;
    reshuffleTableCount: number | null;
    shuffleMode: boolean;
    shuffleReady: boolean;
    shuffleRound: boolean;
    roundRemaining: string[];
  };
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
  // Shuffle cycle draining flag: a shuffle was started and the board is clearing.
  // While set, no new matches are seated; in-progress matches finish and those
  // teams rejoin the queue. When the last active match ends, the cycle flips to
  // shuffleReady (below) awaiting Start Shuffle. See beginShuffle/startShuffle.
  reshufflePending?: boolean;
  reshuffleTableCount?: number | null; // desired active tables after the redraw
  // Shuffle Mode: a persistent TD-controlled mode (banner at top). When enabled,
  // the TD can start a shuffle cycle: matches drain (reshufflePending), tables
  // clear, and once every active table is empty the cycle enters the "ready"
  // state (shuffleReady) awaiting Start Shuffle. Disabling returns to normal play.
  shuffleMode?: boolean; // feature enabled — show the banner
  shuffleReady?: boolean; // draining complete, all tables empty, awaiting Start Shuffle
  // A shuffle ROUND is actively being played: teams were randomized and seated,
  // and the winner-stays rotation gives every survivor exactly one match.
  shuffleRound?: boolean;
  // Persisted restore points (bounded, oldest first) — one per live action, the
  // pre-action snapshot. Powers "Restore Tournament to This Point" in the Audit
  // Log and the quick "Undo Last N" shortcuts, and survives reloads.
  restorePoints?: ChipRestorePoint[];
  // Teams in the current round that have NOT yet been seated into a match. Set to
  // all shuffled survivors at each reshuffle; an id is removed when that team is
  // seated. When it's empty, no new matches are created and the board drains.
  // Only meaningful while shuffleRound is true. A team restored mid-round is NOT
  // added here (it joins the next reshuffle). Persisted so a refresh is safe.
  roundRemaining?: string[];
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
