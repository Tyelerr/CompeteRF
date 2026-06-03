// src/viewmodels/hooks/use.manage.tournament.ts
// Viewmodel for the "Manage Tournament" command-center hub. Composes the
// tournament record, its registrations, and its tables into screen-ready
// metrics + the quick-action callbacks that drive tournaments.live_state.
//
// Follows the codebase dot-naming (cf. use.registrations.ts). All data access
// goes through services; the screen never touches Supabase.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tournamentService } from "../../models/services/tournament.service";
import { tournamentTableService } from "../../models/services/tournament-table.service";
import { TournamentLiveState } from "../../models/types/common.types";
import { useRegistrations } from "./use.registrations";

export const useManageTournament = (tournamentId?: number) => {
  const queryClient = useQueryClient();

  // ---- Reads -------------------------------------------------------------

  const tournamentQuery = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => tournamentService.getTournament(tournamentId!),
    enabled: !!tournamentId,
  });

  // Error-tolerant: the tournament_tables table may not exist yet (the Phase 0
  // migration is review-gated). If the read fails we still render the hub and
  // show "—" for table metrics rather than crashing.
  const tablesQuery = useQuery({
    queryKey: ["tournament-tables", tournamentId],
    queryFn: () => tournamentTableService.getTables(tournamentId!),
    enabled: !!tournamentId,
    retry: false,
  });

  const registrationsApi = useRegistrations(tournamentId);

  const invalidateTournament = () =>
    queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });

  // ---- Live-state mutations ----------------------------------------------

  const liveStateMutation = useMutation({
    mutationFn: (state: TournamentLiveState) =>
      tournamentService.setLiveState(tournamentId!, state),
    onSuccess: invalidateTournament,
  });

  const pauseMutation = useMutation({
    mutationFn: (paused: boolean) =>
      tournamentService.setPaused(tournamentId!, paused),
    onSuccess: invalidateTournament,
  });

  const completeMutation = useMutation({
    // "Complete" finishes the live engine. Lifecycle status stays as-is here;
    // marking the tournament `completed` is a separate Results-phase action.
    mutationFn: () => tournamentService.finishLiveTournament(tournamentId!),
    onSuccess: invalidateTournament,
  });

  // ---- Derived metrics ----------------------------------------------------

  const tablesReady = !tablesQuery.isError && tablesQuery.data !== undefined;
  // Stable reference so the metrics useMemo below doesn't recompute every render.
  const tables = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);

  const metrics = useMemo(() => {
    const regs = registrationsApi.registrations;
    const active = regs.filter((r) => r.status !== "cancelled");
    return {
      registered: active.length,
      checkedIn: active.filter((r) => r.status === "checked_in").length,
      // null => render "—" (tables not migrated yet)
      availableTables: tablesReady
        ? tables.filter((t) => t.status === "available").length
        : null,
      unavailableTables: tablesReady
        ? tables.filter((t) => t.status === "unavailable").length
        : null,
      // Matches arrive in Phase 2; null => render "—".
      activeMatches: null as number | null,
      waitingMatches: null as number | null,
      currentRound: tournamentQuery.data?.current_round ?? 0,
    };
  }, [registrationsApi.registrations, tables, tablesReady, tournamentQuery.data?.current_round]);

  const liveState: TournamentLiveState =
    tournamentQuery.data?.live_state ?? "not_started";
  const isPaused = tournamentQuery.data?.is_paused ?? false;

  const isMutatingLive =
    liveStateMutation.isPending ||
    pauseMutation.isPending ||
    completeMutation.isPending;

  return {
    tournament: tournamentQuery.data ?? null,
    isLoading: tournamentQuery.isLoading,
    error: tournamentQuery.error,
    refetch: () => {
      tournamentQuery.refetch();
      tablesQuery.refetch();
      registrationsApi.refetch();
    },

    // Live state + metrics for the Overview tab
    liveState,
    isPaused,
    metrics,
    tables,
    tablesReady,

    // Quick actions (Overview). Pause/Resume drive is_paused, not live_state.
    openRegistration: () => liveStateMutation.mutateAsync("registration_open"),
    closeRegistration: () =>
      liveStateMutation.mutateAsync("registration_closed"),
    start: () => liveStateMutation.mutateAsync("in_progress"),
    pause: () => pauseMutation.mutateAsync(true),
    resume: () => pauseMutation.mutateAsync(false),
    complete: () => completeMutation.mutateAsync(),
    isMutatingLive,

    // Registration passthrough for the Players tab
    registrations: registrationsApi.registrations,
    registrationsLoading: registrationsApi.isLoading,
    addPlayer: registrationsApi.addPlayer,
    approve: registrationsApi.approve,
    checkIn: registrationsApi.checkIn,
    markNoShow: registrationsApi.markNoShow,
    updateRegistration: registrationsApi.updateRegistration,
  };
};
