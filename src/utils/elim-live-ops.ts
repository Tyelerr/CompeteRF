// src/utils/elim-live-ops.ts
// Pure helpers around the elim_live_apply RPC (Phase 3 write safety). No React, no
// Supabase. The server is authoritative; these only (a) mirror an op batch into the
// cached live_settings so the UI updates instantly while the RPC is in flight — the
// RPC's returned live_settings then replaces the cache — and (b) turn per-op results
// into TD-facing text.

import {
  ElimCascade,
  ElimLiveOp,
  ElimLiveOpResult,
  MatchExpect,
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
  stale_state: "this match changed on another device — the screen has refreshed; check it and try again",
  match_not_ready: "both players aren't known yet",
  player_busy: "a player is already playing another match",
  tournament_finished: "the tournament is finished",
  stale_revision: "This tournament changed on another device. Reload the latest version.",
};

// The precondition a TD action carries: exactly what this device showed for the match when the
// TD acted (status / winner / table). See MatchExpect.
export const expectOf = (m: {
  status: MatchLiveState["status"];
  winner: 1 | 2 | null;
  tableId: number | null;
}): MatchExpect => ({ status: m.status, winner: m.winner ?? null, tableId: m.tableId ?? null });

export const liveOpErrorText = (code: string | undefined): string =>
  (code && ERROR_TEXT[code]) || "could not be saved";

// ── Recovery foundation (20261018120000) ──────────────────────────────────────────────────
// A match patch that decides, changes or clears a RESULT (Set Winner, forfeit / withdraw,
// change a recorded result, Reset, Reopen). These are never sent while offline.
type PrevMatch = { status: MatchLiveState["status"]; winner: 1 | 2 | null; result?: MatchLiveState["result"] | null };
export const isOutcomeChange = (prev: PrevMatch | null, patch: Partial<MatchLiveState>): boolean => {
  if (!prev) return false;
  const next = patch.status ?? prev.status;
  return (
    next === "completed" ||
    "winner" in patch ||
    "result" in patch ||
    prev.status === "completed" || // (next is not "completed" here) → a reopen / reset
    (prev.status === "in_progress" && next === "scheduled")
  );
};

// A CORRECTION: undoes or changes something already decided / started — changing or clearing a
// recorded result, Reopen, or Reset of a live match. These carry the tournament revision (refused
// 'stale_revision' if anything changed since the TD loaded it) and get an impact preview.
// A first Set Winner on a live match is NOT a correction: the per-match `expect` already guards
// it, and requiring the revision there would falsely refuse TDs whenever Auto Assign seats
// another match.
export const isCorrection = (prev: PrevMatch | null, patch: Partial<MatchLiveState>): boolean => {
  if (!prev) return false;
  const next = patch.status ?? prev.status;
  if (prev.status === "completed")
    return (
      next !== "completed" ||
      ("winner" in patch && (patch.winner ?? null) !== (prev.winner ?? null)) ||
      ("result" in patch && (patch.result ?? null) !== (prev.result ?? null))
    );
  return prev.status === "in_progress" && next === "scheduled";
};

// "This change will clear 3 downstream results and return 4 matches to Waiting." (null = nothing
// downstream changes → the action's own simple confirmation is enough).
export const correctionImpactText = (c: ElimCascade | null | undefined): string | null => {
  if (!c || c.reset.length === 0) return null;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    c.cleared.length > 0 ? `clear ${plural(c.cleared.length, "downstream result", "downstream results")}` : null,
    `return ${plural(c.reset.length, "match", "matches")} to Waiting`,
  ].filter(Boolean);
  const live = c.stopped.length > 0 ? ` ${plural(c.stopped.length, "match in progress is", "matches in progress are")} stopped.` : "";
  const tables = c.released.length > 0 ? ` ${plural(c.released.length, "table is", "tables are")} freed.` : "";
  return `This change will ${parts.join(" and ")}.${live}${tables} Players will be re-seated from the corrected result.`;
};

// Map a thrown RPC error (PostgREST message = the SQL exception text) to TD-facing text.
export const liveCallErrorText = (e: unknown): string | null => {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  return msg.includes("stale_revision") ? ERROR_TEXT.stale_revision : null;
};

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
