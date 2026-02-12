// src/models/services/report.service.ts
// Follows same pattern as giveaway.service.ts

import { supabase } from '@/src/lib/supabase'; // Adjust path to match your project
import {
  CreateReportPayload,
  Report,
  ReportContentType,
  ReportStatus,
  UpdateReportPayload,
} from '@/src/models/types/report.types';

/**
 * Submit a new report from an authenticated user.
 * RLS ensures reporter_id must match auth.uid().
 */
export async function submitReport(payload: CreateReportPayload): Promise<Report> {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: payload.reporter_id,
      content_type: payload.content_type,
      content_id: payload.content_id,
      reason: payload.reason,
      details: payload.details ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[ReportService] submitReport error:', error);
    throw new Error(error.message);
  }

  return data as Report;
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
 * Get all reports — admin only (guarded by RLS).
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
 * Update a report's status — admin only (guarded by RLS).
 * Uses .select().single() to catch silent RLS failures
 * (same pattern as the fix in useEditUser.ts).
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
    throw new Error('Report update failed — no data returned (possible RLS block).');
  }

  return data as Report;
}
