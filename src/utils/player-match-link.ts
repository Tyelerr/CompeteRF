// src/utils/player-match-link.ts
// Where a tapped "Table Assigned" / "Table Changed" notification actually lands, and what the
// screen should do when it gets there. Pure: no React, no navigation, no Supabase.
//
// The push carries the EXACT assignment (tournament, match, assignedAt — built by
// supabase/functions/_shared/assignment_message.ts). A tap can arrive minutes later, so the
// target is re-resolved against the player's live state:
//
//   exact assignment still current      → open the Check-In modal for it
//   assignment changed, but the player
//   has another active assigned match   → open that match instead (their real current context)
//   no active assigned match left       → Tournament View + "This match is no longer active."
//   tournament/player context unknown   → generic tournament details (last resort only)
export type PlayerMatchTargetKind = "check_in" | "current_match" | "no_active_match" | "tournament_detail";

export interface AssignmentLinkParams {
  tournamentId: number | null;
  matchId: string | null;
  assignedAt: string | null;
  action: string | null;
}

export interface PlayerMatchTarget {
  kind: PlayerMatchTargetKind;
  tournamentId: number | null;
  matchId: string | null;
  /** Shown as a small notice in Tournament View. */
  notice?: string;
}

export const STALE_MATCH_NOTICE = "This match is no longer active.";

/** Query params of a notification deep link (accepts the raw string or an expo-router params object). */
export const parseAssignmentDeepLink = (
  input: string | Record<string, string | string[] | undefined> | null | undefined,
): AssignmentLinkParams => {
  const get = (key: string): string | null => {
    if (!input) return null;
    if (typeof input === "string") {
      const qs = input.includes("?") ? input.slice(input.indexOf("?") + 1) : "";
      return new URLSearchParams(qs).get(key);
    }
    const v = input[key];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };
  const idRaw = get("liveId") ?? get("tournament_id") ?? get("id");
  const id = idRaw != null && /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  return {
    tournamentId: id,
    matchId: get("matchId") ?? get("match_id"),
    assignedAt: get("assignedAt") ?? get("assigned_at"),
    action: get("action"),
  };
};

/** The player's live match as the app already knows it (usePlayerLiveMatch / profile hub). */
export interface PlayerMatchSnapshot {
  tournamentId: number | null;
  matchId: string | null;
  assignedAt: string | null;
  tableId: number | null;
  status: string | null; // "scheduled" | "in_progress" | "completed" | …
}

const isActive = (m: PlayerMatchSnapshot | null | undefined): boolean =>
  !!m && m.matchId != null && m.tableId != null && m.status !== "completed";

export const resolvePlayerMatchTarget = (
  link: AssignmentLinkParams,
  current: PlayerMatchSnapshot | null | undefined,
): PlayerMatchTarget => {
  // Can't even tell which tournament → generic details (the only case that still uses it).
  if (link.tournamentId == null) {
    return { kind: "tournament_detail", tournamentId: null, matchId: null };
  }
  const sameTournament = current?.tournamentId === link.tournamentId;
  if (!sameTournament || !isActive(current)) {
    return {
      kind: "no_active_match",
      tournamentId: link.tournamentId,
      matchId: null,
      notice: STALE_MATCH_NOTICE,
    };
  }
  const sameMatch = current!.matchId === link.matchId;
  const sameAssignment =
    link.assignedAt == null || // older payloads: match identity is the best we have
    (current!.assignedAt != null && Date.parse(current!.assignedAt) === Date.parse(link.assignedAt));
  if (sameMatch && sameAssignment) {
    return { kind: "check_in", tournamentId: link.tournamentId, matchId: current!.matchId };
  }
  // Their assignment moved on (new table, or a different match is up now): show what is true now.
  return {
    kind: "current_match",
    tournamentId: link.tournamentId,
    matchId: current!.matchId,
    notice: STALE_MATCH_NOTICE,
  };
};
