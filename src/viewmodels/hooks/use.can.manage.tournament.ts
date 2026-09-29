// src/viewmodels/hooks/use.can.manage.tournament.ts
// Does the signed-in user manage this tournament? Server-verified (can_manage_tournament RPC).
//   "checking"   — auth or the server check still resolving
//   "allowed"    — the server says yes
//   "denied"     — the server says NO (or nobody is signed in / invalid id)
//   "unverified" — the check itself could not run (offline / network error). The screen still
//                  renders so offline recovery keeps working; the server rejects every
//                  unauthorized write regardless, and the chip board has its own read-only
//                  "not loaded from your signed-in account" state.

import { useQuery } from "@tanstack/react-query";
import { authzService } from "../../models/services/authz.service";
import { useAuthContext } from "../../providers/AuthProvider";

export type ManageAccess = "checking" | "allowed" | "denied" | "unverified";

const CHECK_TIMEOUT_MS = 5000;

export const useCanManageTournament = (tournamentId: number | null | undefined) => {
  const { profile, loading } = useAuthContext();
  const valid = typeof tournamentId === "number" && Number.isFinite(tournamentId) && tournamentId > 0;
  const signedIn = !!profile?.id_auto;
  const q = useQuery({
    queryKey: ["can-manage-tournament", tournamentId, profile?.id_auto ?? null],
    // Bounded: a hung request becomes "unverified" (renders) instead of an endless spinner.
    queryFn: () =>
      Promise.race([
        authzService.canManageTournament(tournamentId as number),
        new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("authz timeout")), CHECK_TIMEOUT_MS)),
      ]),
    enabled: valid && signedIn,
    staleTime: 60_000,
    retry: 0,
    // Attempt even while the device reports offline (React Query would otherwise PAUSE the
    // query forever), so offline recovery reaches "unverified" and renders.
    networkMode: "always",
  });
  let status: ManageAccess;
  if (loading || (valid && signedIn && q.isPending)) status = "checking";
  else if (!valid || !signedIn) status = "denied";
  else if (q.isError) status = "unverified";
  else status = q.data ? "allowed" : "denied";
  return { status, retry: q.refetch };
};
