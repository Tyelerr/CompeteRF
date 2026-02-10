// src/viewmodels/hooks/use.bar.requests.ts
// ═══════════════════════════════════════════════════════════
// Bar Requests Management Hook (Super Admin only)
// ViewModel layer: React hooks + service calls. No JSX.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { barRequestService } from "../../models/services/bar-request.service";
import {
  BarRequest,
  BarRequestStatus,
} from "../../models/types/bar-request.types";
import { useAuthContext } from "../../providers/AuthProvider";

export interface UseBarRequestsReturn {
  loading: boolean;
  refreshing: boolean;
  requests: BarRequest[];
  statusFilter: BarRequestStatus | "all";
  setStatusFilter: (filter: BarRequestStatus | "all") => void;
  pendingCount: number;
  contactedCount: number;
  approvedCount: number;
  rejectedCount: number;
  updateStatus: (
    id: number,
    status: BarRequestStatus,
    notes?: string,
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function useBarRequests(): UseBarRequestsReturn {
  const { user } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allRequests, setAllRequests] = useState<BarRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<BarRequestStatus | "all">(
    "all",
  );

  // —— Load ——

  const loadRequests = useCallback(async () => {
    try {
      const data = await barRequestService.getAll();
      setAllRequests(data);
    } catch (err) {
      console.error("Error loading bar requests:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // —— Computed ——

  const requests =
    statusFilter === "all"
      ? allRequests
      : allRequests.filter((r) => r.status === statusFilter);

  const pendingCount = allRequests.filter((r) => r.status === "pending").length;
  const contactedCount = allRequests.filter(
    (r) => r.status === "contacted",
  ).length;
  const approvedCount = allRequests.filter(
    (r) => r.status === "approved",
  ).length;
  const rejectedCount = allRequests.filter(
    (r) => r.status === "rejected",
  ).length;

  // —— Actions ——

  const updateStatus = useCallback(
    async (id: number, status: BarRequestStatus, notes?: string) => {
      if (!user?.id) return;

      try {
        await barRequestService.updateStatus(
          id,
          status,
          notes || null,
          user.id,
        );

        // Update local state
        setAllRequests((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status,
                  admin_notes: notes || r.admin_notes,
                  reviewed_by: user.id,
                  reviewed_at: new Date().toISOString(),
                }
              : r,
          ),
        );

        Alert.alert("Updated", `Request marked as ${status}.`);
      } catch (err) {
        console.error("Error updating bar request:", err);
        Alert.alert("Error", "Failed to update request.");
      }
    },
    [user?.id],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRequests();
  }, [loadRequests]);

  return {
    loading,
    refreshing,
    requests,
    statusFilter,
    setStatusFilter,
    pendingCount,
    contactedCount,
    approvedCount,
    rejectedCount,
    updateStatus,
    onRefresh,
  };
}
