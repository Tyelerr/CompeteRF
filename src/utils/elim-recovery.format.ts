// src/utils/elim-recovery.format.ts
// Human-readable text for Elimination Recovery & History (TD/admin screen — no JSON, no ids
// beyond the match). Pure: audit rows, undo availability, impact previews, restore points.

import { ElimAuditRow, ElimCheckpointRow, ElimImpact } from "../models/types/elim-recovery.types";

const OP_TITLES: Record<string, string> = {
  set_winner: "Winner selected",
  change_result: "Result changed",
  forfeit: "Forfeit recorded",
  withdraw: "Withdrawal recorded",
  reopen: "Match reopened",
  reset: "Match reset",
  score: "Score updated",
  timer: "Match timer adjusted",
  table: "Table changed",
  assign: "Table assigned",
  unassign: "Table cleared",
  start: "Match started",
  set_queue: "Queue settings changed",
  auto_assign: "Match assigned automatically",
  draw: "Bracket drawn",
  redraw: "Bracket redrawn",
  patch_match: "Match updated",
  undo: "Undo",
  restore: "Restored to an earlier point",
};

export const auditOpTitle = (op: string): string => OP_TITLES[op] ?? "Tournament updated";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const matchLabel = (id: string | null | undefined): string | null => (id ? `Match ${id}` : null);

const AUTO_MODE_LABEL: Record<string, string> = {
  balanced: "Balanced", winnersFirst: "Winners first", losersFirst: "Losers first", longestWait: "Longest wait", manual: "Manual",
};

// set_queue rows: the audit's `after` holds exactly the keys the TD changed.
const queueTitle = (after: Record<string, unknown>): { title: string; line: string | null } => {
  if (typeof after.autoAssignEnabled === "boolean")
    return { title: after.autoAssignEnabled ? "Auto Assign enabled" : "Auto Assign disabled", line: null };
  if (typeof after.autoAssignMode === "string")
    return { title: "Auto Assign mode changed", line: AUTO_MODE_LABEL[after.autoAssignMode] ?? null };
  if ("queueOrder" in after) return { title: "Match order changed", line: null };
  if ("queuePins" in after) return { title: "Play Next updated", line: null };
  return { title: OP_TITLES.set_queue, line: null };
};

// Who, when there is no TD behind the row: Auto Assign / the system — never a guessed person.
const SOURCE_BY: Record<string, string> = { auto_assign: "Auto Assign", system: "System" };

// One audit row → {title, line, meta}. `actor` is the display name (or null).
export const describeAudit = (
  row: Pick<ElimAuditRow, "op" | "match_id" | "after" | "before" | "detail"> & { source?: string | null },
  actor?: string | null,
): { title: string; line: string | null; match: string | null; by: string | null } => {
  const d = row.detail ?? {};
  const p1 = d.p1Name ?? null;
  const p2 = d.p2Name ?? null;
  const vs = p1 && p2 ? `${p1} vs ${p2}` : p1 ?? p2 ?? null;
  const w = (row.after as { winner?: unknown } | null)?.winner;
  let title = auditOpTitle(row.op);
  let line: string | null = vs;
  if (["set_winner", "change_result", "forfeit", "withdraw"].includes(row.op) && (w === 1 || w === 2) && p1 && p2) {
    const [win, lose] = w === 1 ? [p1, p2] : [p2, p1];
    const how = row.op === "forfeit" ? " (forfeit)" : row.op === "withdraw" ? " (withdrawal)" : "";
    line = `${win} defeated ${lose}${how}`;
  } else if (row.op === "undo") {
    title = `Undo — ${auditOpTitle(String(d.undoneOp ?? "")).toLowerCase()}`;
  } else if (row.op === "restore") {
    line = d.restoredLabel ? `To: ${d.restoredLabel}` : null;
    if (d.reopened) line = [line, "tournament reopened"].filter(Boolean).join(" · ");
  } else if (row.op === "set_queue") {
    ({ title, line } = queueTitle((row.after ?? {}) as Record<string, unknown>));
  } else if (row.op === "auto_assign") {
    line = [d.tableLabel ?? null, vs].filter(Boolean).join(" · ") || null;
  } else if (row.op === "draw" || row.op === "redraw") {
    const a = (row.after ?? {}) as { players?: unknown; bracketSize?: unknown };
    line = [
      typeof a.players === "number" ? plural(a.players, "player", "players") : null,
      typeof a.bracketSize === "number" ? `${a.bracketSize}-slot bracket` : null,
      row.op === "redraw" && d.reason ? `Reason: ${d.reason}` : null,
    ].filter(Boolean).join(" · ") || null;
  }
  const reset = d.cascade?.reset?.length ?? 0;
  if (reset > 0) line = [line, `${plural(reset, "later match", "later matches")} reset`].filter(Boolean).join(" · ");
  // A correction on a finished event that left required matches unplayed reopened it (server).
  if (d.reopened && row.op !== "restore") line = [line, "tournament reopened"].filter(Boolean).join(" · ");
  return { title, line, match: matchLabel(row.match_id), by: actor ?? SOURCE_BY[row.source ?? ""] ?? null };
};

