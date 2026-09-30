// src/models/types/auth.types.ts
// ═══════════════════════════════════════════════════════════
// NEW FILE: Auth session types
// Defines the shape of the hydrated auth session
// ═══════════════════════════════════════════════════════════

import { Profile } from "./profile.types";
import { UserRole } from "./common.types";

/**
 * The auth session returned by get_auth_session() RPC.
 * This is the SINGLE source of truth for "who is logged in
 * and what can they access?"
 */
export interface AuthSession {
  profile: Profile | null;
  owned_venue_ids: number[];   // venues this user owns (bar owners)
  directed_venue_ids: number[]; // venues this user directs (TDs)
}

/**
 * Raw shape from Supabase RPC (before we parse it).
 * Profile comes as a JSON object, venue IDs as JSON arrays.
 */
export interface AuthSessionRaw {
  profile: Record<string, any> | null;
  owned_venue_ids: number[];
  directed_venue_ids: number[];
}

/**
 * Computed permissions derived from the session.
 * These are NOT stored — they're computed on the fly by use.permissions.ts.
 */
export interface ComputedPermissions {
  role: UserRole | null;
  isAuthenticated: boolean;
  isBasicUser: boolean;
  isTournamentDirector: boolean;
  isBarOwner: boolean;
  isCompeteAdmin: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canSubmitTournaments: boolean;
  ownsVenue: (venueId: number) => boolean;
  directsVenue: (venueId: number) => boolean;
  canManageVenue: (venueId: number) => boolean;
}

/**
 * Where the signed-in account stands after hydration — shared by every sign-in method
 * (password, username, Apple, Google). Derived by deriveAuthStatus (src/utils/auth-routing.ts).
 * - loading      : hydration has not finished yet (app start)
 * - signedOut    : no session
 * - needsProfile : session, and hydration SUCCEEDED and found no profile row → complete-profile
 * - disabled     : session + profile with is_disabled → existing eject / sign-out
 * - ready        : session + usable profile → the app
 * - error        : session, but hydration FAILED — the profile may well exist, so this must
 *                  never be treated as "no profile" (never routes to complete-profile)
 */
export type AuthStatus = "loading" | "signedOut" | "needsProfile" | "disabled" | "ready" | "error";

/** Optional name prefill a provider hands to /auth/complete-profile (never a username). */
export interface AuthNameHints {
  firstName?: string | null;
  lastName?: string | null;
}

/** A provider sign-in that produced a Supabase session. */
export interface SocialSignInResult {
  userId: string;
  nameHints?: AuthNameHints;
}

/** Result of asking the native Google provider for an ID token. */
export type GoogleIdTokenResult =
  | { type: "success"; idToken: string; givenName: string | null; familyName: string | null }
  | { type: "cancelled" };

/**
 * Native Google sign-in boundary. The ONLY code that may import the Google native library is
 * src/models/services/google-signin.provider.native.ts; everything else (web included) goes
 * through this interface, so the native module can never reach the React Native Web bundle.
 */
export interface GoogleSignInProvider {
  /** False on web, in Expo Go, and wherever the native module / Play services are missing. */
  isAvailable(): Promise<boolean>;
  /**
   * Opens Google's account chooser and returns an ID token whose `nonce` claim is exactly
   * `nonceDigest` (the SHA-256 hex of the raw nonce later passed to Supabase).
   */
  getIdToken(nonceDigest: string): Promise<GoogleIdTokenResult>;
  /** Clears Google's cached credential so the next sign-in shows the chooser again. */
  signOut(): Promise<void>;
}
