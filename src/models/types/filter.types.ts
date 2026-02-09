// ─── Modal-level filter state ────────────────────────────────────────────────
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
  openTournament: boolean;
}

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
  maxFargo: 900,
  requiresFargoGames: false,
  reportsToFargo: false,
  openTournament: false,
};
