// src/viewmodels/useVenueAnalytics.ts
// Main bar-owner Venue Analytics viewmodel. Pulls per-run money/attendance +
// venue-scoped discovery counts for the selected period and aggregates them into
// the Overview, Money Overview, Top-tournament lists, and Activity Breakdown.
// All data access goes through venueAnalyticsService; aggregation is pure
// (utils/venue-analytics).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "../providers/AuthProvider";
import {
  getSinceISO,
  venueAnalyticsService,
} from "../models/services/venue-analytics.service";
import {
  AnalyticsPeriod,
  ANALYTICS_PERIODS,
  DiscoveryCounts,
  EMPTY_DISCOVERY,
  TournamentRunStats,
} from "../models/types/venue-analytics.types";
import {
  groupIntoSeries,
  rollupVenue,
  topSeriesBy,
} from "../utils/venue-analytics";

export function useVenueAnalytics() {
  const { profile } = useAuthContext();

  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runs, setRuns] = useState<TournamentRunStats[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryCounts>(EMPTY_DISCOVERY);

  const fetchAll = useCallback(async () => {
    if (!profile?.id_auto) {
      setRuns([]);
      setDiscovery(EMPTY_DISCOVERY);
      return;
    }
    try {
      const since = getSinceISO(period);
      const venueIds = await venueAnalyticsService.getOwnerVenueIds(
        profile.id_auto,
      );
      if (venueIds.length === 0) {
        setRuns([]);
        setDiscovery(EMPTY_DISCOVERY);
        return;
      }
      const [runsData, allTournamentIds] = await Promise.all([
        venueAnalyticsService.getVenueTournamentRuns(venueIds, since),
        venueAnalyticsService.getOwnerTournamentIds(venueIds),
      ]);
      const disc = await venueAnalyticsService.getDiscoveryCounts(
        allTournamentIds,
        since,
      );
      setRuns(runsData);
      setDiscovery(disc);
    } catch (err) {
      console.error("[useVenueAnalytics] fetch error:", err);
      setRuns([]);
      setDiscovery(EMPTY_DISCOVERY);
    }
  }, [profile?.id_auto, period]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const venueStats = useMemo(() => rollupVenue(runs), [runs]);
  const series = useMemo(() => groupIntoSeries(runs), [runs]);

  const topAttendance = useMemo(
    () => topSeriesBy(series, (s) => s.totalPlayers, 5),
    [series],
  );
  const topRevenue = useMemo(
    () => topSeriesBy(series, (s) => s.entryCollected, 5),
    [series],
  );
  const topPrizePool = useMemo(
    () => topSeriesBy(series, (s) => s.netPrizePool, 5),
    [series],
  );

  const discoveryBreakdown = useMemo(
    () =>
      [
        { label: "Views", value: discovery.views, color: "#4CAF50" },
        { label: "Directions", value: discovery.directions, color: "#2196F3" },
        { label: "Calls", value: discovery.calls, color: "#FF9800" },
        { label: "Favorites", value: discovery.favorites, color: "#E91E63" },
        { label: "Shares", value: discovery.shares, color: "#9C27B0" },
        { label: "Giveaways", value: discovery.giveawayViews, color: "#FF5722" },
      ].filter((d) => d.value > 0),
    [discovery],
  );

  return {
    loading,
    refreshing,
    onRefresh,

    period,
    setPeriod,
    periodOptions: ANALYTICS_PERIODS,

    runs,
    venueStats,
    series,
    topAttendance,
    topRevenue,
    topPrizePool,
    discovery,
    discoveryBreakdown,
  };
}
