// src/viewmodels/stores/auth.store.ts
// ═══════════════════════════════════════════════════════════
// UPDATED: Now stores the full auth session (profile + venue IDs)
// This is the SINGLE source of truth for auth state.
// ═══════════════════════════════════════════════════════════

import { create } from "zustand";
import { Profile } from "../../models/types/profile.types";

interface AuthState {
  // ── Core session data ──────────────────────────────────
  profile: Profile | null;
  ownedVenueIds: number[];     // NEW: venue IDs this user owns
  directedVenueIds: number[];  // NEW: venue IDs this user directs
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionHydrated: boolean;    // NEW: true once RPC has completed

  // ── Actions ────────────────────────────────────────────
  /**
   * Called ONCE on login/app load after the RPC returns.
   * Sets profile + venue IDs in one shot.
   */
  hydrateSession: (
    profile: Profile | null,
    ownedVenueIds?: number[],
    directedVenueIds?: number[],
  ) => void;

  /** Update just the profile (e.g., after editing profile) */
  setProfile: (profile: Profile | null) => void;

  /** Update venue IDs (e.g., after a venue assignment changes) */
  setVenueIds: (owned: number[], directed: number[]) => void;

  setIsLoading: (value: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // ── Initial state ──────────────────────────────────────
  profile: null,
  ownedVenueIds: [],
  directedVenueIds: [],
  isAuthenticated: false,
  isLoading: true,
  sessionHydrated: false,

  // ── Actions ────────────────────────────────────────────
  hydrateSession: (profile, ownedVenueIds = [], directedVenueIds = []) =>
    set({
      profile,
      ownedVenueIds,
      directedVenueIds,
      isAuthenticated: !!profile,
      isLoading: false,
      sessionHydrated: true,
    }),

  setProfile: (profile) =>
    set({ profile, isAuthenticated: !!profile }),

  setVenueIds: (owned, directed) =>
    set({ ownedVenueIds: owned, directedVenueIds: directed }),

  setIsLoading: (value) => set({ isLoading: value }),

  reset: () =>
    set({
      profile: null,
      ownedVenueIds: [],
      directedVenueIds: [],
      isAuthenticated: false,
      isLoading: false,
      sessionHydrated: false,
    }),
}));
