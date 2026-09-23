import { useCallback, useEffect, useMemo, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import { giveawayWalletService } from "../models/services/giveaway-wallet.service";
import { FraudReport } from "../models/services/fraud-detection.service";
import { Giveaway, WinnerHistoryRecord } from "../models/types/giveaway.types";
import { useAuthStore } from "./stores/auth.store";

export type GiveawayStatusFilter =
  | "draft"
  | "active"
  | "ended"
  | "awarded"
  | "archived"
  | "cancelled"
  | "all";
export type GiveawaySortOption = "date" | "name" | "entries";
export type AdminTab = "giveaways" | "manage";

export interface AdminGiveaway extends Giveaway {
  winner_name?: string | null;
  winner_email?: string | null;
}

export interface AdminStats {
  activeCount: number;
  totalEntries: number;
  totalPrizeValue: number;
  totalGiveaways: number;
  totalAwarded: number;
  frequency: string;
}

export interface CurrentWinner {
  id: number;
  user_id: number;
  name: string;
  email: string;
  phone: string;
  drawn_at: string;
}

/** Messages for publish_giveaway refusals. */
export const WALLET_PUBLISH_HOLD_MESSAGE =
  "Wallet giveaways require the latest mobile app version before they can be published.";
const PUBLISH_ERRORS: Record<string, string> = {
  wallet_publish_on_hold: WALLET_PUBLISH_HOLD_MESSAGE,
  end_date_in_past: "The end date is in the past — edit the giveaway first.",
  end_condition_required: "Set an end date or a maximum number of entries first.",
  name_required: "Give the giveaway a name first.",
  per_user_max_exceeds_capacity: "Max entries per user can't exceed the total capacity.",
  not_draft: "Only drafts can be published.",
  not_found: "Giveaway not found.",
};

/** Adapts the wallet draw RPC to the legacy drawWinner result shape the screen already uses. */
async function drawWalletWinner(giveawayId: number, redrawReason?: string) {
  const res = await giveawayWalletService.drawWinner(giveawayId, redrawReason);
  if (!res.ok || !res.winner) {
    const messages: Record<string, string> = {
      not_ended: "End the giveaway before drawing a winner.",
      not_awarded: "This giveaway has no winner to redraw.",
      no_eligible_entries: "No eligible entries remain.",
      reason_required: "A reason is required to redraw.",
    };
    return { success: false as const, error: messages[res.status] ?? "Draw failed. Please try again." };
  }
  giveawayService.notifyDrawResult(giveawayId, res.winner.user_id, !!redrawReason).catch(() => {});
  return {
    success: true as const,
    winner: {
      id: res.winner.entry_id,
      user_id: res.winner.user_id,
      name: res.winner.name,
      email: res.winner.email,
      phone: res.winner.phone,
    },
    fraudReport: undefined,
  };
}

export const useAdminGiveaways = () => {
  const profile = useAuthStore((state) => state.profile);

  const [activeTab, setActiveTab] = useState<AdminTab>("giveaways");
  const [giveaways, setGiveaways] = useState<AdminGiveaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);

  const [stats, setStats] = useState<AdminStats>({
    activeCount: 0,
    totalEntries: 0,
    totalPrizeValue: 0,
    totalGiveaways: 0,
    totalAwarded: 0,
    frequency: "Ongoing",
  });

  const [statusFilter, setStatusFilter] = useState<GiveawayStatusFilter>("active");
  const [sortOption, setSortOption] = useState<GiveawaySortOption>("date");
  const [searchQuery, setSearchQuery] = useState("");

  // Draw Modal state
  const [drawModalVisible, setDrawModalVisible] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [winnerModalVisible, setWinnerModalVisible] = useState(false);
  const [selectedGiveaway, setSelectedGiveaway] = useState<AdminGiveaway | null>(null);
  const [drawnWinner, setDrawnWinner] = useState<{
    id: number;
    user_id: number;
    name: string;
    email: string;
    phone: string;
  } | null>(null);
  // Fraud report from the most recent drawWinner call
  const [winnerFraudReport, setWinnerFraudReport] = useState<FraudReport | null>(null);

  // Winner Details Modal state
  const [winnerDetailsModalVisible, setWinnerDetailsModalVisible] = useState(false);
  const [currentWinner, setCurrentWinner] = useState<CurrentWinner | null>(null);
  const [winnerHistory, setWinnerHistory] = useState<WinnerHistoryRecord[]>([]);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [loadingWinnerDetails, setLoadingWinnerDetails] = useState(false);

  // Redraw Modal state
  const [redrawModalVisible, setRedrawModalVisible] = useState(false);
  const [redrawReason, setRedrawReason] = useState("");
  const [redrawing, setRedrawing] = useState(false);
  const [redrawError, setRedrawError] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [giveawaysData, statsData] = await Promise.all([
        giveawayService.getAllGiveaways(),
        giveawayService.getAdminStats(),
      ]);

      setGiveaways(giveawaysData as AdminGiveaway[]);

      const totalGiveaways = giveawaysData.length;
      const awardedGiveaways = giveawaysData.filter((g) => g.status === "awarded");
      const totalAwarded = awardedGiveaways.reduce(
        (sum, g) => sum + (g.prize_value || 0), 0,
      );

      let frequency = "Ongoing";
      if (awardedGiveaways.length >= 2) {
        const dates = awardedGiveaways
          .filter((g) => g.winner_drawn_at)
          .map((g) => new Date(g.winner_drawn_at!).getTime())
          .sort((a, b) => a - b);
        if (dates.length >= 2) {
          const daySpan = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
          const avgDays = daySpan / (dates.length - 1);
          if (avgDays <= 7) frequency = "Weekly";
          else if (avgDays <= 14) frequency = "Bi-weekly";
          else if (avgDays <= 35) frequency = "Monthly";
        }
      }

      setStats({ ...statsData, totalGiveaways, totalAwarded, frequency });
    } catch (error) {
      console.error("Error loading giveaways:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ── Filter / sort ─────────────────────────────────────────────────────────
  const filteredGiveaways = useMemo(() => {
    let result = [...giveaways];
    if (statusFilter !== "all") {
      result = result.filter((g) => g.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (g) => g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q),
      );
    }
    switch (sortOption) {
      case "date":
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "entries":
        result.sort((a, b) => (b.entry_count || 0) - (a.entry_count || 0));
        break;
    }
    return result;
  }, [giveaways, statusFilter, sortOption, searchQuery]);

  const statusCounts = useMemo(() => ({
    active:   giveaways.filter((g) => g.status === "active").length,
    ended:    giveaways.filter((g) => g.status === "ended").length,
    awarded:  giveaways.filter((g) => g.status === "awarded").length,
    archived: giveaways.filter((g) => g.status === "archived").length,
    cancelled: giveaways.filter((g) => g.status === "cancelled").length,
    draft:    giveaways.filter((g) => g.status === "draft").length,
    all:      giveaways.length,
  }), [giveaways]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleEndGiveaway = useCallback(async (giveawayId: number): Promise<boolean> => {
    setProcessing(giveawayId);
    try {
      const result = await giveawayService.endGiveaway(giveawayId);
      if (result.success) {
        setGiveaways((prev) =>
          prev.map((g) =>
            g.id === giveawayId
              ? { ...g, status: "ended" as const, ended_at: new Date().toISOString() }
              : g,
          ),
        );
        setStats((prev) => ({ ...prev, activeCount: Math.max(0, prev.activeCount - 1) }));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error ending giveaway:", error);
      return false;
    } finally {
      setProcessing(null);
    }
  }, []);

  const handleDrawWinner = useCallback(async (giveawayId: number): Promise<boolean> => {
    const currentProfile = useAuthStore.getState().profile;
    if (!currentProfile?.id_auto) {
      setDrawError("You must be logged in to draw a winner.");
      return false;
    }

    setDrawError(null);
    setProcessing(giveawayId);

    try {
      const target = giveaways.find((g) => g.id === giveawayId);
      // Wallet giveaways: server-side weighted draw (quantity = tickets). Legacy: unchanged flow.
      const result = target?.entry_mode === "wallet"
        ? await drawWalletWinner(giveawayId)
        : await giveawayService.drawWinner(giveawayId, currentProfile.id_auto);

      if (result.success && result.winner) {
        setDrawnWinner(result.winner);
        setWinnerFraudReport(result.fraudReport || null);
        setDrawModalVisible(false);
        setDrawError(null);
        setWinnerModalVisible(true);

        setGiveaways((prev) =>
          prev.map((g) =>
            g.id === giveawayId
              ? {
                  ...g,
                  status: "awarded" as const,
                  winner_id: result.winner!.user_id,
                  winner_name: result.winner!.name,
                  winner_email: result.winner!.email,
                  winner_drawn_at: new Date().toISOString(),
                }
              : g,
          ),
        );
        return true;
      } else {
        const msg = result.error || "Failed to draw a winner. Please try again.";
        console.error("Draw winner failed:", msg);
        setDrawError(msg);
        return false;
      }
    } catch (error: any) {
      const msg = error?.message || "An unexpected error occurred.";
      console.error("Error drawing winner:", error);
      setDrawError(msg);
      return false;
    } finally {
      setProcessing(null);
    }
  }, [giveaways]);

  const handleArchiveGiveaway = useCallback(async (giveawayId: number): Promise<boolean> => {
    setProcessing(giveawayId);
    try {
      const result = await giveawayService.archiveGiveaway(giveawayId);
      if (result.success) {
        setGiveaways((prev) =>
          prev.map((g) =>
            g.id === giveawayId
              ? { ...g, status: "archived" as const, archived_at: new Date().toISOString() }
              : g,
          ),
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error archiving giveaway:", error);
      return false;
    } finally {
      setProcessing(null);
    }
  }, []);

  const handleRestoreGiveaway = useCallback(async (giveawayId: number): Promise<boolean> => {
    setProcessing(giveawayId);
    try {
      const result = await giveawayService.restoreGiveaway(giveawayId);
      if (result.success) { await loadData(); return true; }
      return false;
    } catch (error) {
      console.error("Error restoring giveaway:", error);
      return false;
    } finally {
      setProcessing(null);
    }
  }, [loadData]);

  // ── Draw modal ────────────────────────────────────────────────────────────
  const openDrawModal = useCallback((giveaway: AdminGiveaway) => {
    setSelectedGiveaway(giveaway);
    setDrawError(null);
    setDrawModalVisible(true);
  }, []);

  const closeDrawModal = useCallback(() => {
    setDrawModalVisible(false);
    setDrawError(null);
    setSelectedGiveaway(null);
  }, []);

  const closeWinnerModal = useCallback(() => {
    setWinnerModalVisible(false);
    setDrawnWinner(null);
    setWinnerFraudReport(null);
    setSelectedGiveaway(null);
  }, []);

  // ── Winner Details & Redraw ───────────────────────────────────────────────
  const openWinnerDetailsModal = useCallback(async (giveaway: AdminGiveaway) => {
    setSelectedGiveaway(giveaway);
    setLoadingWinnerDetails(true);
    setWinnerDetailsModalVisible(true);
    try {
      const [winner, history, eligible] = await Promise.all([
        giveawayService.getCurrentWinner(giveaway.id),
        giveawayService.getWinnerHistory(giveaway.id),
        giveawayService.getEligibleEntryCount(giveaway.id),
      ]);
      setCurrentWinner(winner);
      setWinnerHistory(history);
      setEligibleCount(eligible);
    } catch (error) {
      console.error("Error loading winner details:", error);
    } finally {
      setLoadingWinnerDetails(false);
    }
  }, []);

  const closeWinnerDetailsModal = useCallback(() => {
    setWinnerDetailsModalVisible(false);
    setSelectedGiveaway(null);
    setCurrentWinner(null);
    setWinnerHistory([]);
    setEligibleCount(0);
  }, []);

  const openRedrawModal = useCallback(() => {
    setWinnerDetailsModalVisible(false);
    setRedrawReason("");
    setRedrawError(null);
    setRedrawModalVisible(true);
  }, []);

  const closeRedrawModal = useCallback(() => {
    setRedrawModalVisible(false);
    setRedrawReason("");
    setRedrawError(null);
  }, []);

  const handleRedrawWinner = useCallback(async (): Promise<boolean> => {
    const currentProfile = useAuthStore.getState().profile;
    if (!currentProfile?.id_auto || !selectedGiveaway || !redrawReason.trim()) return false;

    setRedrawing(true);
    setRedrawError(null);
    try {
      const result = selectedGiveaway.entry_mode === "wallet"
        ? await drawWalletWinner(selectedGiveaway.id, redrawReason.trim())
        : await giveawayService.redrawWinner(
            selectedGiveaway.id,
            currentProfile.id_auto,
            redrawReason.trim(),
          );
      if (result.success && result.winner) {
        setGiveaways((prev) =>
          prev.map((g) =>
            g.id === selectedGiveaway.id
              ? {
                  ...g,
                  winner_id: result.winner!.user_id,
                  winner_name: result.winner!.name,
                  winner_email: result.winner!.email,
                  winner_drawn_at: new Date().toISOString(),
                }
              : g,
          ),
        );
        setSelectedGiveaway((prev) =>
          prev
            ? {
                ...prev,
                winner_id: result.winner!.user_id,
                winner_name: result.winner!.name,
                winner_email: result.winner!.email,
                winner_drawn_at: new Date().toISOString(),
              }
            : null,
        );
        setCurrentWinner({
          id: result.winner.id,
          user_id: result.winner.user_id,
          name: result.winner.name,
          email: result.winner.email,
          phone: result.winner.phone,
          drawn_at: new Date().toISOString(),
        });
        const [history, eligible] = await Promise.all([
          giveawayService.getWinnerHistory(selectedGiveaway.id),
          giveawayService.getEligibleEntryCount(selectedGiveaway.id),
        ]);
        setWinnerHistory(history);
        setEligibleCount(eligible);
        closeRedrawModal();
        return true;
      } else {
        const msg = result.error || "Redraw failed. Please try again.";
        console.error("Redraw failed:", msg);
        setRedrawError(msg);
        return false;
      }
    } catch (error: any) {
      const msg = error?.message || "An unexpected error occurred.";
      console.error("Error redrawing winner:", error);
      setRedrawError(msg);
      return false;
    } finally {
      setRedrawing(false);
    }
  }, [selectedGiveaway, redrawReason, closeRedrawModal]);

  // ── Publish (Draft → Active) ────────────────────────────────────────────────
  const [publishTarget, setPublishTarget] = useState<AdminGiveaway | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const openPublishModal = useCallback((g: AdminGiveaway) => {
    setPublishTarget(g);
    setPublishError(null);
  }, []);
  const closePublishModal = useCallback(() => {
    if (!publishing) setPublishTarget(null);
  }, [publishing]);

  const confirmPublish = useCallback(async (): Promise<boolean> => {
    if (!publishTarget) return false;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await giveawayService.publishGiveaway(publishTarget.id);
      if (res.status === "published" || res.status === "already_published") {
        setGiveaways((prev) =>
          prev.map((g) => (g.id === publishTarget.id ? { ...g, status: "active" as const, published_at: new Date().toISOString() } : g)),
        );
        setStats((prev) => ({ ...prev, activeCount: prev.activeCount + (res.status === "published" ? 1 : 0) }));
        setPublishTarget(null);
        return true;
      }
      setPublishError(PUBLISH_ERRORS[res.status] ?? "Couldn't publish. Please try again.");
      return false;
    } catch (error: any) {
      setPublishError(error?.message || "An unexpected error occurred.");
      return false;
    } finally {
      setPublishing(false);
    }
  }, [publishTarget]);

  // ── Cancel & Refund (wallet giveaways only; distinct from End Early) ───────
  const [cancelTarget, setCancelTarget] = useState<AdminGiveaway | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const openCancelModal = useCallback((g: AdminGiveaway) => {
    setCancelTarget(g);
    setCancelReason("");
    setCancelError(null);
  }, []);
  const closeCancelModal = useCallback(() => {
    if (!cancelling) setCancelTarget(null);
  }, [cancelling]);

  const confirmCancelAndRefund = useCallback(async (): Promise<boolean> => {
    if (!cancelTarget || !cancelReason.trim()) return false;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await giveawayWalletService.cancelAndRefund(cancelTarget.id, cancelReason.trim());
      if (!res.ok) {
        setCancelError(
          res.status === "not_cancellable" ? "Only active or ended wallet giveaways can be cancelled."
          : res.status === "reason_required" ? "A reason is required."
          : "Cancel failed. Please try again.",
        );
        return false;
      }
      setGiveaways((prev) =>
        prev.map((g) => (g.id === cancelTarget.id ? { ...g, status: "cancelled" as const, cancel_reason: cancelReason.trim() } : g)),
      );
      setCancelTarget(null);
      return true;
    } catch (error: any) {
      setCancelError(error?.message || "An unexpected error occurred.");
      return false;
    } finally {
      setCancelling(false);
    }
  }, [cancelTarget, cancelReason]);

  const getDaysRemaining = useCallback((endDate: string | null): string => {
    if (!endDate) return "No end date";
    const now = new Date();
    const end = new Date(endDate);
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "Ended";
    if (diffDays === 0) return "Ends today";
    if (diffDays === 1) return "Ends tomorrow";
    return `Ends in ${diffDays} days`;
  }, []);

  return {
    activeTab, setActiveTab,
    giveaways: filteredGiveaways, stats, statusCounts,
    loading, refreshing, processing,
    statusFilter, sortOption, searchQuery,
    setStatusFilter, setSortOption, setSearchQuery,
    drawModalVisible, drawError, winnerModalVisible,
    selectedGiveaway, drawnWinner, winnerFraudReport,
    openDrawModal, closeDrawModal, closeWinnerModal,
    winnerDetailsModalVisible, currentWinner, winnerHistory,
    eligibleCount, loadingWinnerDetails,
    openWinnerDetailsModal, closeWinnerDetailsModal,
    redrawModalVisible, redrawReason, redrawError,
    setRedrawReason, redrawing,
    openRedrawModal, closeRedrawModal, handleRedrawWinner,
    onRefresh,
    endGiveaway: handleEndGiveaway,
    drawWinner: handleDrawWinner,
    archiveGiveaway: handleArchiveGiveaway,
    restoreGiveaway: handleRestoreGiveaway,
    publishTarget, publishing, publishError, openPublishModal, closePublishModal, confirmPublish,
    cancelTarget, cancelReason, setCancelReason, cancelling, cancelError,
    openCancelModal, closeCancelModal, confirmCancelAndRefund,
    getDaysRemaining,
  };
};
