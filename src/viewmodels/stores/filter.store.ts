import { create } from "zustand";
import { TournamentFilters } from "../../models/types/tournament.types";

const DEFAULT_FILTERS: TournamentFilters = {
  state: undefined,
  city: undefined,
  zipCode: undefined,
  radius: 25,
  gameType: undefined,
  tournamentFormat: undefined,
  tableSize: undefined,
  equipment: undefined,
  daysOfWeek: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  entryFeeMin: 0,
  entryFeeMax: 1000,
  fargoMin: 0,
  fargoMax: 900,
  reportsToFargo: undefined,
  openTournament: undefined,
};

interface FilterState {
  filters: TournamentFilters;
  page: number;
  lastActivity: number;

  setFilters: (filters: Partial<TournamentFilters>) => void;
  setFilter: <K extends keyof TournamentFilters>(
    key: K,
    value: TournamentFilters[K],
  ) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  updateActivity: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  page: 1,
  lastActivity: Date.now(),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1,
      lastActivity: Date.now(),
    })),

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
      page: 1,
      lastActivity: Date.now(),
    })),

  resetFilters: () =>
    set({
      filters: DEFAULT_FILTERS,
      page: 1,
      lastActivity: Date.now(),
    }),

  setPage: (page) => set({ page, lastActivity: Date.now() }),

  updateActivity: () => set({ lastActivity: Date.now() }),
}));
