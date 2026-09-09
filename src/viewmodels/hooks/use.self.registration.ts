// src/viewmodels/hooks/use.self.registration.ts
// Lets a logged-in player register THEMSELVES for a tournament from the public
// detail modal. Loads the player's existing registration (if any) so the UI can
// show "Register" vs "✓ Registered", and self-registers as `preregistered`
// (NOT checked in — only the TD checks players in on tournament day).

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { registrationService } from "../../models/services/registration.service";
import { Registration } from "../../models/types/registration.types";
import { invalidateRegistrationQueries } from "./registration-invalidation";

export const useSelfRegistration = (
  tournamentId?: number,
  playerId?: number,
) => {
  const queryClient = useQueryClient();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [unregistering, setUnregistering] = useState(false);

  const refresh = useCallback(async () => {
    if (!tournamentId || !playerId) {
      setRegistration(null);
      return;
    }
    setLoading(true);
    try {
      const r = await registrationService.getPlayerRegistrationForTournament(
        tournamentId,
        playerId,
      );
      setRegistration(r);
    } catch {
      setRegistration(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, playerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Active = has a row that isn't cancelled.
  const isRegistered = !!registration && registration.status !== "cancelled";

  // Self-register as preregistered (Pending Approval). The player may SUGGEST
  // their Fargo — it's stored only on the registration (fargo_rating) as a hint
  // for the TD, and NEVER written to their profile. The TD confirms/edits it at
  // approval, and only that confirmed value becomes the verified profile Fargo.
  // Re-uses an existing (e.g. cancelled) row to satisfy the
  // (tournament_id, player_id) unique index. Throws on failure.
  const register = useCallback(
    async (fargo?: number | null) => {
      if (!tournamentId || !playerId) return;
      setRegistering(true);
      try {
        let r: Registration;
        if (registration) {
          r = await registrationService.reRegister(registration.id);
          if (fargo != null) {
            r = await registrationService.updateRegistration(registration.id, {
              fargo_rating: fargo,
            });
          }
        } else {
          r = await registrationService.register({
            tournament_id: tournamentId,
            player_id: playerId,
            fargo_rating: fargo ?? null,
          });
        }
        setRegistration(r);
        // Targeted refresh: this player's profile buckets + the tournament roster now
        // reflect the new registration without a manual pull-to-refresh.
        invalidateRegistrationQueries(queryClient, { tournamentId, playerId });
      } finally {
        setRegistering(false);
      }
    },
    [tournamentId, playerId, registration, queryClient],
  );

  // Self-service unregister: SOFT-cancel the player's OWN row via the supported
  // cancellation path (status → cancelled), preserving the row so a later
  // register() re-uses it (no duplicate registrations). Throws on failure.
  const unregister = useCallback(async () => {
    if (!registration || registration.status === "cancelled") return;
    setUnregistering(true);
    try {
      const r = await registrationService.cancelOwnRegistration(registration.id);
      setRegistration(r);
      // Same targeted refresh on unregister so the roster/profile buckets drop them.
      invalidateRegistrationQueries(queryClient, { tournamentId, playerId });
    } finally {
      setUnregistering(false);
    }
  }, [registration, queryClient, tournamentId, playerId]);

  return { registration, isRegistered, loading, register, registering, unregister, unregistering, refresh };
};
