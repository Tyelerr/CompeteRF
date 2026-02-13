import { useCallback, useEffect, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";

interface PastWinner {
  giveaway_id: number;
  giveaway_name: string;
  prize_value: number;
  winner_name: string;
  winner_email: string;
  drawn_at: string;
  entry_count: number;
}

export function useGiveawayPastWinners() {
  const [winners, setWinners] = useState<PastWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await giveawayService.getPastWinners();
      setWinners(data);
    } catch (err) {
      console.error("Error fetching past winners:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
  }, [fetchData]);

  const totalAwarded = winners.reduce((sum, w) => sum + w.prize_value, 0);

  const formatDate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const formatDateTime = useCallback((dateStr: string | null): string => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  return {
    // Data
    winners,
    totalAwarded,
    totalWinners: winners.length,

    // State
    loading,
    refreshing,

    // Actions
    refresh,

    // Helpers
    formatDate,
    formatDateTime,
  };
}
