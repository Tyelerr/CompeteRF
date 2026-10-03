// src/viewmodels/hooks/use.elim.recovery.ts
// Elimination Recovery & History (Actions → Recovery & History). Everything here is fetched
// ONLY while the screen is open (enabled: open) — never part of Live polling. Undo / Restore
// run server-side (transactional, revision-checked); this hook only previews, confirms (caller)
// and maps refusals to TD text. Recovery actions never run or queue while offline.

import { useCallback, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ELIM_HISTORY_PAGE,
  elimRecoveryService,
  recoveryErrorCode,
} from "../../models/services/elim-recovery.service";
import {
  ElimAuditRow,
  ElimRecoveryResult,
  ElimRestorePreview,
} from "../../models/types/elim-recovery.types";
import { toConnectionAwareError, ConnectionRequiredError } from "../../utils/connection-required";
import {
  RECOVERY_OFFLINE_TEXT,
  RECOVERY_STALE_TEXT,
  undoUnavailableText,
} from "../../utils/elim-recovery.format";

const isWeb = Platform.OS === "web";

export const recoveryOffline = (): boolean =>
  isWeb && typeof navigator !== "undefined" && navigator.onLine === false;

// Thrown RPC / network error → the TD-facing message (null = unknown → caller's generic text).
export const recoveryErrorText = (e: unknown): string | null => {
  if (toConnectionAwareError(e) instanceof ConnectionRequiredError) return RECOVERY_OFFLINE_TEXT;
  const { code, detail } = recoveryErrorCode(e);
  if (code.includes("stale_revision")) return RECOVERY_STALE_TEXT;
  if (code.includes("undo_unavailable")) return undoUnavailableText(detail);
  if (code.includes("different_draw"))
    return "This restore point belongs to an earlier bracket draw. Use the “Before redraw” restore point instead.";
  if (code.includes("checkpoint_not_found")) return "That restore point no longer exists. The list has been refreshed.";
  if (code.includes("revision_required")) return RECOVERY_STALE_TEXT;
  return null;
};

export function useElimRecovery(tournamentId: number | null | undefined, open: boolean, onChanged: () => void) {
  const qc = useQueryClient();
  const enabled = open && !!tournamentId;
  const [busy, setBusy] = useState(false);

  const history = useInfiniteQuery({
    queryKey: ["elim-recovery", "audit", tournamentId],
    enabled,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => elimRecoveryService.listAudit(tournamentId!, pageParam),
    getNextPageParam: (last: ElimAuditRow[]) =>
      last.length === ELIM_HISTORY_PAGE ? last[last.length - 1].id : undefined,
    staleTime: 0,
  });
  const checkpoints = useQuery({
    queryKey: ["elim-recovery", "checkpoints", tournamentId],
    enabled,
    queryFn: () => elimRecoveryService.listCheckpoints(tournamentId!),
    staleTime: 0,
  });
  const undoPreview = useQuery({
    queryKey: ["elim-recovery", "undo-preview", tournamentId],
    enabled,
    queryFn: () => elimRecoveryService.previewUndo(tournamentId!),
    staleTime: 0,
  });

  const rows = useMemo(() => history.data?.pages.flat() ?? [], [history.data]);
  const actorIds = useMemo(
    () => [...new Set([...rows.map((r) => r.actor_id), ...(checkpoints.data ?? []).map((c) => c.actor_id)].filter(Boolean) as string[])].sort(),
    [rows, checkpoints.data],
  );
  const actors = useQuery({
    queryKey: ["elim-recovery", "actors", actorIds.join(",")],
    enabled: enabled && actorIds.length > 0,
    queryFn: () => elimRecoveryService.actorNames(actorIds),
    staleTime: 5 * 60_000,
  });

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["elim-recovery"] });
    onChanged();
  }, [qc, onChanged]);

  // Run a recovery write: offline → refused (nothing queued); stale / refused → text + refresh.
  const runWrite = useCallback(
    async (write: () => Promise<ElimRecoveryResult>): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (recoveryOffline()) return { ok: false, message: RECOVERY_OFFLINE_TEXT };
      setBusy(true);
      try {
        await write();
        refreshAll();
        return { ok: true };
      } catch (e) {
        const message = recoveryErrorText(e) ?? (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
        refreshAll();
        return { ok: false, message };
      } finally {
        setBusy(false);
      }
    },
    [refreshAll],
  );

  const undo = useCallback(
    (expectedRevision: number) => runWrite(() => elimRecoveryService.undo(tournamentId!, expectedRevision)),
    [runWrite, tournamentId],
  );
  const restore = useCallback(
    (checkpointId: number, expectedRevision: number) =>
      runWrite(() => elimRecoveryService.restore(tournamentId!, checkpointId, expectedRevision)),
    [runWrite, tournamentId],
  );
  // Impact preview for a restore point (read-only; still refused offline so nothing is implied).
  const previewRestore = useCallback(
    async (checkpointId: number): Promise<{ ok: true; preview: ElimRestorePreview } | { ok: false; message: string }> => {
      if (recoveryOffline()) return { ok: false, message: RECOVERY_OFFLINE_TEXT };
      try {
        return { ok: true, preview: await elimRecoveryService.previewRestore(tournamentId!, checkpointId) };
      } catch (e) {
        return { ok: false, message: recoveryErrorText(e) ?? "Couldn't load the restore preview. Please try again." };
      }
    },
    [tournamentId],
  );

  return {
    rows,
    hasMore: !!history.hasNextPage,
    loadMore: () => history.fetchNextPage(),
    loadingMore: history.isFetchingNextPage,
    loadingHistory: history.isLoading,
    historyError: history.isError,
    checkpoints: checkpoints.data ?? [],
    loadingCheckpoints: checkpoints.isLoading,
    undoPreview: undoPreview.data ?? null,
    loadingUndo: undoPreview.isLoading || undoPreview.isFetching,
    actorName: (id: string | null | undefined) => (id ? actors.data?.[id] ?? null : null),
    refreshAll,
    busy,
    undo,
    restore,
    previewRestore,
  };
}
