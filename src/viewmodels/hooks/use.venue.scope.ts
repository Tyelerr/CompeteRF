// src/viewmodels/hooks/use.venue.scope.ts
// The shared admin-aware venue scope for viewmodels (see src/utils/venue-scope.ts):
// admins → every venue; everyone else → only the venues they own or direct. Reads the single
// auth source of truth (auth store, hydrated by get_auth_session), so no screen re-derives it.

import { useMemo } from "react";
import { venueService } from "../../models/services/venue.service";
import { isAdminRole, resolveVenueScope, venueInScope } from "../../utils/venue-scope";
import { useAuthStore } from "../stores/auth.store";

export function useVenueScope() {
  const role = useAuthStore((s) => s.profile?.role ?? null);
  const myIdAuto = useAuthStore((s) => s.profile?.id_auto ?? null);
  const ownedVenueIds = useAuthStore((s) => s.ownedVenueIds);
  const directedVenueIds = useAuthStore((s) => s.directedVenueIds);

  const scope = useMemo(
    () => resolveVenueScope({ role, ownedVenueIds, directedVenueIds }),
    [role, ownedVenueIds, directedVenueIds],
  );

  return {
    isAdmin: isAdminRole(role),
    role,
    myIdAuto,
    ownedVenueIds,
    scope,
    canManageVenue: (venueId: number | null | undefined) => venueInScope(scope, venueId),
    loadVenues: () => venueService.getVenuesInScope(scope),
  };
}
