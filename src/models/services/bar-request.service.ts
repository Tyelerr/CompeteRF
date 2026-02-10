// src/models/services/bar-request.service.ts
// ═══════════════════════════════════════════════════════════
// Bar Request (Venue Recommendation) Service
// Model layer: Supabase queries only. No React, no hooks.
// ═══════════════════════════════════════════════════════════

import { supabase } from "../../lib/supabase";
import {
  BarRequest,
  BarRequestStatus,
  CreateBarRequestParams,
} from "../types/bar-request.types";

export const barRequestService = {
  /**
   * Submit a new bar/venue recommendation.
   */
  async create(params: CreateBarRequestParams): Promise<BarRequest> {
    const { data, error } = await supabase
      .from("bar_requests")
      .insert(params)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get all requests for a user (to show "already recommended" state).
   */
  async getByUser(userId: string): Promise<BarRequest[]> {
    const { data, error } = await supabase
      .from("bar_requests")
      .select("*")
      .eq("submitted_by", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get all requests (super admin).
   */
  async getAll(statusFilter?: BarRequestStatus): Promise<BarRequest[]> {
    let query = supabase
      .from("bar_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * Get count of pending requests (for dashboard badge).
   */
  async getPendingCount(): Promise<number> {
    const { count, error } = await supabase
      .from("bar_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) throw error;
    return count || 0;
  },

  /**
   * Update request status (super admin).
   */
  async updateStatus(
    id: number,
    status: BarRequestStatus,
    adminNotes: string | null,
    reviewedBy: string,
  ): Promise<BarRequest> {
    const { data, error } = await supabase
      .from("bar_requests")
      .update({
        status,
        admin_notes: adminNotes,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
