// src/models/services/report.service.ts
// Follows same pattern as giveaway.service.ts

import { supabase } from '@/src/lib/supabase';
import { notificationDispatcher } from '@/src/models/services/notification-dispatcher.service';
import {
  CreateReportPayload,
  isRpcReportType,
  Report,
  ReportContentType,
  ReportStatus,
  UpdateReportPayload,
} from '@/src/models/types/report.types';
import { reportErrorMessage } from '@/src/utils/user-safety';

/**
 * Submit a new report from an authenticated user.
 * RLS ensures reporter_id must match auth.uid().
 */
export async function submitReport(payload: CreateReportPayload): Promise<Pick<Report, 'id'>> {
  let data: Pick<Report, 'id'>;

  if (isRpcReportType(payload.content_type)) {
    // User / message / review: server verifies the reporter can see the content and
    // snapshots it for moderators (private DMs and TD-only reviews aren't admin-readable).
    const { data: reportId, error } = await supabase.rpc('submit_content_report', {
      p_content_type: payload.content_type,
      p_content_id: payload.content_id,
      p_reason: payload.reason,
      p_details: payload.details ?? null,
    });
    if (error || !reportId) {
      console.error('[ReportService] submit_content_report error:', error);
      throw new Error(reportErrorMessage(error?.message));
    }
    data = { id: reportId as string };
  } else {
    const { data: row, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: payload.reporter_id,
        content_type: payload.content_type,
        content_id: payload.content_id,
        reason: payload.reason,
        details: payload.details ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ReportService] submitReport error:', error);
      throw new Error(error.message);
    }
    data = row as Pick<Report, 'id'>;
  }

  // ══════════════════════════════════════════════════════════
  // 🔔 Phase 4: Notify admins about new report
  // ══════════════════════════════════════════════════════════
  const contentLabel = payload.content_type.replace('_', ' ');
  notificationDispatcher
    .sendToAdmins(
      '🚩 New Report Submitted',
      `A ${contentLabel} has been reported for: ${payload.reason}`,
      {
        report_id: data.id,
        content_type: payload.content_type,
        content_id: payload.content_id,
        deep_link: '/admin/report-management',
        type: 'admin_report',
      },
    )
    .catch((err) =>
      console.error('⚠️ Error sending report notification to admins:', err),
    );

  return data;
}

/**
 * Check if the current user already reported a specific piece of content.
 * Prevents duplicate reports and drives UI feedback ("Already Reported").
 */
export async function hasUserReported(
  reporterId: string,
  contentType: ReportContentType,
  contentId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', reporterId)
    .eq('content_type', contentType)
    .eq('content_id', contentId);

  if (error) {
    console.error('[ReportService] hasUserReported error:', error);
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * Get all reports - admin only (guarded by RLS).
 * Supports filtering by status and content_type.
 */
export async function getReports(filters?: {
  status?: ReportStatus;
  contentType?: ReportContentType;
  limit?: number;
  offset?: number;
}): Promise<{ data: Report[]; count: number }> {
  let query = supabase
    .from('reports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.contentType) {
    query = query.eq('content_type', filters.contentType);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit ?? 20) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[ReportService] getReports error:', error);
    throw new Error(error.message);
  }

  return { data: (data as Report[]) ?? [], count: count ?? 0 };
}

/**
 * Update a report's status - admin only (guarded by RLS).
 */
export async function updateReportStatus(
  reportId: string,
  payload: UpdateReportPayload
): Promise<Report> {
  const { data, error } = await supabase
    .from('reports')
    .update({
      status: payload.status,
      reviewed_by: payload.reviewed_by,
      reviewed_at: payload.reviewed_at,
    })
    .eq('id', reportId)
    .select()
    .single();

  if (error) {
    console.error('[ReportService] updateReportStatus error:', error);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Report update failed - no data returned (possible RLS block).');
  }

  return data as Report;
}
