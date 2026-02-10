// src/viewmodels/hooks/use.permissions.ts
// ═══════════════════════════════════════════════════════════
// UPDATED: Now includes venue-aware permission checks.
//
// WHAT CHANGED:
// - Added ownsVenue(), directsVenue(), canManageVenue()
//   These use the preloaded venue IDs from the auth session
//   instead of making separate Supabase queries.
// - Added canSubmitTournaments, canManageGiveaways, etc.
// - Everything else is the same.
// ═══════════════════════════════════════════════════════════

import { Permission, PERMISSIONS } from "../../permissions/permissions";
import { Role, ROLE_HIERARCHY } from "../../permissions/roles";
import { useAuthStore } from "../stores/auth.store";

export const usePermissions = () => {
  const { profile, ownedVenueIds, directedVenueIds } = useAuthStore();
  const userRole = profile?.role as Role | undefined;

  // ── Existing role checks (unchanged) ───────────────────
  const hasPermission = (permission: Permission): boolean => {
    if (!userRole) return false;
    const allowedRoles = PERMISSIONS[permission] as readonly string[];
    return allowedRoles.includes(userRole);
  };

  const hasRole = (role: Role): boolean => {
    if (!userRole) return false;
    return userRole === role;
  };

  const hasRoleOrHigher = (role: Role): boolean => {
    if (!userRole) return false;
    const roleIndex = ROLE_HIERARCHY.indexOf(role);
    const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
    return userRoleIndex >= roleIndex;
  };

  const isBasicUser = userRole === "basic_user";
  const isTournamentDirector = userRole === "tournament_director";
  const isBarOwner = userRole === "bar_owner";
  const isCompeteAdmin = userRole === "compete_admin";
  const isSuperAdmin = userRole === "super_admin";
  const isAdmin = isCompeteAdmin || isSuperAdmin;

  // ── NEW: Venue-aware permission checks ─────────────────
  // These use the preloaded venue IDs from the auth session.
  // No extra Supabase queries needed.

  /** Does this user own the given venue? */
  const ownsVenue = (venueId: number): boolean => {
    if (isAdmin) return true; // admins can manage any venue
    return ownedVenueIds.includes(venueId);
  };

  /** Is this user a director at the given venue? */
  const directsVenue = (venueId: number): boolean => {
    if (isAdmin) return true;
    return directedVenueIds.includes(venueId);
  };

  /**
   * Can this user manage (edit/post tournaments at) the given venue?
   * True for: admins, venue owners, assigned directors
   */
  const canManageVenue = (venueId: number): boolean => {
    if (isAdmin) return true;
    return ownedVenueIds.includes(venueId) || directedVenueIds.includes(venueId);
  };

  /** All venue IDs this user has ANY access to */
  const accessibleVenueIds = isAdmin
    ? [] // admins don't need a list — they can access everything
    : [...new Set([...ownedVenueIds, ...directedVenueIds])];

  // ── NEW: Convenience booleans ──────────────────────────
  const canSubmitTournaments =
    isTournamentDirector || isBarOwner || isAdmin;

  const canManageGiveaways = isAdmin;

  const canManageUsers = isAdmin;

  const canManageDirectors =
    isBarOwner || isAdmin;

  return {
    // Role checks (existing)
    userRole,
    hasPermission,
    hasRole,
    hasRoleOrHigher,
    isBasicUser,
    isTournamentDirector,
    isBarOwner,
    isCompeteAdmin,
    isSuperAdmin,
    isAdmin,

    // Venue checks (NEW)
    ownsVenue,
    directsVenue,
    canManageVenue,
    accessibleVenueIds,
    ownedVenueIds,
    directedVenueIds,

    // Convenience booleans (NEW)
    canSubmitTournaments,
    canManageGiveaways,
    canManageUsers,
    canManageDirectors,
  };
};
