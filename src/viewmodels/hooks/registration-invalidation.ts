// src/viewmodels/hooks/registration-invalidation.ts
// Targeted React Query invalidation after a registration change (self/team register,
// re-register, unregister, cancel). It refreshes ONLY the queries that depend on this
// tournament's roster and on THIS player's own profile buckets — never a broad browse
// reload and never any polling. Keeping the affected key list in one place means the
// self- and team-registration hooks stay in sync without duplicating it.
//
// invalidateQueries is a cheap no-op for a key that isn't currently cached on this
// client, so passing a partial id set (or a key this client never mounted, e.g. the TD
// roster on a player's device) is safe — it marks stale + refetches only what's live.

import { QueryClient } from "@tanstack/react-query";

export const invalidateRegistrationQueries = (
  qc: QueryClient,
  opts: { tournamentId?: number | null; playerId?: number | null },
): void => {
  const { tournamentId, playerId } = opts;
  // Roster for this tournament (TD manage-players + bracket/spectator readers).
  if (tournamentId != null) {
    qc.invalidateQueries({ queryKey: ["registrations", tournamentId] });
  }
  // This player's own views: their registrations list + the profile "Registered" /
  // team / live-participation buckets that a self/team action changes on their client.
  if (playerId != null) {
    qc.invalidateQueries({ queryKey: ["registrations", "player", playerId] });
    qc.invalidateQueries({ queryKey: ["profile-tournaments", playerId] });
    qc.invalidateQueries({ queryKey: ["profile-team-tournaments", playerId] });
    qc.invalidateQueries({ queryKey: ["profile-live-tournament", playerId] });
  }
};
