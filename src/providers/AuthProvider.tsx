// src/providers/AuthProvider.tsx
// ═══════════════════════════════════════════════════════════
// UPDATED: Single auth session hydration via RPC
// UPDATED: App foreground tracking writes last_active_at to profiles
// UPDATED: First-time onboarding — navigates to billiards on Get Started
// ═══════════════════════════════════════════════════════════

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import { router } from 'expo-router';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { profileService } from '../models/services/profile.service';
import { playerRegistrationService } from '../models/services/player.registration.service';
import { AuthStatus } from '../models/types/auth.types';
import { Profile, ProfileInsert } from '../models/types/profile.types';
import { deriveAuthStatus } from '../utils/auth-routing';
import { useNotifications } from '../viewmodels/hooks/use.notifications';
import { useOnboarding } from '../viewmodels/hooks/useOnboarding';
import { useAuthStore } from '../viewmodels/stores/auth.store';
import { OnboardingModal } from '../views/components/onboarding/OnboardingModal';

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
  resolveAuthStatus: (userId: string, opts?: { force?: boolean }) => Promise<AuthStatus>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  createProfile: (profileData: ProfileInsert) => Promise<void>;
  replayOnboarding: () => Promise<void>;
}

const SUBMIT_ALLOWED_ROLES = [
  'tournament_director',
  'bar_owner',
  'compete_admin',
  'super_admin',
];

