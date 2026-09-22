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

// ── Table state + displacement (Auto Assign preview / Assign Table) ───────────
// Pure classification of every tournament table from the SAME data the Queue renders
// (tournament_tables + the matches currently on tables). No new scheduler state.
export type TableState =
  | { kind: "free" }
  | { kind: "unavailable" }
  | { kind: "assigned"; matchId: string; label: string } // parked, NOT started → may be displaced
  | { kind: "playing"; matchId: string; label: string }; // in progress → never taken

export const classifyTables = (
  tables: { id: number; status: string }[],
  onTable: { id: string; tableId: number | null; status: string; p1Name: string | null; p2Name: string | null }[],
): Record<number, TableState> => {
  const out: Record<number, TableState> = {};
  for (const t of tables) out[t.id] = t.status === "unavailable" ? { kind: "unavailable" } : { kind: "free" };
  for (const m of onTable) {
    if (m.tableId == null || m.status === "completed" || !(m.tableId in out)) continue;
    const label = `${m.p1Name ?? "TBD"} vs ${m.p2Name ?? "TBD"}`;
    out[m.tableId] =
      m.status === "in_progress"
        ? { kind: "playing", matchId: m.id, label }
        : { kind: "assigned", matchId: m.id, label };
  }
  return out;
};

// Matches a draft plan would bump off their (not-started) tables. In-progress tables are
// never displaced (the caller must not offer them); free tables displace nobody.
export const planDisplacements = (
  plan: { matchId: string; tableId: number }[],
  state: Record<number, TableState>,
): { matchId: string; tableId: number; label: string }[] => {
  const moving = new Set(plan.map((p) => p.matchId));
  const seen = new Set<string>();
  const out: { matchId: string; tableId: number; label: string }[] = [];
  for (const p of plan) {
    const s = state[p.tableId];
    if (s?.kind === "assigned" && !moving.has(s.matchId) && !seen.has(s.matchId)) {
      seen.add(s.matchId);
      out.push({ matchId: s.matchId, tableId: p.tableId, label: s.label });
    }
  }
  return out;
};

// Ops for "assign these matches, bumping these parked matches first". The unassigns run
// first in the SAME server call (row-locked); with any displacement the call is atomic, so
// a displaced match is never left unassigned without its replacement landing.
export const buildAssignOps = (
  plan: { matchId: string; tableId: number }[],
  start: boolean,
  displacedIds: string[] = [],
): { ops: ElimLiveOp[]; atomic: boolean } => ({
  ops: [
    ...displacedIds.map((matchId) => ({ op: "unassign", matchId }) as ElimLiveOp),
    ...plan.map((p) => ({ op: "assign", matchId: p.matchId, tableId: p.tableId, start }) as ElimLiveOp),
  ],
  atomic: displacedIds.length > 0,
});
