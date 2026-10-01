// src/utils/giveaway-console.ts
// Pure helpers for the WEB desktop Giveaway Management console (stats, filtering, sorting, and
// which actions a giveaway offers in each status). No React / Supabase — unit-tested in
// src/utils/__tests__/giveaway-console.test.ts. Native giveaway management does not use this.
//
// Action rules mirror the existing native card exactly (giveaway-management.tsx); only the
// presentation differs (one primary action + a ⋯ menu instead of stacked buttons).

import type { Giveaway } from "../models/types/giveaway.types";
import { toArizonaWallClock } from "./arizona-time";

export type ConsoleGiveaway = Pick<
  Giveaway,
  | "id"
  | "name"
  | "description"
  | "status"
  | "entry_mode"
  | "prize_value"
  | "max_entries"
  | "end_date"
  | "ended_at"
  | "created_at"
  | "published_at"
  | "winner_id"
  | "entry_count"
>;

export type ConsoleStatusFilter = "all" | "draft" | "active" | "ended" | "awarded" | "archived" | "cancelled";
export type ConsoleSort = "newest" | "oldest" | "name" | "entries" | "prize";

export const CONSOLE_STATUS_FILTERS: { value: ConsoleStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "awarded", label: "Awarded" },
  { value: "archived", label: "Archived" },
  { value: "cancelled", label: "Cancelled" },
];

export const CONSOLE_SORTS: { value: ConsoleSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
  { value: "entries", label: "Entries" },
  { value: "prize", label: "Prize value" },
];

const entriesOf = (g: Pick<ConsoleGiveaway, "entry_count">) => g.entry_count ?? 0;
const prizeOf = (g: Pick<ConsoleGiveaway, "prize_value">) => Number(g.prize_value ?? 0) || 0;

// ── Stats ──────────────────────────────────────────────────────────────────────────────────────

export interface ConsoleStats {
  activeCount: number;
  activePrizeValue: number;
  /** Draw entries (SUM of quantity) on ACTIVE giveaways only. */
  activeEntries: number;
  /** Distinct entrants across every giveaway; null while unknown. */
  uniqueParticipants: number | null;
  /** Prize value of every giveaway that has a winner — including ones archived after the draw. */
  totalAwarded: number;
  totalGiveaways: number;
}

export function computeConsoleStats(
  giveaways: ConsoleGiveaway[],
  uniqueParticipants: number | null,
): ConsoleStats {
  const active = giveaways.filter((g) => g.status === "active");
  return {
    activeCount: active.length,
    activePrizeValue: active.reduce((sum, g) => sum + prizeOf(g), 0),
    activeEntries: active.reduce((sum, g) => sum + entriesOf(g), 0),
    uniqueParticipants,
    totalAwarded: giveaways.filter((g) => g.winner_id != null).reduce((sum, g) => sum + prizeOf(g), 0),
    totalGiveaways: giveaways.length,
  };
}

export function countByStatus(giveaways: ConsoleGiveaway[]): Record<ConsoleStatusFilter, number> {
  const counts: Record<ConsoleStatusFilter, number> = {
    all: giveaways.length, draft: 0, active: 0, ended: 0, awarded: 0, archived: 0, cancelled: 0,
  };
  for (const g of giveaways) {
    if (g.status in counts) counts[g.status as ConsoleStatusFilter] += 1;
  }
  return counts;
}

// ── Filter / search / sort ─────────────────────────────────────────────────────────────────────

export function filterAndSortGiveaways<T extends ConsoleGiveaway>(
  giveaways: T[],
  status: ConsoleStatusFilter,
  query: string,
  sort: ConsoleSort,
): T[] {
  const q = query.trim().toLowerCase();
  const result = giveaways.filter((g) => {
    if (status !== "all" && g.status !== status) return false;
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description ?? "").toLowerCase().includes(q) ||
      String(g.id) === q.replace(/^#/, "")
    );
  });
  const created = (g: T) => new Date(g.created_at).getTime() || 0;
  result.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return created(a) - created(b) || a.id - b.id;
      case "name":
        return a.name.localeCompare(b.name) || b.id - a.id;
      case "entries":
        return entriesOf(b) - entriesOf(a) || b.id - a.id;
      case "prize":
        return prizeOf(b) - prizeOf(a) || b.id - a.id;
      case "newest":
      default:
        return created(b) - created(a) || b.id - a.id;
    }
  });
  return result;
}

// ── Actions ────────────────────────────────────────────────────────────────────────────────────

export type PrimaryActionKind = "publish" | "end" | "draw" | "view_winner" | "restore";

export interface PrimaryAction {
  kind: PrimaryActionKind;
  label: string;
  /** Shown but not clickable (e.g. an ended giveaway with no entries cannot be drawn). */
  disabled?: boolean;
}

