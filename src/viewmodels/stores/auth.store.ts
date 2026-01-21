import { create } from "zustand";
import { Profile } from "../../models/types/profile.types";

interface AuthState {
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setProfile: (profile: Profile | null) => void;
  setIsAuthenticated: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  isAuthenticated: false,
  isLoading: true,

  setProfile: (profile) => set({ profile, isAuthenticated: !!profile }),
  setIsAuthenticated: (value) => set({ isAuthenticated: value }),
  setIsLoading: (value) => set({ isLoading: value }),
  reset: () => set({ profile: null, isAuthenticated: false, isLoading: false }),
}));
