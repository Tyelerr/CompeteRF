// src/providers/AuthProvider.tsx
// ═══════════════════════════════════════════════════════════
// UPDATED: Single auth session hydration via RPC
//
// WHAT CHANGED:
// - Replaced fetchProfile() with hydrateAuthSession()
//   that calls get_auth_session() RPC (1 query instead of 1)
// - Populates Zustand store directly (kills the double fetch)
// - Context still exists for backward compat but reads from store
// - Push notifications still work exactly the same
// ═══════════════════════════════════════════════════════════

import { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { profileService } from "../models/services/profile.service";
import { Profile, ProfileInsert } from "../models/types/profile.types";
import { useNotifications } from "../viewmodels/hooks/use.notifications";
import { useAuthStore } from "../viewmodels/stores/auth.store";

// ── Context type (kept for backward compat) ────────────────
interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  canSubmitTournaments: boolean;
  isAdmin: boolean;
  pushToken: string | null;
  refreshSession: () => Promise<void>; // renamed from refreshProfile
  refreshProfile: () => Promise<void>; // kept for backward compat
  signOut: () => Promise<void>;
  createProfile: (profileData: ProfileInsert) => Promise<void>;
}

const SUBMIT_ALLOWED_ROLES = [
  "tournament_director",
  "bar_owner",
  "compete_admin",
  "super_admin",
];

const ADMIN_ROLES = ["compete_admin", "super_admin"];

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isAuthenticated: false,
  canSubmitTournaments: false,
  isAdmin: false,
  pushToken: null,
  refreshSession: async () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
  createProfile: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Zustand store — single source of truth
  const { profile, hydrateSession, reset: resetStore } = useAuthStore();

  // 🔔 Push notification registration
  const { pushToken } = useNotifications(user?.id);

  // ── Session hydration via RPC ──────────────────────────
  const hydrateAuthSession = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc("get_auth_session");

      if (error) {
        console.error("Auth session RPC error:", error);
        // Fallback: fetch profile directly (in case RPC isn't deployed yet)
        await fallbackFetchProfile(userId);
        return;
      }

      if (!data || !data.profile) {
        // New user — no profile yet
        hydrateSession(null, [], []);
        return;
      }

      // Hydrate the Zustand store with everything from one call
      hydrateSession(
        data.profile as Profile,
        data.owned_venue_ids || [],
        data.directed_venue_ids || [],
      );
    } catch (error) {
      console.error("Auth session hydration error:", error);
      await fallbackFetchProfile(userId);
    } finally {
      setLoading(false);
    }
  };

  // Fallback in case the RPC isn't deployed yet
  // (remove this once you've confirmed the RPC works)
  const fallbackFetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      hydrateSession(data as Profile | null, [], []);
    } catch (error) {
      console.error("Fallback profile fetch error:", error);
      hydrateSession(null, [], []);
    } finally {
      setLoading(false);
    }
  };

  // ── Auth state listener ────────────────────────────────
  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        hydrateAuthSession(session.user.id);
      } else {
        hydrateSession(null, [], []);
        setLoading(false);
      }
    });

    // Listen for auth changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        hydrateAuthSession(session.user.id);
      } else {
        resetStore();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Refresh the full session (re-calls RPC) ───────────
  const refreshSession = async () => {
    if (user?.id) {
      await hydrateAuthSession(user.id);
    }
  };

  // ── Create profile (new user signup) ───────────────────
  const createProfile = async (profileData: ProfileInsert) => {
    try {
      await profileService.createProfile(profileData);
      // Re-hydrate the full session so venue IDs etc. are loaded
      if (user?.id) {
        await hydrateAuthSession(user.id);
      }
    } catch (error) {
      console.error("Create profile error:", error);
      throw error;
    }
  };

  // ── Sign out ───────────────────────────────────────────
  const signOut = async () => {
    // Clean up push token
    if (user?.id) {
      try {
        const { notificationService } =
          await import("../models/services/notification.service");
        await notificationService.removeUserTokens(user.id);
      } catch (err) {
        console.error("Error removing push tokens on sign out:", err);
      }
    }

    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    resetStore();
  };

  // ── Context value ──────────────────────────────────────
  // Profile is read from Zustand store (single source of truth)
  const value: AuthContextType = {
    session,
    user,
    profile, // ← from Zustand via destructuring above
    loading,
    isAuthenticated: !!profile,
    canSubmitTournaments: profile
      ? SUBMIT_ALLOWED_ROLES.includes(profile.role)
      : false,
    isAdmin: profile ? ADMIN_ROLES.includes(profile.role) : false,
    pushToken,
    refreshSession,
    refreshProfile: refreshSession, // backward compat alias
    signOut,
    createProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => useContext(AuthContext);

// Keep backward compatibility
export const useAuth = useAuthContext;
