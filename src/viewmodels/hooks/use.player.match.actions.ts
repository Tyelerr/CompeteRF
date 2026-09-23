// src/viewmodels/hooks/use.player.match.actions.ts
// THE player-side match action state: the one assignment that matters right now, its check-in
// status, and the two writes (Check In / Contact TD). Home's MATCH READY card, Profile's YOU PLAY
// NEXT card and the Check-In modal all render from this — no duplicated match/race/check-in logic.
//
// The match itself comes from usePlayerLiveMatch (the same bracket resolver the TD hub uses), so
// table, opponent and race stay in lock-step with the live bracket.
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { matchCheckInService } from "../../models/services/match-checkin.service";
import { MatchIssueReason } from "../../models/types/match-checkin.types";
import { matchRaceText } from "../../utils/match.utils";
import { PlayerMatchSnapshot } from "../../utils/player-match-link";
import { statusForAssignment } from "../../utils/match-player-status";
import { usePlayerLiveMatch } from "./use.player.live.match";

export interface PlayerMatchContext {
  tournamentId: number;
  tournamentName: string;
  matchId: string;
  tableLabel: string | null;
  opponentName: string | null;
  raceText: string;
  roundLabel: string;
  assignedAt: string | null;
  status: string;
  isPlaying: boolean;
  registrationId: number | null;
}

export const usePlayerMatchActions = (idAuto?: number, tournamentId?: number | null) => {
  const queryClient = useQueryClient();
  const { hub, myRegId, isLoading } = usePlayerLiveMatch(idAuto, tournamentId ?? undefined);
  const current = hub?.current ?? null;

  const context = useMemo<PlayerMatchContext | null>(() => {
    if (!current || !hub) return null;
    return {
      tournamentId: hub.tournamentId,
      tournamentName: hub.tournamentName,
      matchId: current.matchId,
      tableLabel: current.table,
      opponentName: current.opponentName,
      raceText: matchRaceText(current.match),
      roundLabel: current.roundLabel,
      assignedAt: current.match.assignedAt ?? null,
      status: current.match.status,
      isPlaying: current.isPlaying,
      registrationId: myRegId ?? null,
    };
  }, [current, hub, myRegId]);

  /** Only an assignment the player can act on: a table, not finished. */
  const isAssigned = !!context && context.assignedAt != null && context.status !== "completed";

  const statusQuery = useQuery({
    queryKey: ["match-player-status", context?.tournamentId],
    queryFn: () => matchCheckInService.listForTournament(context!.tournamentId),
    enabled: !!context?.tournamentId,
    staleTime: 15000,
  });

  const myStatus = useMemo(
    () =>
      context
        ? statusForAssignment(statusQuery.data, {
            matchId: context.matchId,
            registrationId: context.registrationId,
            assignedAt: context.assignedAt,
          })
        : null,
    [context, statusQuery.data],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["match-player-status", context?.tournamentId] });

  const checkInMutation = useMutation({
    mutationFn: () => matchCheckInService.checkIn(context!.tournamentId, context!.matchId),
    onSettled: invalidate,
  });
  const contactMutation = useMutation({
    mutationFn: (vars: { reason: MatchIssueReason; message?: string | null }) =>
      matchCheckInService.contactTd(context!.tournamentId, context!.matchId, vars.reason, vars.message),
    onSettled: invalidate,
  });

  /** What a tapped notification is resolved against (src/utils/player-match-link.ts). */
  const snapshot = useMemo<PlayerMatchSnapshot | null>(
    () =>
      context
        ? {
            tournamentId: context.tournamentId,
            matchId: context.matchId,
            assignedAt: context.assignedAt,
            tableId: current?.match.tableId ?? null,
            status: context.status,
          }
        : null,
    [context, current],
  );

  const checkIn = useCallback(async () => {
    if (!isAssigned) return;
    await checkInMutation.mutateAsync();
  }, [isAssigned, checkInMutation]);

  const contactTd = useCallback(
    async (reason: MatchIssueReason, message?: string | null) => {
      if (!context) return;
      await contactMutation.mutateAsync({ reason, message });
    },
    [context, contactMutation],
  );

  return {
    context,
    snapshot,
    isAssigned,
    isLoading,
    checkedIn: !!myStatus?.checked_in_at,
    issueReason: myStatus?.issue_at && !myStatus.resolved_at ? myStatus.issue_reason : null,
    checkIn,
    contactTd,
    busy: checkInMutation.isPending || contactMutation.isPending,
  };
};
