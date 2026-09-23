// src/models/types/match-checkin.types.ts
// Per-assignment player status for an elimination match (table match_player_status).
// The row identity includes assigned_at + draw_number, so a check-in belongs to ONE assignment
// and can never carry into the next one.

export type MatchIssueReason = "running_late" | "table_missing" | "equipment" | "other";

export const MATCH_ISSUE_REASONS: { value: MatchIssueReason; label: string }[] = [
  { value: "running_late", label: "Running late" },
  { value: "table_missing", label: "Can't find table" },
  { value: "equipment", label: "Equipment issue" },
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
}

/** What the TD sees next to a player's name on an assigned match. */
export type MatchPlayerGlyph = "checked_in" | "not_checked_in" | "issue";

export const GLYPH_TEXT: Record<MatchPlayerGlyph, string> = {
  checked_in: "✓",
  not_checked_in: "○",
  issue: "?",
};
