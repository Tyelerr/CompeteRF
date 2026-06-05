// src/viewmodels/hooks/use.manage.tournament.ts
// Viewmodel for the "Manage Tournament" command-center hub. Loads the
// tournament, derives its lifecycle phase, and exposes the Settings save +
// live_state transitions, plus registration and table passthrough for the
// Players / Tables tabs.
//
// Follows the codebase dot-naming (cf. use.registrations.ts). All data access
// goes through services; the screen never touches Supabase.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tournamentService } from "../../models/services/tournament.service";
import { tournamentTableService } from "../../models/services/tournament-table.service";
import { Tournament } from "../../models/types/tournament.types";
import {
  TournamentLiveState,
  TableStatus,
} from "../../models/types/common.types";
import { useRegistrations } from "./use.registrations";

// Front-end lifecycle the hub gates on. Derived from (status, live_state, and
// whether the required setup fields are present) — no dedicated DB column.
export type ManagePhase =
  | "setup_incomplete"
  | "ready_to_open"
  | "registration_open"
  | "registration_closed"
  | "running"
  | "completed"
  | "archived";

const requiredComplete = (t: Tournament): boolean =>
  !!(
    t.name &&
    t.game_type &&
    t.tournament_format &&
    t.venue_id &&
    t.tournament_date &&
    t.start_time
  );

const derivePhase = (t: Tournament | null): ManagePhase => {
  if (!t) return "setup_incomplete";
  if (t.status === "archived") return "archived";
  if (t.status === "completed" || t.live_state === "finished")
    return "completed";
  const ls: TournamentLiveState = t.live_state ?? "not_started";
  if (ls === "in_progress") return "running";
  if (ls === "registration_closed") return "registration_closed";
  if (ls === "registration_open") return "registration_open";
  return requiredComplete(t) ? "ready_to_open" : "setup_incomplete";
};

export const useManageTournament = (tournamentId?: number) => {
  const queryClient = useQueryClient();

  // ---- Reads -------------------------------------------------------------

  const tournamentQuery = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => tournamentService.getTournament(tournamentId!),
    enabled: !!tournamentId,
  });

  // Error-tolerant: tournament_tables may not exist until the migration is
  // applied. On failure we still render the hub and treat tables as empty.
  const tablesQuery = useQuery({
    queryKey: ["tournament-tables", tournamentId],
    queryFn: () => tournamentTableService.getTables(tournamentId!),
    enabled: !!tournamentId,
    retry: false,
  });

  const registrationsApi = useRegistrations(tournamentId);

  const invalidateTournament = () =>
    queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
  const invalidateTables = () =>
    queryClient.invalidateQueries({
      queryKey: ["tournament-tables", tournamentId],
    });

  // ---- Mutations ---------------------------------------------------------

  const saveSettingsMutation = useMutation({
    mutationFn: (patch: Partial<Tournament>) =>
      tournamentService.updateTournament(tournamentId!, patch),
    onSuccess: invalidateTournament,
  });

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
    mutationFn: () => tournamentService.finishLiveTournament(tournamentId!),
    onSuccess: invalidateTournament,
  });

  // Table mutations (used by the Tables tab)
  const createTableMutation = useMutation({
    mutationFn: (vars: { tableNumber: number; label?: string | null }) =>
      tournamentTableService.createTable({
        tournament_id: tournamentId!,
        table_number: vars.tableNumber,
        label: vars.label ?? null,
      }),
    onSuccess: invalidateTables,
  });

  const createTablesBulkMutation = useMutation({
    mutationFn: (vars: { from: number; to: number }) =>
      tournamentTableService.createTablesBulk(
        tournamentId!,
        vars.from,
        vars.to,
      ),
    onSuccess: invalidateTables,
  });

  const setTableStatusMutation = useMutation({
    mutationFn: (vars: { id: number; status: TableStatus }) =>
      tournamentTableService.setStatus(vars.id, vars.status),
    onSuccess: invalidateTables,
  });

  const setTableStreamingMutation = useMutation({
    mutationFn: (vars: {
      id: number;
      isStreaming: boolean;
      streamLink?: string | null;
    }) =>
      tournamentTableService.setStreaming(
        vars.id,
        vars.isStreaming,
        vars.streamLink,
      ),
    onSuccess: invalidateTables,
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id: number) => tournamentTableService.deleteTable(id),
    onSuccess: invalidateTables,
  });

  // ---- Derived state ------------------------------------------------------

  const tournament = tournamentQuery.data ?? null;
  const phase = useMemo(() => derivePhase(tournament), [tournament]);

  const tablesReady = !tablesQuery.isError && tablesQuery.data !== undefined;
  const tables = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);

  const isMutatingLive =
    liveStateMutation.isPending ||
    pauseMutation.isPending ||
    completeMutation.isPending;

  return {
    tournament,
    isLoading: tournamentQuery.isLoading,
    error: tournamentQuery.error,
    refetch: () =>
      Promise.all([
        tournamentQuery.refetch(),
        tablesQuery.refetch(),
        registrationsApi.refetch(),
      ]),
    refetchRegistrations: registrationsApi.refetch,

    phase,
    liveState: tournament?.live_state ?? "not_started",
    isPaused: tournament?.is_paused ?? false,

    // Settings
    saveSettings: saveSettingsMutation.mutateAsync,
    isSaving: saveSettingsMutation.isPending,

    // Live-state transitions (Pause/Resume drive is_paused, not live_state)
    startRegistration: () => liveStateMutation.mutateAsync("registration_open"),
    closeRegistration: () =>
      liveStateMutation.mutateAsync("registration_closed"),
    start: () => liveStateMutation.mutateAsync("in_progress"),
    pause: () => pauseMutation.mutateAsync(true),
    resume: () => pauseMutation.mutateAsync(false),
    complete: () => completeMutation.mutateAsync(),
    isMutatingLive,

    // Tables
    tables,
    tablesReady,
    createTable: createTableMutation.mutateAsync,
    createTablesBulk: createTablesBulkMutation.mutateAsync,
    setTableStatus: setTableStatusMutation.mutateAsync,
    setTableStreaming: setTableStreamingMutation.mutateAsync,
    deleteTable: deleteTableMutation.mutateAsync,

    // Registrations passthrough (Players tab)
    registrations: registrationsApi.registrations,
    registrationsLoading: registrationsApi.isLoading,
    addPlayer: registrationsApi.addPlayer,
    approve: registrationsApi.approve,
    checkIn: registrationsApi.checkIn,
    markNoShow: registrationsApi.markNoShow,
    updateRegistration: registrationsApi.updateRegistration,
  };
};