/** The ONE obvious action per status. Cancelled has none (it is final). */
export function getPrimaryAction(g: ConsoleGiveaway): PrimaryAction | null {
  switch (g.status) {
    case "draft":
      return { kind: "publish", label: "Publish" };
    case "active": {
      const full = g.max_entries != null && entriesOf(g) >= g.max_entries;
      return { kind: "end", label: full ? "End Giveaway" : "End Early" };
    }
    case "ended":
      return entriesOf(g) > 0
        ? { kind: "draw", label: "Draw Winner" }
        : { kind: "draw", label: "No Entries", disabled: true };
    case "awarded":
      return { kind: "view_winner", label: "View Winner" };
    case "archived":
      return { kind: "restore", label: "Restore" };
    default:
      return null;
  }
}

export type MenuActionKind = "edit" | "participants" | "archive" | "restore" | "cancel_refund" | "redraw";

export interface MenuAction {
  kind: MenuActionKind;
  label: string;
  destructive?: boolean;
}

/** Secondary actions valid for this giveaway — same availability rules as the native card. */
export function getMenuActions(g: ConsoleGiveaway): MenuAction[] {
  const actions: MenuAction[] = [];
  const isWallet = g.entry_mode === "wallet";
  const hasEntries = entriesOf(g) > 0;

  if (g.status === "draft" || g.status === "active" || g.status === "ended" || g.status === "awarded") {
    actions.push({ kind: "edit", label: "Edit" });
  }
  if (g.status !== "draft") actions.push({ kind: "participants", label: "View Participants" });
  if (g.status === "awarded") actions.push({ kind: "redraw", label: "Redraw Winner…" });

  // Spent wallet entries must be drawn or refunded — never archived away.
  const walletLocked = isWallet && hasEntries && g.status === "ended";
  if (g.status === "draft" || g.status === "awarded" || (g.status === "ended" && !walletLocked)) {
    actions.push({ kind: "archive", label: "Archive…", destructive: true });
  }
  if (g.status === "archived") actions.push({ kind: "restore", label: "Restore…" });
  if (isWallet && (g.status === "active" || (g.status === "ended" && hasEntries))) {
    actions.push({ kind: "cancel_refund", label: "Cancel & Refund…", destructive: true });
  }
  return actions;
}

/**
 * The status giveawayService.restoreGiveaway() will set — mirrors it exactly (winner → awarded,
 * ever published → active, never published → draft). Used only to warn before restoring.
 */
export function getRestoreTarget(g: Pick<ConsoleGiveaway, "winner_id" | "published_at">): "awarded" | "active" | "draft" {
  if (g.winner_id) return "awarded";
  if (g.published_at) return "active";
  return "draft";
}

// ── Display helpers ────────────────────────────────────────────────────────────────────────────

export const ENTRY_METHOD_LABEL: Record<string, string> = {
  legacy_single: "Single Entry",
  wallet: "Wallet",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const formatConsoleDate = (iso: string | null | undefined): string => (iso ? fmtDate(iso) : "—");

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A giveaway end_date as its Arizona calendar date ("Oct 5, 2026") — never the browser time zone. */
const fmtArizonaDate = (iso: string) => {
  const az = toArizonaWallClock(iso);
  return az ? `${SHORT_MONTHS[az.month - 1]} ${az.day}, ${az.year}` : fmtDate(iso);
};

/** Ends column: a real date when date-based, "At N entries" when capacity-based, else a label. */
export function getEndsLabel(
  g: Pick<ConsoleGiveaway, "end_date" | "max_entries" | "ended_at" | "status">,
): { primary: string; secondary: string | null } {
  const cap = g.max_entries != null && g.max_entries > 0
    ? `${g.max_entries.toLocaleString()} ${g.max_entries === 1 ? "entry" : "entries"}`
    : null;
  let primary: string;
  if (g.end_date) primary = fmtArizonaDate(g.end_date);
  else if (cap) primary = `At ${cap}`;
  else primary = "No end set";

  let secondary: string | null = null;
  if (g.end_date && cap) secondary = `or at ${cap}`;
  if (g.status !== "active" && g.status !== "draft" && g.ended_at) {
    secondary = `Ended ${fmtDate(g.ended_at)}`;
  }
  return { primary, secondary };
}

/** 0–1 fill for the capacity bar, or null when there is no capacity. */
export function capacityRatio(g: Pick<ConsoleGiveaway, "max_entries" | "entry_count">): number | null {
  if (g.max_entries == null || g.max_entries <= 0) return null;
  return Math.max(0, Math.min(1, entriesOf(g) / g.max_entries));
}

export const formatMoney = (value: number | null | undefined): string =>
  `$${(Number(value ?? 0) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
