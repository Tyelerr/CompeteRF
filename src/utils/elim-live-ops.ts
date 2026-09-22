// src/utils/elim-live-ops.ts
// Pure helpers around the elim_live_apply RPC (Phase 3 write safety). No React, no
// Supabase. The server is authoritative; these only (a) mirror an op batch into the
// cached live_settings so the UI updates instantly while the RPC is in flight — the
// RPC's returned live_settings then replaces the cache — and (b) turn per-op results
// into TD-facing text.

import {
  ElimLiveOp,
  ElimLiveOpResult,
  MatchLiveState,
  TournamentLiveSettings,
} from "../models/types/tournament-settings.types";

// Optimistic mirror of the server's op semantics (best-effort; no validation — a
// rejected op is corrected by the server response a moment later).
export const applyOpsLocally = (
  ls: TournamentLiveSettings,
  ops: ElimLiveOp[],
  nowIso: string,
): TournamentLiveSettings => {
  let next: TournamentLiveSettings = { ...ls };
  const ms: Record<string, MatchLiveState> = { ...(ls.matchState ?? {}) };
  const cur = (id: string): MatchLiveState => ms[id] ?? { status: "scheduled" };
  for (const o of ops) {
    switch (o.op) {
      case "assign":
        ms[o.matchId] = {
          ...cur(o.matchId),
          tableId: o.tableId,
          status: o.start ? "in_progress" : "scheduled",
          startedAt: o.start ? nowIso : null,
        };
        break;
      case "start":
        ms[o.matchId] = { ...cur(o.matchId), status: "in_progress", startedAt: nowIso };
        break;
      case "unassign":
        ms[o.matchId] = { ...cur(o.matchId), tableId: null, status: "scheduled", startedAt: null };
        break;
      case "patch_match": {
        const c = cur(o.matchId);
        ms[o.matchId] = { ...c, ...o.set, status: o.set.status ?? c.status ?? "scheduled" };
        break;
      }
      case "set_queue":
        next = {
          ...next,
          ...(o.queueOrder ? { queueOrder: o.queueOrder } : {}),
          ...(o.autoAssignMode ? { autoAssignMode: o.autoAssignMode } : {}),
        };
        break;
    }
  }
  return { ...next, matchState: ms };
};

const ERROR_TEXT: Record<string, string> = {
  table_occupied: "table occupied",
  table_unavailable: "table unavailable",
  table_not_found: "table not found",
  invalid_table: "invalid table",
  match_in_progress: "already in progress",
  match_completed: "already completed",
  no_table: "no table assigned",
  unknown_match: "match not in this bracket",
  invalid_transition: "not a valid result",
};

export const liveOpErrorText = (code: string | undefined): string =>
  (code && ERROR_TEXT[code]) || "could not be saved";

// "3 assigned · 1 skipped — table occupied" (verb = assigned / started / sent back)
export const summarizeOpResults = (results: ElimLiveOpResult[], verb: string): string => {
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) return `${ok} ${verb}`;
  const reasons = [...new Set(failed.map((r) => liveOpErrorText(r.error)))].join(", ");
  return `${ok} ${verb} · ${failed.length} skipped — ${reasons}`;
};
