import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { analyticsService } from "../models/services/analytics.service";
import { giveawayService } from "../models/services/giveaway.service";
import { giveawayWalletService } from "../models/services/giveaway-wallet.service";
import { Giveaway, GiveawayStats } from "../models/types/giveaway.types";
import { WalletEntryResult } from "../models/types/giveaway-wallet.types";
import { useAuthContext } from "../providers/AuthProvider";

export function useGiveaways() {
  const { profile } = useAuthContext();

  // Active giveaways — shown with "Enter Now" CTA
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  // Ended / awarded — shown with muted "Drawing Soon" / "Winner Drawn" state
  const [endedGiveaways, setEndedGiveaways] = useState<Giveaway[]>([]);

  const [stats, setStats] = useState<GiveawayStats>({
    completedCount: 0,
    totalValueGiven: 0,
    frequency: "Ongoing",
    activeCount: 0,
  });
  const [enteredGiveawayIds, setEnteredGiveawayIds] = useState<Set<number>>(
    new Set(),
  );
  // Draw entries the signed-in user holds per giveaway (wallet "You: 4 / 10"; legacy = 1).
  const [myEntries, setMyEntries] = useState<Map<number, number>>(new Map());
  // Giveaway Entries balance; null = logged out or not loaded (card hidden, never a wrong number).
  const [balance, setBalance] = useState<number | null>(null);
  // Clock reading taken on each load — the reference for "past its end time" checks.
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      // getVisibleGiveaways returns active first, then recently ended/awarded.
      // getGiveawayStats is a separate lightweight query (no entry counts needed).
      const [allVisible, statsData] = await Promise.all([
        giveawayService.getVisibleGiveaways(),
        giveawayService.getGiveawayStats(),
      ]);

      setLoadedAt(Date.now());
      // Split at the VM level so views don't need to know about status values
      setGiveaways(allVisible.filter((g) => g.status === "active"));
      setEndedGiveaways(
        allVisible.filter(
          (g) => g.status === "ended" || g.status === "awarded",
        ),
      );
      setStats(statsData);

      if (profile?.id_auto) {
        const [userEntries, walletBalance] = await Promise.all([
          giveawayService.getUserEntries(profile.id_auto),
          giveawayWalletService.getMyBalance().catch(() => null),
        ]);
        const enteredIds = new Set(userEntries.map((e) => e.giveaway_id));
        setEnteredGiveawayIds(enteredIds);
        setMyEntries(new Map(userEntries.map((e) => [e.giveaway_id, e.quantity ?? 1])));
        setBalance(walletBalance);
      } else {
        setMyEntries(new Map());
        setBalance(null);
      }
    } catch (err) {
      console.error("Error fetching giveaways:", err);
      setError("Failed to load giveaways. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id_auto]);

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
    setGiveaways((prev) =>
      prev.map((g) =>
        g.id === giveawayId
          ? { ...g, entry_count: (g.entry_count || 0) + 1 }
          : g,
      ),
    );
  }, []);

  /** Apply the server's authoritative numbers after a successful wallet entry. */
  const applyWalletEntry = useCallback((giveawayId: number, result: WalletEntryResult) => {
    if (typeof result.balance === "number") setBalance(result.balance);
    if (typeof result.my_entries === "number") {
      setMyEntries((prev) => new Map(prev).set(giveawayId, result.my_entries!));
      setEnteredGiveawayIds((prev) => new Set([...prev, giveawayId]));
    }
    setGiveaways((prev) =>
      prev.map((g) =>
        g.id === giveawayId
          ? {
              ...g,
              entry_count: result.total_entries ?? g.entry_count,
              status: result.closed ? ("ended" as const) : g.status,
            }
          : g,
      ),
    );
  }, []);

  const getMyEntries = useCallback((giveawayId: number) => myEntries.get(giveawayId) ?? 0, [myEntries]);

  /**
   * Wallet giveaways stop taking entries at their end time (the server refuses them) even while
   * the status is still "active" until an admin ends it — so the UI must not look enterable.
   * Legacy giveaways keep their existing display rules.
   */
  const isWalletPastEnd = useCallback(
    (g: Giveaway) => g.entry_mode === "wallet" && !!g.end_date && new Date(g.end_date).getTime() <= loadedAt,
    [loadedAt],
  );

  const trackGiveawayView = useCallback((giveawayId: number) => {
    analyticsService.trackGiveawayViewed(giveawayId);
  }, []);

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
    giveaways,
    endedGiveaways,
    stats,
    loading,
    refreshing,
    error,
    refresh,
    isEntered,
    markAsEntered,
    balance,
    getMyEntries,
    isWalletPastEnd,
    applyWalletEntry,
    trackGiveawayView,
    getDaysRemaining,
    isLoggedIn: !!profile,
  };
}