const ADMIN_ROLES = ['compete_admin', 'super_admin'];

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
  resolveAuthStatus: async () => 'signedOut',
  refreshProfile: async () => {},
  signOut: async () => {},
  createProfile: async () => {},
  replayOnboarding: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Onboarding ─────────────────────────────────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardingCheckedRef = useRef(false);
  const { checkHasSeenOnboarding, markOnboardingComplete, resetOnboarding } =
    useOnboarding();

  // Called by both Skip (future use) and Get Started
  // Get Started navigates to billiards; skip just closes
  const dismissOnboarding = async (navigateToBilliards = false) => {
    await markOnboardingComplete();
    setShowOnboarding(false);
    if (navigateToBilliards) {
      // Small delay so modal fade-out completes before navigation
      setTimeout(() => {
        router.replace('/(tabs)/billiards' as any);
      }, 300);
    }
  };

  const replayOnboarding = async () => {
    await resetOnboarding();
    setShowOnboarding(true);
  };

  // Zustand store — single source of truth
  const { profile, hydrateSession, setAuthStatus, reset: resetStore } = useAuthStore();

  // ── Generation counter ─────────────────────────────────────────────────────
  const hydrationGenRef = useRef(0);

  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // Check onboarding once when profile is first available after login
  useEffect(() => {
    if (!loading && profile && !onboardingCheckedRef.current) {
      onboardingCheckedRef.current = true;
      checkHasSeenOnboarding().then((seen) => {
        if (!seen) setShowOnboarding(true);
      });
    }
  }, [loading, profile, checkHasSeenOnboarding]);

  // 🔔 Push notification registration
  const { pushToken } = useNotifications(profile ? user?.id : undefined);

  // ── Last-active tracking ───────────────────────────────────────────────────
  const lastActivePingRef = useRef<number>(0);

  const pingLastActive = async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    const now = Date.now();
    if (now - lastActivePingRef.current < 60_000) return;
    lastActivePingRef.current = now;
    try {
      await supabase
        .from('profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', uid);
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    pingLastActive();
    if (Platform.OS === 'web') return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') pingLastActive();
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // ── Disabled user check ───────────────────────────────────────────────────
  const checkDisabledAndEject = async (profileData: any): Promise<boolean> => {
    if (profileData?.is_disabled === true) {
      hydrateSession(null, [], []);
      setLoading(false);
      Alert.alert(
        'Account Disabled',
        'Your account has been disabled. Contact support at support@competerf.com.',
        [
          {
            text: 'OK',
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
  // In-flight hydration per user. At launch both getSession() and the listener's
  // INITIAL_SESSION event hydrate the same user; sharing the request avoids a second
  // get_auth_session round trip that would supersede (and delay) the first.
  const inflightHydrationRef = useRef<{ userId: string; promise: Promise<AuthStatus> } | null>(null);

  // Resolves to the account's post-auth status (src/utils/auth-routing.ts) once hydration
  // settles — the single input to post-sign-in routing for every sign-in method.
  const hydrateAuthSession = (userId: string, opts?: { force?: boolean }): Promise<AuthStatus> => {
    const inflight = inflightHydrationRef.current;
    if (!opts?.force && inflight && inflight.userId === userId) return inflight.promise;
    const promise = runHydration(userId).finally(() => {
      if (inflightHydrationRef.current?.promise === promise) inflightHydrationRef.current = null;
    });
    inflightHydrationRef.current = { userId, promise };
    return promise;
  };

  // One retry on a failed RPC (e.g. iOS "The network connection was lost" on a dropped
  // keep-alive socket) before the profiles-only fallback, which has no venue ids and would
  // leave owner/director permissions empty until the next hydration.
  const fetchAuthSession = async () => {
    const first = await supabase.rpc('get_auth_session');
    if (!first.error) return first;
    console.warn('Auth session RPC error, retrying once:', first.error);
    return supabase.rpc('get_auth_session');
  };

  // A newer hydration superseded this one: report whatever that newer run settles on.
  const supersededStatus = (): Promise<AuthStatus> =>
    inflightHydrationRef.current?.promise ?? Promise.resolve(useAuthStore.getState().authStatus);

  // Applies a SUCCESSFUL load (RPC or fallback): no row → needsProfile, disabled → eject,
  // otherwise the profile is hydrated. Returns the resulting status.
  const applyLoadedProfile = async (
    profileData: Profile | null,
    ownedVenueIds: number[],
    directedVenueIds: number[],
  ): Promise<AuthStatus> => {
    const status = deriveAuthStatus({ kind: 'loaded', profile: profileData });
    if (status === 'needsProfile') {
      hydrateSession(null, [], []);
    } else if (status === 'disabled') {
      await checkDisabledAndEject(profileData);
    } else {
      hydrateSession(profileData, ownedVenueIds, directedVenueIds);
    }
    setAuthStatus(status);
    return status;
  };

  // Both the RPC and the fallback failed. The profile may well exist, so this is 'error' —
  // never 'needsProfile' (which would send an existing account to complete-profile).
  const applyLoadFailure = (): AuthStatus => {
    const status = deriveAuthStatus({ kind: 'failed' });
    hydrateSession(null, [], []);
    setAuthStatus(status);
    return status;
  };

  const runHydration = async (userId: string): Promise<AuthStatus> => {
    const myGen = ++hydrationGenRef.current;
    try {
      const { data, error } = await fetchAuthSession();
      if (myGen !== hydrationGenRef.current) return supersededStatus();
      if (error) {
        console.error('Auth session RPC error:', error);
        return await fallbackFetchProfile(userId, myGen);
      }
      if (!data) return applyLoadFailure();
      const status = await applyLoadedProfile(
        (data.profile as Profile | null) ?? null,
        data.owned_venue_ids || [],
        data.directed_venue_ids || [],
      );
      if (status !== 'ready') return status;
      pingLastActive();
      // Phase 5: best-effort self-heal — link any PENDING player owned by this
      // account's verified email to the profile (idempotent; no-op if already
      // linked or the email is unverified). Fire-and-forget: never blocks or
      // breaks hydration. This is the fallback repair path complementing the
      // auth.users email-confirmation trigger.
      playerRegistrationService.claimPendingPlayer().catch(() => {});
      return status;
    } catch (error) {
      console.error('Auth session hydration error:', error);
      if (myGen !== hydrationGenRef.current) return supersededStatus();
      return await fallbackFetchProfile(userId, myGen);
    } finally {
      if (myGen === hydrationGenRef.current) setLoading(false);
    }
  };

  const fallbackFetchProfile = async (userId: string, gen: number): Promise<AuthStatus> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (gen !== hydrationGenRef.current) return supersededStatus();
      if (error) throw error;
      // The query succeeded, so a missing row really means no profile yet.
      return await applyLoadedProfile((data as Profile | null) ?? null, [], []);
    } catch (error) {
      console.error('Fallback profile fetch error:', error);
      if (gen !== hydrationGenRef.current) return supersededStatus();
      return applyLoadFailure();
    } finally {
      if (gen === hydrationGenRef.current) setLoading(false);
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
        setAuthStatus(deriveAuthStatus({ kind: 'noSession' }));
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      // A token refresh for the user we already hydrated doesn't change their profile / role,
      // so don't re-run the session RPC once their profile is loaded (it would also supersede
      // any in-flight hydration). If hydration had failed, the refresh still retries it.
      if (
        event === 'TOKEN_REFRESHED' &&
        session?.user &&
        useAuthStore.getState().profile?.id === session.user.id
      ) {
        return;
      }
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
    if (id) await hydrateAuthSession(id, { force: true });
  };

  // Post-sign-in: the settled status for this user. Shares the in-flight hydration that the
  // SIGNED_IN event already started (no second RPC) unless `force` (e.g. right after the
  // profile row was just created).
  const resolveAuthStatus = (userId: string, opts?: { force?: boolean }) =>
    hydrateAuthSession(userId, { force: opts?.force });

  // ── Create profile ────────────────────────────────────────────────────────
  const createProfile = async (profileData: ProfileInsert) => {
    try {
      await profileService.createProfile(profileData);
      if (user?.id) await hydrateAuthSession(user.id, { force: true });
    } catch (error) {
      console.error('Create profile error:', error);
      throw error;
    }
  };

  // ── Sign out ──────────────────────────────────────────────────────────────
  const signOut = async () => {
    // Deactivate ONLY this device's push token (before the session ends — RLS needs it). The
    // account's other devices keep receiving notifications.
    if (user?.id && pushToken) {
      try {
        const { notificationService } =
          await import('../models/services/notification.service');
        await notificationService.deactivateDeviceToken(user.id, pushToken);
      } catch (err) {
        console.error('Error deactivating push token on sign out:', err);
      }
    }
    onboardingCheckedRef.current = false;
    setShowOnboarding(false);
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
    resolveAuthStatus,
    refreshProfile: refreshSession,
    signOut,
    createProfile,
    replayOnboarding,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <OnboardingModal
        visible={showOnboarding}
        onComplete={() => dismissOnboarding(true)}
        onSkip={() => dismissOnboarding(false)}
      />
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => useContext(AuthContext);
export const useAuth = useAuthContext;
