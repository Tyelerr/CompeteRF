// src/providers/AuthProvider.tsx
// ═══════════════════════════════════════════════════════════
// UPDATED: Single auth session hydration via RPC
//
// WHAT CHANGED (original):
// - Replaced fetchProfile() with hydrateAuthSession()
//   that calls get_auth_session() RPC (1 query instead of 1)
// - Populates Zustand store directly (kills the double fetch)
// - Context still exists for backward compat but reads from store
// - Push notifications wait for profile to exist before registering
//
// WHAT CHANGED (App Store compliance):
// - After profile fetch, checks is_disabled flag
// - If disabled → shows Alert + signs out immediately
//
// WHAT CHANGED (race condition fix — generation counter):
// - hydrateAuthSession() now uses a generation counter (hydrationGenRef).
// - On signup, onAuthStateChange fires and starts Call A before the profile
//   exists in the DB. The register screen then creates the profile and calls
//   refreshSession(), which starts Call B. Call B finds the profile and sets
//   the store correctly — but Call A is still in flight. When Call A finishes
//   it would overwrite the store with null, wiping out Call B's result.
// - The counter increments on every new hydrateAuthSession call. Each call
//   captures its own generation number. Before writing to the store, it checks
//   whether it is still the most recent call. If not, it discards the result.
//   This means Call A can never overwrite a more recent Call B result.
//
// WHAT CHANGED (refreshSession forceUserId):
// - refreshSession() accepts optional forceUserId so the register screen can
//   pass authData.user.id directly, bypassing stale React state.
// ═══════════════════════════════════════════════════════════

import { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { profileService } from "../models/services/profile.service";
import { Profile, ProfileInsert } from "../models/types/profile.types";
import { useNotifications } from "../viewmodels/hooks/use.notifications";
import { useAuthStore } from "../viewmodels/stores/auth.store";

// ── Context type ───────────────────────────────────────────
interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  canSubmitTournaments: boolean;
  isAdmin: boolean;
  pushToken: string | null;
  refreshSession: (forceUserId?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
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

  // ── Generation counter ─────────────────────────────────────────────
  // Incremented on every hydrateAuthSession() call. Each call captures
  // its own generation number and checks it before writing to the store.
  // This ensures a slow, stale hydration (e.g. onAuthStateChange during
  // signup before the profile exists) can never overwrite a more recent
  // successful hydration (e.g. refreshSession after profile is created).
  const hydrationGenRef = useRef(0);

  // 🔔 Push notification registration
  const { pushToken } = useNotifications(profile ? user?.id : undefined);

  // ── Disabled user check ───────────────────────────────────────────
  const checkDisabledAndEject = async (profileData: any): Promise<boolean> => {
    if (profileData?.is_disabled === true) {
      hydrateSession(null, [], []);
      setLoading(false);
      Alert.alert(
        "Account Disabled",
        "Your account has been disabled. Contact support at support@competerf.com.",
        [
          {
            text: "OK",
            onPress: async () => {
              await supabase.auth.signOut();
              setSession(null);
              setUser(null);
              resetStore();
            },
          },
        ],
        { cancelable: false },
      );
      return true;
    }
    return false;
  };

  // ── Session hydration via RPC ──────────────────────────────────────
  const hydrateAuthSession = async (userId: string) => {
    // Capture this call's generation. If a newer call starts before
    // this one finishes, myGen will no longer equal hydrationGenRef.current
    // and we discard our result rather than overwriting the newer one.
    const myGen = ++hydrationGenRef.current;

    try {
      const { data, error } = await supabase.rpc("get_auth_session");

      // A newer hydration has started — this result is stale, discard it
      if (myGen !== hydrationGenRef.current) return;

      if (error) {
        console.error("Auth session RPC error:", error);
        await fallbackFetchProfile(userId, myGen);
        return;
      }

      if (!data || !data.profile) {
        hydrateSession(null, [], []);
        return;
      }

      const wasDisabled = await checkDisabledAndEject(data.profile);
      if (wasDisabled) return;

      // Check generation again after the async disabled check
      if (myGen !== hydrationGenRef.current) return;

      hydrateSession(
        data.profile as Profile,
        data.owned_venue_ids || [],
        data.directed_venue_ids || [],
      );
    } catch (error) {
      console.error("Auth session hydration error:", error);
      if (myGen !== hydrationGenRef.current) return;
      await fallbackFetchProfile(userId, myGen);
    } finally {
      // Only update loading state if this is still the current hydration
      if (myGen === hydrationGenRef.current) {
        setLoading(false);
      }
    }
  };

  // Fallback in case the RPC isn't deployed yet
  const fallbackFetchProfile = async (userId: string, gen: number) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (gen !== hydrationGenRef.current) return;
      if (error) throw error;

      const wasDisabled = await checkDisabledAndEject(data);
      if (wasDisabled) return;

      if (gen !== hydrationGenRef.current) return;

      hydrateSession(data as Profile | null, [], []);
    } catch (error) {
      console.error("Fallback profile fetch error:", error);
      if (gen !== hydrationGenRef.current) return;
      hydrateSession(null, [], []);
    } finally {
      if (gen === hydrationGenRef.current) {
        setLoading(false);
      }
    }
  };

  // ── Auth state listener ────────────────────────────────────────────
  useEffect(() => {
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

  // ── Refresh ────────────────────────────────────────────────────────
  const refreshSession = async (forceUserId?: string) => {
    const id = forceUserId ?? user?.id;
    if (id) {
      await hydrateAuthSession(id);
    }
  };

  // ── Create profile ─────────────────────────────────────────────────
  const createProfile = async (profileData: ProfileInsert) => {
    try {
      await profileService.createProfile(profileData);
      if (user?.id) {
        await hydrateAuthSession(user.id);
      }
    } catch (error) {
      console.error("Create profile error:", error);
      throw error;
    }
  };

  // ── Sign out ───────────────────────────────────────────────────────
  const signOut = async () => {
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

  // ── Context value ──────────────────────────────────────────────────
  const value: AuthContextType = {
    session,
    user,
    profile,
    loading,
    isAuthenticated: !!profile,
    canSubmitTournaments: profile
      ? SUBMIT_ALLOWED_ROLES.includes(profile.role)
      : false,
    isAdmin: profile ? ADMIN_ROLES.includes(profile.role) : false,
    pushToken,
    refreshSession,
    refreshProfile: refreshSession,
    signOut,
    createProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => useContext(AuthContext);
export const useAuth = useAuthContext;
