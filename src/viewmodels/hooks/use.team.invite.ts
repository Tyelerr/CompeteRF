// src/viewmodels/hooks/use.team.invite.ts
// The invited player's side: does the current user have a PENDING team invite for
// this tournament, and let them accept (with their OWN Fargo) or decline. Backed
// by the respond_to_team_invite RPC (which locks the team on accept).

import { useCallback, useEffect, useState } from "react";
import { teamService } from "../../models/services/team.service";
import { TeamInvite } from "../../models/types/team.types";

export const usePendingTeamInvite = (tournamentId?: number, playerId?: number) => {
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!tournamentId || !playerId) {
      setInvite(null);
      return;
    }
    setLoading(true);
    try {
      const invites = await teamService.getMyPendingInvites(playerId);
      setInvite(invites.find((i) => i.tournament_id === tournamentId) ?? null);
    } catch {
      setInvite(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, playerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const accept = useCallback(
    async (fargo: number | null) => {
      if (!invite) return;
      setBusy(true);
      try {
        await teamService.respondToInvite(invite.team_id, true, fargo);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [invite, refresh],
  );

  const decline = useCallback(async () => {
    if (!invite) return;
    setBusy(true);
    try {
      await teamService.respondToInvite(invite.team_id, false, null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [invite, refresh]);

  return { invite, loading, busy, refresh, accept, decline };
};
