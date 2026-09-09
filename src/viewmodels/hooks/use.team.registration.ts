// src/viewmodels/hooks/use.team.registration.ts
// Lets a logged-in player register a TEAM (captain) for a team-format tournament
// and manage the partner invite. No public player browsing — the captain invites
// a specific contact (username/email → real account; phone/unmatched → a temp
// Unverified partner). Rules are enforced by the SECURITY DEFINER RPCs behind
// teamService; this hook just orchestrates create → invite and reloads.

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { teamService } from "../../models/services/team.service";
import {
  InvitePartnerInput,
  TeamMember,
  TournamentTeam,
} from "../../models/types/team.types";
import { invalidateRegistrationQueries } from "./registration-invalidation";

// Human-readable status for the modal.
export type TeamRegState =
  | "none" // no team yet
  | "waiting" // team exists, no partner slot yet
  | "invited" // partner invite pending
  | "unverified" // temp (non-account) partner
  | "registered"; // partner accepted, both real accounts

const memberLabel = (m?: TeamMember | null): string => {
  if (!m) return "";
  const p = m.profiles;
  if (p) return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || p.user_name;
  return m.temp_name || m.invite_value || "Partner";
};

export const useTeamRegistration = (tournamentId?: number, playerId?: number) => {
  const queryClient = useQueryClient();
  const [team, setTeam] = useState<TournamentTeam | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Targeted refresh after any team registration change — same key set as self-reg,
  // keyed to this captain. No browse reload, no polling.
  const invalidate = useCallback(
    () => invalidateRegistrationQueries(queryClient, { tournamentId, playerId }),
    [queryClient, tournamentId, playerId],
  );

  const refresh = useCallback(async () => {
    if (!tournamentId || !playerId) {
      setTeam(null);
      return;
    }
    setLoading(true);
    try {
      setTeam(await teamService.getMyTeam(tournamentId, playerId));
    } catch {
      setTeam(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, playerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const captain = useMemo(
    () => team?.members?.find((m) => m.role === "captain") ?? null,
    [team],
  );
  const partner = useMemo(
    () => team?.members?.find((m) => m.role === "member") ?? null,
    [team],
  );

  const state: TeamRegState = useMemo(() => {
    if (!team) return "none";
    if (!partner) return "waiting";
    if (partner.invite_status === "pending") return "invited";
    if (team.status === "registered") return "registered";
    return "unverified";
  }, [team, partner]);

  // Create the team (caller = captain) with a Fargo hint, then optionally invite
  // a partner in the same action. Returns the team id.
  const registerTeam = useCallback(
    async (captainFargo: number | null, partnerInvite?: InvitePartnerInput | null) => {
      if (!tournamentId) return null;
      setBusy(true);
      try {
        const existingId = team?.id;
        const teamId = existingId ?? (await teamService.createTeam(tournamentId, captainFargo));
        let targetIdAuto: number | null = null;
        if (partnerInvite && partnerInvite.value.trim()) {
          targetIdAuto = await teamService.invitePartner(teamId, partnerInvite);
        }
        await refresh();
        invalidate();
        return { teamId, targetIdAuto };
      } finally {
        setBusy(false);
      }
    },
    [tournamentId, team, refresh, invalidate],
  );

  const invitePartner = useCallback(
    async (input: InvitePartnerInput): Promise<number | null> => {
      if (!team) return null;
      setBusy(true);
      try {
        const targetIdAuto = await teamService.invitePartner(team.id, input);
        await refresh();
        invalidate();
        return targetIdAuto;
      } finally {
        setBusy(false);
      }
    },
    [team, refresh, invalidate],
  );

  const cancelPartner = useCallback(async () => {
    if (!team) return;
    setBusy(true);
    try {
      await teamService.cancelPartner(team.id);
      await refresh();
      invalidate();
    } finally {
      setBusy(false);
    }
  }, [team, refresh, invalidate]);

  const cancelTeam = useCallback(async () => {
    if (!team) return;
    setBusy(true);
    try {
      await teamService.cancelTeam(team.id);
      setTeam(null);
      invalidate();
    } finally {
      setBusy(false);
    }
  }, [team, invalidate]);

  return {
    team,
    captain,
    partner,
    state,
    loading,
    busy,
    refresh,
    registerTeam,
    invitePartner,
    cancelPartner,
    cancelTeam,
    captainName: memberLabel(captain),
    partnerName: memberLabel(partner),
  };
};
