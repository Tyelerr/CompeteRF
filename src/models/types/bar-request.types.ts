// src/models/types/bar-request.types.ts
// ═══════════════════════════════════════════════════════════
// Bar Request (Venue Recommendation) Types
// ═══════════════════════════════════════════════════════════

export type BarRequestStatus = "pending" | "contacted" | "approved" | "rejected";

export interface BarRequest {
  id: number;
  venue_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  submitted_by: string | null;
  submitter_notes: string | null;
  status: BarRequestStatus;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBarRequestParams {
  venue_name: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  submitted_by: string;
  submitter_notes?: string;
}

export const STATUS_LABELS: Record<BarRequestStatus, string> = {
  pending: "Pending",
  contacted: "Contacted",
  approved: "Approved",
  rejected: "Rejected",
};

export const STATUS_COLORS: Record<BarRequestStatus, string> = {
  pending: "#F59E0B",
  contacted: "#3B82F6",
  approved: "#10B981",
  rejected: "#EF4444",
};
