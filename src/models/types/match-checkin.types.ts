// src/models/types/match-checkin.types.ts
// Per-assignment player status for an elimination match (table match_player_status).
// The row identity includes assigned_at + draw_number, so a check-in belongs to ONE assignment
// and can never carry into the next one.

export type MatchIssueReason =
  | "running_late"
  | "table_missing"
  | "equipment"
  | "opponent_not_here"
  | "dispute"
  | "watch_shot"
  | "other";

export const MATCH_ISSUE_REASONS: { value: MatchIssueReason; label: string }[] = [
  { value: "running_late", label: "Running late" },
  { value: "table_missing", label: "Can't find table" },
  { value: "equipment", label: "Equipment issue" },
  { value: "opponent_not_here", label: "Opponent not here" },
  // mid-match reasons — Contact TD is available while the match is in progress too
  { value: "dispute", label: "Dispute / Need TD" },
  { value: "watch_shot", label: "Need shot watched" },
  { value: "other", label: "Other" },
];

export const issueReasonLabel = (reason: MatchIssueReason | null | undefined): string =>
  MATCH_ISSUE_REASONS.find((r) => r.value === reason)?.label ?? "Needs help";

export interface MatchPlayerStatus {
  id: number;
  tournament_id: number;
  match_id: string;
  registration_id: number;
  assigned_at: string;
  draw_number: number;
  checked_in_at: string | null;
  issue_reason: MatchIssueReason | null;
  issue_message: string | null;
  issue_at: string | null;
  resolved_at: string | null;
  // Who confirmed presence: the player themselves, or a manager (guest / no phone / verbal).
  checked_in_by?: string | null;
  checked_in_source?: "player" | "manager" | null;
}

/** Match-level facts for ONE assignment (table match_assignment_status). */
export interface MatchAssignmentStatus {
  id: number;
  tournament_id: number;
  match_id: string;
  assigned_at: string;
  draw_number: number;
  /** TD "Extend Time" for this assignment only; tournament defaults never change. */
  extended_minutes: number;
  extended_at: string | null;
  review_alert_at: string | null;
}

/**
 * What the TD sees next to a player's name on an assigned match. Check-in ONLY — an unresolved
 * "Contact TD" message is a separate red "✉ View Message" indicator, so the two never overwrite
 * each other. (Room is left here for the future check-in timer states.)
 */
export type MatchPlayerGlyph = "checked_in" | "not_checked_in";

export const GLYPH_TEXT: Record<MatchPlayerGlyph, string> = {
  checked_in: "✓",
  not_checked_in: "○",
};

export const VIEW_MESSAGE_LABEL = "✉ View Message";