// Before → after pairs for the detail view (only fields that changed; readable values).
export const auditFieldChanges = (row: Pick<ElimAuditRow, "before" | "after" | "detail">): { field: string; from: string; to: string }[] => {
  const label: Record<string, string> = {
    status: "Status", winner: "Winner", p1Score: "Score (P1)", p2Score: "Score (P2)", result: "Result", tableId: "Table", startedAt: "Started",
  };
  const fmt = (k: string, v: unknown): string => {
    if (v == null || v === "") return "—";
    if (k === "winner") return v === 1 ? row.detail?.p1Name ?? "Player 1" : v === 2 ? row.detail?.p2Name ?? "Player 2" : String(v);
    if (k === "tableId" && row.detail?.tableLabel && v === (row.after as Record<string, unknown> | null)?.tableId) return String(row.detail.tableLabel);
    if (k === "status") return v === "in_progress" ? "Live" : v === "completed" ? "Completed" : v === "scheduled" ? "Waiting" : String(v);
    if (k === "startedAt" && typeof v === "string") {
      const t = Date.parse(v);
      return Number.isNaN(t) ? v : new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return String(v);
  };
  const b = (row.before ?? {}) as Record<string, unknown>;
  const a = (row.after ?? {}) as Record<string, unknown>;
  return Object.keys(label)
    .filter((k) => k in a || k in b)
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => ({ field: label[k], from: fmt(k, b[k]), to: fmt(k, a[k]) }));
};

// Why Undo isn't available (never a fake button).
export const undoUnavailableText = (reason: string | null | undefined): string => {
  const r = reason ?? "";
  if (r === "nothing_to_undo") return "Nothing to undo yet.";
  if (r === "draw_boundary")
    return "Undo can't cross a bracket redraw. Use Restore to return to an earlier draw.";
  if (r === "before_update")
    return "Earlier actions were recorded before Undo could track bracket draws, so they can't be undone. Use Restore instead.";
  if (r === "tournament_finished")
    return "This tournament is finished. Use a restore point to return to an earlier state (it will reopen the tournament).";
  if (r.startsWith("blocked:table_occupied"))
    return "Can't undo: that match's table is now in use by another match. Free the table or use a restore point.";
  if (r.startsWith("blocked:"))
    return "This action can't be undone right now because of the current tournament state. Use Restore instead.";
  return "This action can't be undone because later tournament activity depends on it. Use Restore instead.";
};

// Impact bullets for an Undo / Restore confirmation — computed counts only, never generic.
export const impactLines = (impact: ElimImpact | null | undefined, opts: { standingsChanged?: boolean } = {}): string[] => {
  if (!impact) return [];
  const out: string[] = [];
  const restoredN = new Set([...(impact.restored ?? []), ...(impact.restoredResults ?? [])]).size;
  if (impact.replacesBracket) out.push("replace the current bracket with the earlier draw");
  if (restoredN > 0) out.push(`restore ${plural(restoredN, "match result", "match results")}`);
  if ((impact.changed ?? []).length > 0) out.push(`change ${plural(impact.changed.length, "recorded result", "recorded results")}`);
  if ((impact.cleared ?? []).length > 0) out.push(`clear ${plural(impact.cleared.length, "match result", "match results")}`);
  if ((impact.toWaiting ?? []).length > 0) out.push(`return ${plural(impact.toWaiting.length, "match", "matches")} to Waiting`);
  if ((impact.stopped ?? []).length > 0) out.push(`stop ${plural(impact.stopped.length, "match in progress", "matches in progress")}`);
  if ((impact.tablesChanged ?? []).length > 0) out.push(`change ${plural(impact.tablesChanged.length, "table assignment", "table assignments")}`);
  if (opts.standingsChanged) out.push("change the current standings");
  if (impact.reopensTournament) out.push("reopen the finished tournament (it returns to Live)");
  return out;
};

// One-line confirmation body from the impact bullets.
export const impactSummary = (impact: ElimImpact | null | undefined, opts: { standingsChanged?: boolean } = {}): string => {
  const lines = impactLines(impact, opts);
  const resultsTouched =
    (impact?.cleared?.length ?? 0) + (impact?.changed?.length ?? 0) + (impact?.restored?.length ?? 0) + (impact?.restoredResults?.length ?? 0);
  if (lines.length === 0) return "Nothing in the bracket changes.";
  if (resultsTouched === 0 && !impact?.replacesBracket && !impact?.reopensTournament && (impact?.tablesChanged?.length ?? 0) > 0 && lines.length === 1)
    return "This only changes table assignments and does not remove any completed results.";
  return `This will:\n• ${lines.join("\n• ")}`;
};

const REASON_BADGE: Record<string, string> = {
  before_correction: "Before correction",
  before_undo: "Before undo",
  before_restore: "Before restore",
  tournament_started: "Tournament started",
  before_redraw: "Before redraw",
  finished: "Tournament finished",
};

export const checkpointBadge = (c: Pick<ElimCheckpointRow, "reason" | "milestone">): string =>
  REASON_BADGE[c.reason] ?? (c.milestone ? "Milestone" : "Restore point");

// "Before change to W2M1" → "Before result change · Match W2M1"
export const checkpointTitle = (c: Pick<ElimCheckpointRow, "reason" | "label" | "match_id">): string => {
  if (c.reason === "before_correction" && c.match_id) return `Before result change · Match ${c.match_id}`;
  return c.label || checkpointBadge({ reason: c.reason, milestone: false });
};

export const RECOVERY_OFFLINE_TEXT = "Recovery actions require an internet connection.";
export const RECOVERY_STALE_TEXT = "This tournament changed on another device. Reload the latest version.";

// Shown after a correction on a FINISHED event reopened it (the server did it in the same write).
export const CORRECTION_REOPENED_TITLE = "Tournament Reopened";
export const CORRECTION_REOPENED_TEXT =
  "This correction affected completed matches, so the tournament is live again. Replay the affected matches, then finish the tournament again.";
// Added to the correction confirmation when the dry run says it would reopen.
export const CORRECTION_WILL_REOPEN_TEXT =
  "The tournament is finished — this correction will reopen it so the affected matches can be replayed.";
