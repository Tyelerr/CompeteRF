// src/providers/AuthProvider.tsx
// ═══════════════════════════════════════════════════════════
// UPDATED: Single auth session hydration via RPC
// UPDATED: App foreground tracking writes last_active_at to profiles
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
import { Alert, AppState, AppStateStatus, Platform } from "react-native";
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

  // ── Generation counter ─────────────────────────────────────────────────────
  const hydrationGenRef = useRef(0);

  // Keep a ref to the current user id so the AppState handler can read it
  // without closing over a stale value.
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // 🔔 Push notification registration
  const { pushToken } = useNotifications(profile ? user?.id : undefined);

  // ── Last-active tracking ───────────────────────────────────────────────────
  // Write last_active_at on every app foreground event and on initial mount.
  // Uses a simple debounce so rapid foreground/background cycles don't spam
  // the database — at most one write per 60 seconds per session.
  const lastActivePingRef = useRef<number>(0);

  const pingLastActive = async () => {
    const uid = userIdRef.current;
    if (!uid) return;

    const now = Date.now();
    if (now - lastActivePingRef.current < 60_000) return; // 60 s debounce
    lastActivePingRef.current = now;

    try {
      await supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", uid);
    } catch {
      // Non-critical — silently ignore
    }
  };

  useEffect(() => {
    // Write on mount (first foreground)
    pingLastActive();

    if (Platform.OS === "web") return; // AppState not meaningful on web

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        pingLastActive();
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  // ── Disabled user check ───────────────────────────────────────────────────
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

  // ── Session hydration via RPC ─────────────────────────────────────────────
  const hydrateAuthSession = async (userId: string) => {
    const myGen = ++hydrationGenRef.current;

    try {
      const { data, error } = await supabase.rpc("get_auth_session");

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

      if (myGen !== hydrationGenRef.current) return;

      hydrateSession(
        data.profile as Profile,
        data.owned_venue_ids || [],
        data.directed_venue_ids || [],
      );

      // Ping last active after successful hydration
      pingLastActive();
    } catch (error) {
      console.error("Auth session hydration error:", error);
      if (myGen !== hydrationGenRef.current) return;
      await fallbackFetchProfile(userId, myGen);
    } finally {
      if (myGen === hydrationGenRef.current) {
        setLoading(false);
      }
    }
  };

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

  // ── Auth state listener ───────────────────────────────────────────────────
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

  // ── Refresh ───────────────────────────────────────────────────────────────
  const refreshSession = async (forceUserId?: string) => {
    const id = forceUserId ?? user?.id;
    if (id) await hydrateAuthSession(id);
  };

  // ── Create profile ────────────────────────────────────────────────────────
  const createProfile = async (profileData: ProfileInsert) => {
    try {
      await profileService.createProfile(profileData);
      if (user?.id) await hydrateAuthSession(user.id);
    } catch (error) {
      console.error("Create profile error:", error);
      throw error;
    }
  };

  // ── Sign out ──────────────────────────────────────────────────────────────
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

  // ── Context value ─────────────────────────────────────────────────────────
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
