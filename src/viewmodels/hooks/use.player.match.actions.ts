// src/viewmodels/hooks/use.player.match.actions.ts
// THE player-side match action state: the one assignment that matters right now, its check-in
// status, and the two writes (Check In / Contact TD). Home's MATCH READY card, Profile's YOU PLAY
// NEXT card and the Check-In modal all render from this — no duplicated match/race/check-in logic.
//
// The match itself comes from usePlayerLiveMatch (the same bracket resolver the TD hub uses), so
// table, opponent and race stay in lock-step with the live bracket.
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { matchCheckInService } from "../../models/services/match-checkin.service";
import { MatchIssueReason } from "../../models/types/match-checkin.types";
import { matchRaceText } from "../../utils/match.utils";
import { PlayerMatchSnapshot } from "../../utils/player-match-link";
import { statusForAssignment } from "../../utils/match-player-status";
import { CHECK_IN_DEFAULTS, canPlayerStart, computeCheckInTimer } from "../../utils/check-in-timer";
import { onlineOnlyWrite } from "../../utils/connection-required";
import { usePlayerLiveMatch } from "./use.player.live.match";

const isWeb = Platform.OS === "web";
const browserOnline = (): boolean | null =>
  isWeb && typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : null;
const ONLINE_ONLY_MUTATION: { networkMode?: "always" } = isWeb ? { networkMode: "always" } : {};

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

  /** Both sides present: their own tap OR a manager's manual mark. */
  const bothCheckedIn = useMemo(() => {
    if (!context?.assignedAt) return false;
    const rows = (statusQuery.data ?? []).filter(
      (r) => r.match_id === context.matchId && !!r.checked_in_at &&
        Date.parse(r.assigned_at) === Date.parse(context.assignedAt!),
    );
    return rows.length >= 2;
  }, [statusQuery.data, context]);

  const settings = hub?.checkIn ?? CHECK_IN_DEFAULTS;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["match-player-status", context?.tournamentId] });

  // Player-side writes are ONLINE-ONLY (web): refused up front while offline and never queued
  // for later (networkMode "always" stops React Query pausing + replaying them on reconnect).
  const onlineOnly = <T,>(write: () => Promise<T>) => onlineOnlyWrite(isWeb, browserOnline(), write);
  const checkInMutation = useMutation({
    mutationFn: () => onlineOnly(() => matchCheckInService.checkIn(context!.tournamentId, context!.matchId)),
    onSettled: invalidate,
    ...ONLINE_ONLY_MUTATION,
  });
  const contactMutation = useMutation({
    mutationFn: (vars: { reason: MatchIssueReason; message?: string | null }) =>
      onlineOnly(() =>
        matchCheckInService.contactTd(context!.tournamentId, context!.matchId, vars.reason, vars.message),
      ),
    onSettled: invalidate,
    ...ONLINE_ONLY_MUTATION,
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

  const startMatchMutation = useMutation({
    ...ONLINE_ONLY_MUTATION,
    mutationFn: () => onlineOnly(() => matchCheckInService.playerStart(context!.tournamentId, context!.matchId)),
    onSettled: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["tournament", context?.tournamentId] });
    },
  });

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

  /** May THIS player press Start Match right now? */
  const startGate = canPlayerStart({
    match: current ? { status: current.match.status, tableId: current.match.tableId } : null,
    bothCheckedIn,
    settings,
  });

  const startMatch = useCallback(async () => {
    if (!context || !startGate.ok) return;
    await startMatchMutation.mutateAsync();
  }, [context, startGate.ok, startMatchMutation]);

  return {
    context,
    snapshot,
    bothCheckedIn,
    checkInRequired: settings.required,
    canStart: startGate.ok,
    startBlockedReason: startGate.reason ?? null,
    startMatch,
    /** Live timer for this assignment; the caller passes its own ticking `now`. */
    timerAt: (now: number) =>
      computeCheckInTimer({
        match: current
          ? { assignedAt: current.match.assignedAt, status: current.match.status, tableId: current.match.tableId }
          : null,
        bothCheckedIn,
        settings,
        now,
      }),
    isAssigned,
    isLoading,
    checkedIn: !!myStatus?.checked_in_at,
    issueReason: myStatus?.issue_at && !myStatus.resolved_at ? myStatus.issue_reason : null,
    checkIn,
    contactTd,
    busy: checkInMutation.isPending || contactMutation.isPending,
  };
};
