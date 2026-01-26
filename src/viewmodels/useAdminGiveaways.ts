import { useCallback, useEffect, useMemo, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import { Giveaway, WinnerHistoryRecord } from "../models/types/giveaway.types";
import { useAuthContext } from "../providers/AuthProvider";

export type GiveawayStatusFilter =
  | "active"
  | "ended"
  | "awarded"
  | "archived"
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

export const useAdminGiveaways = () => {
  const { profile } = useAuthContext();

  // Tab state
  const [activeTab, setActiveTab] = useState<AdminTab>("giveaways");

  // Data state
  const [giveaways, setGiveaways] = useState<AdminGiveaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);

  // Overview stats
  const [stats, setStats] = useState<AdminStats>({
    activeCount: 0,
    totalEntries: 0,
    totalPrizeValue: 0,
    totalGiveaways: 0,
    totalAwarded: 0,
    frequency: "Ongoing",
  });

  // Filters
  const [statusFilter, setStatusFilter] =
    useState<GiveawayStatusFilter>("active");
  const [sortOption, setSortOption] = useState<GiveawaySortOption>("date");
  const [searchQuery, setSearchQuery] = useState("");

  // Draw Modal state
  const [drawModalVisible, setDrawModalVisible] = useState(false);
  const [winnerModalVisible, setWinnerModalVisible] = useState(false);
  const [selectedGiveaway, setSelectedGiveaway] =
    useState<AdminGiveaway | null>(null);
  const [drawnWinner, setDrawnWinner] = useState<{
    id: number;
    user_id: number;
    name: string;
    email: string;
    phone: string;
  } | null>(null);

  // Winner Details Modal state (for viewing winner + redraw)
  const [winnerDetailsModalVisible, setWinnerDetailsModalVisible] =
    useState(false);
  const [currentWinner, setCurrentWinner] = useState<CurrentWinner | null>(
    null,
  );
  const [winnerHistory, setWinnerHistory] = useState<WinnerHistoryRecord[]>([]);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [loadingWinnerDetails, setLoadingWinnerDetails] = useState(false);

  // Redraw Confirm Modal state
  const [redrawModalVisible, setRedrawModalVisible] = useState(false);
  const [redrawReason, setRedrawReason] = useState("");
  const [redrawing, setRedrawing] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [giveawaysData, statsData] = await Promise.all([
        giveawayService.getAllGiveaways(),
        giveawayService.getAdminStats(),
      ]);

      setGiveaways(giveawaysData as AdminGiveaway[]);

      // Calculate additional stats
      const totalGiveaways = giveawaysData.length;
      const awardedGiveaways = giveawaysData.filter(
        (g) => g.status === "awarded",
      );
      const totalAwarded = awardedGiveaways.reduce(
        (sum, g) => sum + (g.prize_value || 0),
        0,
      );

      // Calculate frequency
      let frequency = "Ongoing";
      if (awardedGiveaways.length >= 2) {
        const dates = awardedGiveaways
          .filter((g) => g.winner_drawn_at)
          .map((g) => new Date(g.winner_drawn_at!).getTime())
          .sort((a, b) => a - b);

        if (dates.length >= 2) {
          const daySpan =
            (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
          const avgDays = daySpan / (dates.length - 1);

          if (avgDays <= 7) frequency = "Weekly";
          else if (avgDays <= 14) frequency = "Bi-weekly";
          else if (avgDays <= 35) frequency = "Monthly";
        }
      }

      setStats({
        ...statsData,
        totalGiveaways,
        totalAwarded,
        frequency,
      });
    } catch (error) {
      console.error("Error loading giveaways:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Filter and sort giveaways
  const filteredGiveaways = useMemo(() => {
    let result = [...giveaways];

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((g) => g.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (g) =>
          g.name.toLowerCase().includes(query) ||
          g.description?.toLowerCase().includes(query),
      );
    }

    // Sort
    switch (sortOption) {
      case "date":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
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

  // Status counts
  const statusCounts = useMemo(() => {
    return {
      active: giveaways.filter((g) => g.status === "active").length,
      ended: giveaways.filter((g) => g.status === "ended").length,
      awarded: giveaways.filter((g) => g.status === "awarded").length,
      archived: giveaways.filter((g) => g.status === "archived").length,
      all: giveaways.length,
    };
  }, [giveaways]);

  // End giveaway
  const handleEndGiveaway = useCallback(
    async (giveawayId: number): Promise<boolean> => {
      setProcessing(giveawayId);
      try {
        const result = await giveawayService.endGiveaway(giveawayId);
        if (result.success) {
          setGiveaways((prev) =>
            prev.map((g) =>
              g.id === giveawayId
                ? {
                    ...g,
                    status: "ended" as const,
                    ended_at: new Date().toISOString(),
                  }
                : g,
            ),
          );
          // Update stats
          setStats((prev) => ({
            ...prev,
            activeCount: Math.max(0, prev.activeCount - 1),
          }));
          return true;
        }
        return false;
      } catch (error) {
        console.error("Error ending giveaway:", error);
        return false;
      } finally {
        setProcessing(null);
      }
    },
    [],
  );

  // Draw winner
  const handleDrawWinner = useCallback(
    async (giveawayId: number): Promise<boolean> => {
      if (!profile?.id_auto) return false;

      setProcessing(giveawayId);
      try {
        const result = await giveawayService.drawWinner(
          giveawayId,
          profile.id_auto,
        );

        if (result.success && result.winner) {
          setDrawnWinner(result.winner);
          setDrawModalVisible(false);
          setWinnerModalVisible(true);

          // Update local state
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
          console.error("Draw winner failed:", result.error);
          return false;
        }
      } catch (error) {
        console.error("Error drawing winner:", error);
        return false;
      } finally {
        setProcessing(null);
      }
    },
    [profile?.id_auto],
  );

  // Archive giveaway
  const handleArchiveGiveaway = useCallback(
    async (giveawayId: number): Promise<boolean> => {
      setProcessing(giveawayId);
      try {
        const result = await giveawayService.archiveGiveaway(giveawayId);
        if (result.success) {
          setGiveaways((prev) =>
            prev.map((g) =>
              g.id === giveawayId
                ? {
                    ...g,
                    status: "archived" as const,
                    archived_at: new Date().toISOString(),
                  }
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
    },
    [],
  );

  // Restore giveaway
  const handleRestoreGiveaway = useCallback(
    async (giveawayId: number): Promise<boolean> => {
      setProcessing(giveawayId);
      try {
        const result = await giveawayService.restoreGiveaway(giveawayId);
        if (result.success) {
          // Reload to get correct status
          await loadData();
          return true;
        }
        return false;
      } catch (error) {
        console.error("Error restoring giveaway:", error);
        return false;
      } finally {
        setProcessing(null);
      }
    },
    [loadData],
  );

  // Open draw modal
  const openDrawModal = useCallback((giveaway: AdminGiveaway) => {
    setSelectedGiveaway(giveaway);
    setDrawModalVisible(true);
  }, []);

  // Close modals
  const closeDrawModal = useCallback(() => {
    setDrawModalVisible(false);
    setSelectedGiveaway(null);
  }, []);

  const closeWinnerModal = useCallback(() => {
    setWinnerModalVisible(false);
    setDrawnWinner(null);
    setSelectedGiveaway(null);
  }, []);

  // ============================================
  // WINNER DETAILS & REDRAW HANDLERS
  // ============================================

  // Open Winner Details Modal
  const openWinnerDetailsModal = useCallback(
    async (giveaway: AdminGiveaway) => {
      setSelectedGiveaway(giveaway);
      setLoadingWinnerDetails(true);
      setWinnerDetailsModalVisible(true);

      try {
        // Fetch winner details, history, and eligible count in parallel
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
    },
    [],
  );

  // Close Winner Details Modal
  const closeWinnerDetailsModal = useCallback(() => {
    setWinnerDetailsModalVisible(false);
    setSelectedGiveaway(null);
    setCurrentWinner(null);
    setWinnerHistory([]);
    setEligibleCount(0);
  }, []);

  // Open Redraw Confirm Modal
  const openRedrawModal = useCallback(() => {
    console.log("openRedrawModal called!");
    setWinnerDetailsModalVisible(false);
    setRedrawReason("");
    setRedrawModalVisible(true);
    console.log("redrawModalVisible set to true");
  }, []);

  // Close Redraw Confirm Modal
  const closeRedrawModal = useCallback(() => {
    setRedrawModalVisible(false);
    setRedrawReason("");
  }, []);

  // Handle Redraw Winner
  const handleRedrawWinner = useCallback(async (): Promise<boolean> => {
    if (!profile?.id_auto || !selectedGiveaway || !redrawReason.trim()) {
      return false;
    }

    setRedrawing(true);
    try {
      const result = await giveawayService.redrawWinner(
        selectedGiveaway.id,
        profile.id_auto,
        redrawReason.trim(),
      );

      if (result.success && result.winner) {
        // Update local giveaway state
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

        // Update selected giveaway
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

        // Update current winner
        setCurrentWinner({
          id: result.winner.id,
          user_id: result.winner.user_id,
          name: result.winner.name,
          email: result.winner.email,
          phone: result.winner.phone,
          drawn_at: new Date().toISOString(),
        });

        // Refresh history and eligible count
        const [history, eligible] = await Promise.all([
          giveawayService.getWinnerHistory(selectedGiveaway.id),
          giveawayService.getEligibleEntryCount(selectedGiveaway.id),
        ]);
        setWinnerHistory(history);
        setEligibleCount(eligible);

        // Close redraw modal
        closeRedrawModal();

        return true;
      } else {
        console.error("Redraw failed:", result.error);
        return false;
      }
    } catch (error) {
      console.error("Error redrawing winner:", error);
      return false;
    } finally {
      setRedrawing(false);
    }
  }, [profile?.id_auto, selectedGiveaway, redrawReason, closeRedrawModal]);

  // Helper: get days remaining
  const getDaysRemaining = useCallback((endDate: string | null): string => {
    if (!endDate) return "No end date";

    const now = new Date();
    const end = new Date(endDate);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "Ended";
    if (diffDays === 0) return "Ends today";
    if (diffDays === 1) return "Ends tomorrow";
    return `Ends in ${diffDays} days`;
  }, []);

  return {
    // Tab
    activeTab,
    setActiveTab,

    // Data
    giveaways: filteredGiveaways,
    stats,
    statusCounts,

    // State
    loading,
    refreshing,
    processing,

    // Filters
    statusFilter,
    sortOption,
    searchQuery,
    setStatusFilter,
    setSortOption,
    setSearchQuery,

    // Draw Modal state
    drawModalVisible,
    winnerModalVisible,
    selectedGiveaway,
    drawnWinner,
    openDrawModal,
    closeDrawModal,
    closeWinnerModal,

    // Winner Details Modal state
    winnerDetailsModalVisible,
    currentWinner,
    winnerHistory,
    eligibleCount,
    loadingWinnerDetails,
    openWinnerDetailsModal,
    closeWinnerDetailsModal,

    // Redraw Modal state
    redrawModalVisible,
    redrawReason,
    setRedrawReason,
    redrawing,
    openRedrawModal,
    closeRedrawModal,
    handleRedrawWinner,

    // Actions
    onRefresh,
    endGiveaway: handleEndGiveaway,
    drawWinner: handleDrawWinner,
    archiveGiveaway: handleArchiveGiveaway,
    restoreGiveaway: handleRestoreGiveaway,

    // Helpers
    getDaysRemaining,
  };
};
