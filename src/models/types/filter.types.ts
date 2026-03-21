// ─── Modal-level filter state ─────────────────────────────────────────────────
// Used by FilterModal and the billiards viewmodel for client-side filtering.
// Distinct from TournamentFilters in tournament.types.ts which drives the
// service-layer / Supabase queries.

export interface Filters {
  gameType: string;
  tournamentFormat: string;
  tableSize: string;
  equipment: string;
  daysOfWeek: number[];
  fromDate: string;
  toDate: string;
  minEntryFee: number;
  maxEntryFee: number;
  minFargo: number;
  maxFargo: number;
  requiresFargoGames: boolean;
  reportsToFargo: boolean;
  calcutta: boolean;
  openTournament: boolean;
}

const SCOTCH_DOUBLES_TYPES = [
  "8-ball-scotch-doubles",
  "9-ball-scotch-doubles",
  "10-ball-scotch-doubles",
];

// Returns the max Fargo value based on selected game type
// Scotch doubles uses combined team Fargo so the ceiling is much higher
export const getFargoMax = (gameType: string): number => {
  return SCOTCH_DOUBLES_TYPES.includes(gameType) ? 2000 : 1000;
};

export const isScotchDoubles = (gameType: string): boolean => {
  return SCOTCH_DOUBLES_TYPES.includes(gameType);
};

export const defaultFilters: Filters = {
  gameType: "",
  tournamentFormat: "",
  tableSize: "",
  equipment: "",
  daysOfWeek: [],
  fromDate: "",
  toDate: "",
  minEntryFee: 0,
  maxEntryFee: 1000,
  minFargo: 0,
  maxFargo: 1000,
  requiresFargoGames: false,
  reportsToFargo: false,
  calcutta: false,
  openTournament: false,
};

/**
 * Returns the number of non-default filters currently active.
 * Used to drive the "Filters Applied" label in the UI.
 */
export const getActiveFilterCount = (filters: Filters): number => {
  let count = 0;
  if (filters.gameType) count++;
  if (filters.tournamentFormat) count++;
  if (filters.tableSize) count++;
  if (filters.equipment) count++;
  if (filters.daysOfWeek.length > 0) count++;
  if (filters.fromDate) count++;
  if (filters.toDate) count++;
  if (filters.minEntryFee > 0) count++;
  if (filters.maxEntryFee < 1000) count++;
  if (filters.minFargo > 0) count++;
  if (filters.maxFargo < 1000) count++;
  if (filters.requiresFargoGames) count++;
  if (filters.reportsToFargo) count++;
  if (filters.calcutta) count++;
  if (filters.openTournament) count++;
  return count;
};

