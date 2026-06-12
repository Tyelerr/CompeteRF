// src/models/types/venue-analytics.types.ts
// Business analytics for bar owners: attendance + tournament money flow derived
// from tournaments + tournament_players + the prize-pool config. Money figures
// scale by player count, so an event with no engine registrations contributes
// nothing — analytics naturally reflects only tournaments run on Compete.

export type AnalyticsPeriod = "30d" | "90d" | "year" | "lifetime";

export interface AnalyticsPeriodOption {
  label: string;
  value: AnalyticsPeriod;
}

export const ANALYTICS_PERIODS: AnalyticsPeriodOption[] = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "This Year", value: "year" },
  { label: "Lifetime", value: "lifetime" },
];

// Fee dollars bucketed by category (matches FeeCategory).
export interface FeeBuckets {
  td: number;
  green: number;
  admin: number;
  custom: number;
}

export const EMPTY_FEE_BUCKETS: FeeBuckets = { td: 0, green: 0, admin: 0, custom: 0 };

// Money + attendance for a SINGLE tournament run (one row in tournament_players
// terms). Computed via prize-pool.ts so the fee/pool logic stays in one place.
export interface TournamentRunStats {
  tournamentId: number;
  templateId: number | null;
  name: string;
  tournamentDate: string;
  status: string;
  players: number; // active registrations (not cancelled / no_show)

  // Gross collected
  entryCollected: number; // players × entry_fee
  sidePotsCollected: number; // Σ entrants × pot amount
  addedMoney: number; // venue contribution

  // Fees / deductions
  feesByCategory: FeeBuckets;
  totalFees: number;

  // Net payout
  netPrizePool: number; // money paid to players (net of included fees)
  prizePaidOut: number; // ≈ netPrizePool in the current model
}

// A tournament SERIES: all runs of one recurring template grouped together
// (or a single one-off tournament). The drill-down list + detail operate on these.
export interface TournamentSeriesStats {
  seriesId: string; // `tpl-<templateId>` or `one-<tournamentId>`
  templateId: number | null;
  name: string;
  tournamentIds: number[]; // for discovery (app_events) scoping

  // Attendance
  events: number; // runs held
  totalPlayers: number;
  avgAttendance: number;
  largestAttendance: number;
  lowestAttendance: number;

  // Money (summed across runs)
  entryCollected: number;
  sidePotsCollected: number;
  addedMoney: number;
  feesByCategory: FeeBuckets;
  totalFees: number;

  // Prize pool
  netPrizePool: number;
  prizePaidOut: number;
  avgPrizePool: number;
  largestPrizePool: number;
}

// Venue-wide rollup for the main Overview + Money Overview cards.
export interface VenueBusinessStats {
  totalPlayers: number;
  totalEvents: number;
  avgAttendance: number;
  largestEvent: number;

  entryCollected: number;
  sidePotsCollected: number;
  addedMoney: number;
  feesByCategory: FeeBuckets;
  totalFees: number;
  netPrizePool: number;
  prizePaidOut: number;
}

// Venue-scoped discovery/engagement counts (from app_events), windowed by period.
export interface DiscoveryCounts {
  views: number;
  directions: number;
  calls: number;
  favorites: number;
  shares: number;
  giveawayViews: number;
}

export const EMPTY_DISCOVERY: DiscoveryCounts = {
  views: 0,
  directions: 0,
  calls: 0,
  favorites: 0,
  shares: 0,
  giveawayViews: 0,
};

export const EMPTY_VENUE_BUSINESS_STATS: VenueBusinessStats = {
  totalPlayers: 0,
  totalEvents: 0,
  avgAttendance: 0,
  largestEvent: 0,
  entryCollected: 0,
  sidePotsCollected: 0,
  addedMoney: 0,
  feesByCategory: EMPTY_FEE_BUCKETS,
  totalFees: 0,
  netPrizePool: 0,
  prizePaidOut: 0,
};
