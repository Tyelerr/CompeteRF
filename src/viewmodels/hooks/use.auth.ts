// src/viewmodels/hooks/use.auth.ts
// ═══════════════════════════════════════════════════════════
// UPDATED: No longer fetches profile independently.
// Reads from Zustand store (populated by AuthProvider).
// This was the source of the double-fetch problem.
//
// WHAT CHANGED:
// - Removed the useEffect that called profileService.getProfile()
// - All data now comes from useAuthStore (single source of truth)
// - signUp/signIn/signOut still work the same
// - updateProfile now calls refreshSession to re-hydrate
// ═══════════════════════════════════════════════════════════

import { authService } from "../../models/services/auth.service";
import { profileService } from "../../models/services/profile.service";
import { ProfileInsert } from "../../models/types/profile.types";
import { useAuthContext } from "../../providers/AuthProvider";
import { useAuthStore } from "../stores/auth.store";

export const useAuth = () => {
  const { user, loading, refreshSession, signOut: contextSignOut } = useAuthContext();
  const { profile, isAuthenticated, ownedVenueIds, directedVenueIds } = useAuthStore();

  const signUp = async (email: string, password: string) => {
    const data = await authService.signUp(email, password);
    return data;
  };

  const signIn = async (email: string, password: string) => {
    const data = await authService.signIn(email, password);
    // Session hydration happens automatically via onAuthStateChange
    return data;
  };

  const signOut = async () => {
    await contextSignOut();
  };

  const createProfile = async (profileData: ProfileInsert) => {
    const newProfile = await profileService.createProfile(profileData);
    // Re-hydrate the full session (gets venue IDs too)
    await refreshSession();
    return newProfile;
  };

  const updateProfile = async (updates: Partial<ProfileInsert>) => {
    if (!user) throw new Error("No user logged in");
    const updatedProfile = await profileService.updateProfile(user.id, updates);
    // Re-hydrate so Zustand store has the latest
    await refreshSession();
    return updatedProfile;
  };

  return {
    user,
    profile,
    isAuthenticated,
    isLoading: loading,
    ownedVenueIds,      // NEW: available everywhere now
    directedVenueIds,   // NEW: available everywhere now
    signUp,
    signIn,
    signOut,
    createProfile,
    updateProfile,
    refreshSession,     // NEW: re-hydrate the full session
  };
};
