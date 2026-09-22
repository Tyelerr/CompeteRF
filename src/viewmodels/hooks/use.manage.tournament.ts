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
import { TournamentTableUpdate } from "../../models/types/tournament-table.types";
import { Tournament } from "../../models/types/tournament.types";
import { derivePhase } from "../../utils/tournament-phase";
import type { ManagePhase } from "../../utils/tournament-phase";
import {
  AutoAssignMode,
  DrawLogEntry,
  ElimLiveApplyResponse,
  ElimLiveOp,
  GeneratedBracket,
  MatchLiveState,
  PrizePoolConfig,
  TournamentLiveSettings,
} from "../../models/types/tournament-settings.types";
import { applyOpsLocally, liveOpErrorText } from "../../utils/elim-live-ops";
import {
  TournamentLiveState,
  TableStatus,
} from "../../models/types/common.types";
import { useRegistrations } from "./use.registrations";

// Lifecycle phase (derivePhase) + the ManagePhase type now live in the shared
// utils/tournament-phase module so the Manage hub, the Tournament Manager list
// badges and the public LIVE card can't diverge. Re-exported for existing importers.
export type { ManagePhase };

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

  // ---- live_settings write safety (B2: stale-overwrite protection) -------
  // Every live_settings write is a read-modify-write of ONE jsonb column that Supabase
  // overwrites wholesale — there is no server-side merge. Reading the merge base from the
  // render-closure query data let two writes fired within the same refetch window
  // (Settings ↔ Prize Pool, which the screen chains in beginRegistration / saveCurrentPage
  // / confirmLeaveSettings) each merge onto the SAME stale snapshot and silently drop the
  // other's keys — e.g. a Settings save reverting the just-saved side-pot payout split.
  //
  // writeLiveSettings closes that window per client: it cancels in-flight refetches,
  // computes the next blob from the FRESHEST cache (so chained saves merge onto each
  // other), optimistically writes the merged result into the cache (so the next chained
  // save reads it, not a stale value), persists, and rolls the cache back on failure.
  // `build` runs exactly once, so appends (e.g. drawLog) never double-apply. It returns
  // the FULL patch to send: top-level columns pass through; a `live_settings` delta is
  // shallow-merged onto the current live_settings.
  //
  // NOTE (Phase G): this protects a single client's chained saves. Concurrent writes from
  // DIFFERENT directors to different live_settings keys still last-write-wins — that needs
  // a server-side jsonb merge (RPC), tracked as the multi-director concurrency item.
  const currentTournament = () =>
    queryClient.getQueryData<Tournament>(["tournament", tournamentId]);
  const writeLiveSettings = async (
    build: (prevLS: TournamentLiveSettings) => Partial<Tournament>,
  ): Promise<Tournament> => {
    await queryClient.cancelQueries({ queryKey: ["tournament", tournamentId] });
    const prev = currentTournament();
    const prevLS: TournamentLiveSettings = prev?.live_settings ?? {};
    const patch = build(prevLS);
    const nextPatch: Partial<Tournament> = patch.live_settings
      ? { ...patch, live_settings: { ...prevLS, ...patch.live_settings } }
      : patch;
    if (prev) {
      queryClient.setQueryData<Tournament>(["tournament", tournamentId], {
        ...prev,
        ...nextPatch,
      });
    }
    try {
      return await tournamentService.updateTournament(tournamentId!, nextPatch);
    } catch (e) {
      if (prev) queryClient.setQueryData(["tournament", tournamentId], prev);
      throw e;
    }
  };

  // ---- Elimination live-state writes (Phase 3) ------------------------------
  // Every elimination TD/admin match + queue write goes through the elim_live_apply RPC:
  // the server applies typed ops under a row lock and changes ONLY the targeted match /
  // queue keys, so it can never overwrite a player's concurrent score (the old
  // whole-live_settings write could). No fallback to the old path — that would bring the
  // race back. The cache is updated optimistically, then replaced by the server's
  // authoritative live_settings. Per-op results are returned for partial-success UI.
  const applyLiveOps = async (
    ops: ElimLiveOp[],
    opts: { atomic?: boolean } = {},
  ): Promise<ElimLiveApplyResponse> => {
    await queryClient.cancelQueries({ queryKey: ["tournament", tournamentId] });
    const prev = currentTournament();
    if (prev) {
      queryClient.setQueryData<Tournament>(["tournament", tournamentId], {
        ...prev,
        live_settings: applyOpsLocally(prev.live_settings ?? {}, ops, new Date().toISOString()),
      });
    }
    try {
      const res = await tournamentService.applyElimLiveOps(tournamentId!, ops, opts.atomic ?? false);
      const latest = currentTournament() ?? prev;
      if (latest) {
        queryClient.setQueryData<Tournament>(["tournament", tournamentId], {
          ...latest,
          live_settings: res.live_settings,
          live_state: res.live_state as TournamentLiveState,
        });
      }
      return res;
    } catch (e) {
      if (prev) queryClient.setQueryData(["tournament", tournamentId], prev);
      throw e;
    }
  };
  // Single-op convenience: throws (with the server's reason) when the op was rejected, so
  // existing callers keep their error alerts.
  const applyOneLiveOp = async (op: ElimLiveOp): Promise<ElimLiveApplyResponse> => {
    const res = await applyLiveOps([op]);
    const r = res.results[0];
    if (!r?.ok) throw new Error(liveOpErrorText(r?.error));
    return res;
  };
  const liveOpsMutation = useMutation({
    mutationFn: (vars: { ops: ElimLiveOp[]; atomic?: boolean }) =>
      applyLiveOps(vars.ops, { atomic: vars.atomic }),
    onSettled: invalidateTournament,
  });

  // Settings / Prize Pool saves. Chip keeps the existing shared writeLiveSettings path
  // untouched. Elimination saves split into (1) a plain column update WITHOUT live_settings
  // and (2) a server-side TOP-LEVEL merge of the live_settings delta that can never touch the
  // scheduler keys (matchState / queueOrder / autoAssignMode / bracket / drawLog) — so saving
  // Settings mid-tournament can no longer revert a live score. A delta key whose value is
  // `undefined` is REMOVED, matching the old whole-object write (JSON drops undefined).
  const saveLiveSettingsPatch = async (patch: Partial<Tournament>): Promise<Tournament> => {
    const cur = currentTournament();
    const format = patch.tournament_format ?? cur?.tournament_format;
    if (format === "chip-tournament") return writeLiveSettings(() => patch);

    await queryClient.cancelQueries({ queryKey: ["tournament", tournamentId] });
    const { live_settings: delta, ...columns } = patch;
    if (cur) {
      queryClient.setQueryData<Tournament>(["tournament", tournamentId], {
        ...cur,
        ...columns,
        ...(delta ? { live_settings: { ...(cur.live_settings ?? {}), ...delta } } : {}),
      });
    }
    try {
      let saved: Tournament | undefined = cur;
      if (Object.keys(columns).length > 0) {
        saved = await tournamentService.updateTournament(tournamentId!, columns);
      }
      if (delta) {
        const set: Record<string, unknown> = {};
        const remove: string[] = [];
        for (const [k, v] of Object.entries(delta)) {
          if (v === undefined) remove.push(k);
          else set[k] = v;
        }
        const merged = await tournamentService.mergeElimLiveSettings(tournamentId!, set, remove);
        const base = saved ?? currentTournament();
        if (base) {
          saved = { ...base, live_settings: merged };
          queryClient.setQueryData<Tournament>(["tournament", tournamentId], saved);
        }
      }
      return saved as Tournament;
    } catch (e) {
      if (cur) queryClient.setQueryData(["tournament", tournamentId], cur);
      throw e;
    }
  };

  // ---- Mutations ---------------------------------------------------------

  // Settings save MERGES live_settings into the existing blob so it never
  // clobbers sibling keys (bracket, drawLog, matchState, prizePool) that the
  // Settings form's toPatch() doesn't know about.
  const saveSettingsMutation = useMutation({
    mutationFn: (patch: Partial<Tournament>) => saveLiveSettingsPatch(patch),
    onSettled: invalidateTournament,
  });

  // Persist the prize-pool payout config (Setup phase). Merges into live_settings
  // so it survives a Settings save and rides along when the bracket is drawn.
  const savePrizePoolMutation = useMutation({
    mutationFn: (config: PrizePoolConfig) =>
      saveLiveSettingsPatch({ live_settings: { prizePool: config } }),
    onSettled: invalidateTournament,
  });

  const liveStateMutation = useMutation({
    mutationFn: (state: TournamentLiveState) =>
      tournamentService.setLiveState(tournamentId!, state),
    // Optimistically flip the cached live_state so the header badge (e.g. Setup
    // Incomplete → Registration Open) updates IMMEDIATELY, before the refetch. On
    // error, roll back; always revalidate afterward.
    onMutate: async (state: TournamentLiveState) => {
      await queryClient.cancelQueries({ queryKey: ["tournament", tournamentId] });
      const prev = queryClient.getQueryData<Tournament>(["tournament", tournamentId]);
      if (prev) {
        queryClient.setQueryData<Tournament>(["tournament", tournamentId], {
          ...prev,
          live_state: state,
        });
      }
      return { prev };
    },
    onError: (_e, _state, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(["tournament", tournamentId], ctx.prev);
    },
    onSettled: invalidateTournament,
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

  // Draw the bracket: store it + append a draw-log entry (merging into the
  // existing live_settings) and close registration. This is the lock point.
  const drawBracketMutation = useMutation({
    mutationFn: (vars: {
      bracket: GeneratedBracket;
      logEntry: DrawLogEntry;
    }) =>
      writeLiveSettings((prevLS) => ({
        live_state: "registration_closed",
        live_settings: {
          bracket: vars.bracket,
          drawLog: [...(prevLS.drawLog ?? []), vars.logEntry],
          // A (re)draw replaces the field/seeding, so any prior live match state
          // (winners/scores/timers, keyed by match id) must be cleared — otherwise
          // old results stick to the new bracket.
          matchState: {},
        },
      })),
    onSettled: invalidateTournament,
  });

  // DEV/test: replace the whole matchState at once (used by the bracket
  // simulator), optionally moving the tournament to in_progress.
  const bulkSetMatchStateMutation = useMutation({
    mutationFn: (vars: {
      matchState: Record<string, MatchLiveState>;
      start?: boolean;
    }) =>
      writeLiveSettings(() => ({
        ...(vars.start ? { live_state: "in_progress" as TournamentLiveState } : {}),
        live_settings: { matchState: vars.matchState },
      })),
    onSettled: invalidateTournament,
  });

  // Persist Queue Manager settings (auto-assign mode + manual queue order). Server-side
  // set_queue op: changes ONLY these two keys.
  const saveQueueSettingsMutation = useMutation({
    mutationFn: (vars: { autoAssignMode?: AutoAssignMode; queueOrder?: string[] }) =>
      applyOneLiveOp({ op: "set_queue", ...vars }),
    onSettled: invalidateTournament,
  });

  // Merge a patch into one match's live state (Matches tab / match-actions sheet). Server-side
  // patch_match op: changes ONLY that match (whitelisted, validated fields). The server also
  // flips live_state → in_progress on the first real start and stamps a first start with
  // server time (never the device clock). Rejections throw with the server's reason.
  const setMatchStateMutation = useMutation({
    mutationFn: (vars: { matchId: string; patch: Partial<MatchLiveState> }) =>
      applyOneLiveOp({ op: "patch_match", matchId: vars.matchId, set: vars.patch }),
    onSettled: invalidateTournament,
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
    mutationFn: (vars: { from: number; to: number; label?: string | null }) =>
      tournamentTableService.createTablesBulk(
        tournamentId!,
        vars.from,
        vars.to,
        vars.label ?? null,
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

  // Generic table field update (used by web Rename Pool Table: label + table_number).
  const updateTableMutation = useMutation({
    mutationFn: (vars: { id: number; updates: TournamentTableUpdate }) =>
      tournamentTableService.updateTable(vars.id, vars.updates),
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

    // Prize pool (Setup phase)
    prizePool: tournament?.live_settings?.prizePool ?? null,
    savePrizePool: savePrizePoolMutation.mutateAsync,
    isSavingPrizePool: savePrizePoolMutation.isPending,

    // Live-state transitions (Pause/Resume drive is_paused, not live_state)
    startRegistration: () => liveStateMutation.mutateAsync("registration_open"),
    closeRegistration: () =>
      liveStateMutation.mutateAsync("registration_closed"),
    start: () => liveStateMutation.mutateAsync("in_progress"),
    // Reflect a live_state change made OUTSIDE this hook (e.g. the embedded chip VM's
    // own Start Tournament persist) into the cached tournament IMMEDIATELY, then
    // reconcile in the background. Keeps the header badge / phase in sync without a
    // full-screen reload or manual refresh.
    setLiveStateLocal: (state: TournamentLiveState) => {
      const prev = queryClient.getQueryData<Tournament>(["tournament", tournamentId]);
      if (prev) {
        queryClient.setQueryData<Tournament>(["tournament", tournamentId], {
          ...prev,
          live_state: state,
        });
      }
      invalidateTournament();
    },
    pause: () => pauseMutation.mutateAsync(true),
    resume: () => pauseMutation.mutateAsync(false),
    complete: () => completeMutation.mutateAsync(),
    isMutatingLive,

    // Bracket / Draw
    bracket: tournament?.live_settings?.bracket ?? null,
    drawLog: tournament?.live_settings?.drawLog ?? [],

    // Live matches (Matches tab)
    matchState: tournament?.live_settings?.matchState ?? {},
    setMatchState: setMatchStateMutation.mutateAsync,
    // Elimination typed-op batch (assign / start / unassign / patch_match / set_queue) with
    // per-op results — Assign All / Start All / Auto Assign use this as ONE call.
    applyLiveOps: (ops: ElimLiveOp[], opts?: { atomic?: boolean }) =>
      liveOpsMutation.mutateAsync({ ops, atomic: opts?.atomic }),
    bulkSetMatchState: bulkSetMatchStateMutation.mutateAsync,

    // Queue Manager
    autoAssignMode: tournament?.live_settings?.autoAssignMode ?? "balanced",
    queueOrder: tournament?.live_settings?.queueOrder ?? [],
    saveQueueSettings: saveQueueSettingsMutation.mutateAsync,
    drawBracket: drawBracketMutation.mutateAsync,
    isDrawing: drawBracketMutation.isPending,
    // Reopen registration to change the field before a redraw.
    reopenRegistration: () =>
      liveStateMutation.mutateAsync("registration_open"),

    // Tables
    tables,
    tablesReady,
    createTable: createTableMutation.mutateAsync,
    createTablesBulk: createTablesBulkMutation.mutateAsync,
    setTableStatus: setTableStatusMutation.mutateAsync,
    setTableStreaming: setTableStreamingMutation.mutateAsync,
    updateTable: updateTableMutation.mutateAsync,
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
