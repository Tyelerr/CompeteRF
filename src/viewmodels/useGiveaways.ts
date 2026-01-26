import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import { Giveaway, GiveawayStats } from "../models/types/giveaway.types";
import { useAuthContext } from "../providers/AuthProvider";

export function useGiveaways() {
  const { profile } = useAuthContext();

  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [stats, setStats] = useState<GiveawayStats>({
    completedCount: 0,
    totalValueGiven: 0,
    frequency: "Ongoing",
  });
  const [enteredGiveawayIds, setEnteredGiveawayIds] = useState<Set<number>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      // Fetch giveaways and stats in parallel
      const [giveawaysData, statsData] = await Promise.all([
        giveawayService.getActiveGiveaways(),
        giveawayService.getGiveawayStats(),
      ]);

      setGiveaways(giveawaysData);
      setStats(statsData);

      // If user is logged in, fetch their entries
      if (profile?.id_auto) {
        const userEntries = await giveawayService.getUserEntries(
          profile.id_auto,
        );
        const enteredIds = new Set(userEntries.map((e) => e.giveaway_id));
        setEnteredGiveawayIds(enteredIds);
      }
    } catch (err) {
      console.error("Error fetching giveaways:", err);
      setError("Failed to load giveaways. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id_auto]);

  // Refresh when tab is focused
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
  }, [fetchData]);

  const isEntered = useCallback(
    (giveawayId: number): boolean => {
      return enteredGiveawayIds.has(giveawayId);
    },
    [enteredGiveawayIds],
  );

  const markAsEntered = useCallback((giveawayId: number) => {
    setEnteredGiveawayIds((prev) => new Set([...prev, giveawayId]));

    // Also update the entry count locally
    setGiveaways((prev) =>
      prev.map((g) =>
        g.id === giveawayId
          ? { ...g, entry_count: (g.entry_count || 0) + 1 }
          : g,
      ),
    );
  }, []);

  /**
   * Calculate days remaining until giveaway ends
   */
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
    // Data
    giveaways,
    stats,

    // State
    loading,
    refreshing,
    error,

    // Actions
    refresh,
    isEntered,
    markAsEntered,

    // Helpers
    getDaysRemaining,

    // User state
    isLoggedIn: !!profile,
  };
}
