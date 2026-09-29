// src/models/types/report.types.ts
// Follows same pattern as giveaway.types.ts

// Legacy types are inserted directly (RLS); the user-safety types (user / message / review)
// go through the submit_content_report RPC, which verifies the reporter can see the content
// and stores a server-side snapshot for moderators.
export type ReportContentType = 'tournament' | 'profile' | 'giveaway' | 'user' | 'message' | 'review';
export type ReportReason = 'inappropriate' | 'spam' | 'misleading' | 'harassment' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

/** Content types that must be submitted through the submit_content_report RPC. */
export const RPC_REPORT_TYPES: readonly ReportContentType[] = ['user', 'message', 'review'];

export const isRpcReportType = (t: ReportContentType): boolean => RPC_REPORT_TYPES.includes(t);

/** Server-captured context for user / message / review reports (admin-only read). */
export interface ReportContentSnapshot {
  // user
  user_name?: string | null;
  name?: string | null;
  role?: string | null;
  // message
  body?: string | null;
  sent_at?: string | null;
  sender_name?: string | null;
  sender_user_name?: string | null;
  is_support?: boolean | null;
  // review
  rating?: number | null;
  comment?: string | null;
  reasons?: string[] | null;
  tournament_id?: number | null;
  tournament_name?: string | null;
}

/** Full report record from the database */
export interface Report {
  id: string;
  reporter_id: string;
  content_type: ReportContentType;
  content_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reported_user_id?: string | null;
  content_snapshot?: ReportContentSnapshot | null;
}

/** Payload for creating a new report */
export interface CreateReportPayload {
  reporter_id: string;
  content_type: ReportContentType;
  content_id: string;
  reason: ReportReason;
  details?: string;
}

/** Payload for admin review/resolve */
export interface UpdateReportPayload {
  status: ReportStatus;
  reviewed_by: string;
  reviewed_at: string;
}

/** Display labels for reason dropdown in ReportModal */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  inappropriate: 'Inappropriate Content',
  spam: 'Spam',
  misleading: 'Misleading Information',
  harassment: 'Harassment or Abuse',
  other: 'Other',
};

/** Display labels for content types */
export const CONTENT_TYPE_LABELS: Record<ReportContentType, string> = {
  tournament: 'Tournament',
  profile: 'Profile',
  giveaway: 'Giveaway Entry',
  user: 'User',
  message: 'Message',
  review: 'Review',
};
