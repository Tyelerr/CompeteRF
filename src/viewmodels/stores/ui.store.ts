import { create } from "zustand";
import { Language } from "../../models/types/common.types";

interface UIState {
  language: Language;
  isFilterModalOpen: boolean;
  isTournamentModalOpen: boolean;
  selectedTournamentId: number | null;

  setLanguage: (language: Language) => void;
  openFilterModal: () => void;
  closeFilterModal: () => void;
  openTournamentModal: (tournamentId: number) => void;
  closeTournamentModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  language: "en",
  isFilterModalOpen: false,
  isTournamentModalOpen: false,
  selectedTournamentId: null,

  setLanguage: (language) => set({ language }),
  openFilterModal: () => set({ isFilterModalOpen: true }),
  closeFilterModal: () => set({ isFilterModalOpen: false }),
  openTournamentModal: (tournamentId) =>
    set({ isTournamentModalOpen: true, selectedTournamentId: tournamentId }),
  closeTournamentModal: () =>
    set({ isTournamentModalOpen: false, selectedTournamentId: null }),
}));
