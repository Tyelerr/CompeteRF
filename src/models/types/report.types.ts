// src/models/types/report.types.ts
// Follows same pattern as giveaway.types.ts

export type ReportContentType = 'tournament' | 'profile' | 'giveaway';
export type ReportReason = 'inappropriate' | 'spam' | 'misleading' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

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
  other: 'Other',
};

/** Display labels for content types */
export const CONTENT_TYPE_LABELS: Record<ReportContentType, string> = {
  tournament: 'Tournament',
  profile: 'Profile',
  giveaway: 'Giveaway Entry',
};
