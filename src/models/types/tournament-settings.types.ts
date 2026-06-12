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
// Players placed into round-1 seed positions (length = bracketSize; null = bye).
export interface BracketSeed {
  registrationId: number;
  name: string;
  fargo: number | null;
  raceOverride?: number | null;
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
  // V2 engine: full match graph + seeded players. The resolver flows players
  // through the graph as matches complete (winners advance, losers drop).
  doubleElim?: boolean;
  graph?: BracketGraphNode[];
  seeds?: (BracketSeed | null)[];
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

// ── Full bracket graph (winners + losers + grand final) ───────────────────────
// Every match's slots reference where their player comes from, so winners/losers
// flow automatically as matches complete. Round-1 winners slots are seeds.
export type BracketSlotRef =
  | { kind: "seed"; seedIndex: number } // position in the round-1 seed order
  | { kind: "winner"; matchId: string } // winner of another match advances here
  | { kind: "loser"; matchId: string } // loser of a winners match drops here
  | { kind: "empty" }; // unfilled / bye

export type BracketSide = "winners" | "losers" | "grand";

export interface BracketGraphNode {
  id: string; // "W1M1", "L2M3", "GF", "GF2"
  side: BracketSide;
  round: number; // 1-based within its side
  slot1: BracketSlotRef;
  slot2: BracketSlotRef;
  // Grand-final reset: only played if the losers-bracket finalist wins GF (the
  // winners finalist must be beaten twice). Skipped if the WB finalist wins GF.
  conditional?: boolean;
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

// ── Entry-fee breakdown (built-in fees) ───────────────────────────────────────
// A fee is a per-player slice carved OUT of the entry fee — the same for every
// player (e.g. $25 entry → $5 green to the bar, $2 to the TD, $18 to the prize
// pool). It is NOT prize money: it reduces the entry payout pool. category drives
// the venue-analytics buckets later (green → venue, td → director, etc.).
export type FeeCategory = "green" | "td" | "admin" | "custom";
export interface TournamentFee {
  id: string; // stable client id
  category: FeeCategory;
  name: string; // display name (preset for green/td/admin, user-set for custom)
  amount: number; // dollars per player, carved out of the entry fee
  enabled: boolean; // whether the fee is currently applied (checkbox state)
}

// ── Prize Pool (Setup phase) ──────────────────────────────────────────────────
// Configured before the bracket is drawn and locked with it. Dollar pools are
// derived live from the player count × entry/side-pot amounts (which live on the
// tournament row), so only the PAYOUT SPLIT is persisted here. A place's payout
// is percent-of-pool unless the TD sets amountOverride (then it reads "custom").
export interface PrizePlace {
  percent: number; // 0..100 share of the pool for this place
  amountOverride?: number | null; // manual $ override; when set, payout is "custom"
}
// Payout split for one named side pot (name matches a tournaments.side_pots entry).
export interface SidePotPayout {
  name: string;
  places: PrizePlace[];
}
export interface PrizePoolConfig {
  entryPlaces: PrizePlace[]; // payout split for the main entry pool
  sidePots: SidePotPayout[]; // payout split per side pot, by name
  includeAddedMoney: boolean; // fold venue added money into the entry payout pool
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

  // Prize pool payout configuration (Setup phase). Pools are derived live from
  // the player count; only the split is stored. See PrizePoolConfig.
  prizePool?: PrizePoolConfig | null;

  // Built-in entry-fee deductions (green/td/admin/custom). Per-player slices of
  // the entry fee that reduce the entry payout pool. Defined in Settings.
  fees?: TournamentFee[];
  // How fees relate to the entry fee. false (default) = included in the entry
  // (fees reduce the pool). true = collected on top of the entry (fees are
  // separate; the full entry goes to the pool).
  feesAddedOnTop?: boolean;
}
