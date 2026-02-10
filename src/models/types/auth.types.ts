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
