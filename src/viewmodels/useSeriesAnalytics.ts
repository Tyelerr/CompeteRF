// src/viewmodels/useSeriesAnalytics.ts
// Tournament Analytics detail viewmodel: lifetime stats for one tournament series
// (a recurring template or a one-off), plus that series' discovery counts.

import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "../providers/AuthProvider";
import { venueAnalyticsService } from "../models/services/venue-analytics.service";
import {
  DiscoveryCounts,
  EMPTY_DISCOVERY,
  TournamentSeriesStats,
} from "../models/types/venue-analytics.types";
import { groupIntoSeries } from "../utils/venue-analytics";

export function useSeriesAnalytics(seriesId: string) {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [series, setSeries] = useState<TournamentSeriesStats | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryCounts>(EMPTY_DISCOVERY);

  const fetchAll = useCallback(async () => {
    if (!profile?.id_auto || !seriesId) {
      setSeries(null);
      setDiscovery(EMPTY_DISCOVERY);
      return;
    }
    try {
      const venueIds = await venueAnalyticsService.getOwnerVenueIds(
        profile.id_auto,
      );
      if (venueIds.length === 0) {
        setSeries(null);
        setDiscovery(EMPTY_DISCOVERY);
        return;
      }
      const runs = await venueAnalyticsService.getVenueTournamentRuns(
        venueIds,
        null, // lifetime: all runs of the series
      );
      const match =
        groupIntoSeries(runs).find((s) => s.seriesId === seriesId) ?? null;
      setSeries(match);
      const disc = match
        ? await venueAnalyticsService.getDiscoveryCounts(match.tournamentIds, null)
        : EMPTY_DISCOVERY;
      setDiscovery(disc);
    } catch (err) {
      console.error("[useSeriesAnalytics] fetch error:", err);
      setSeries(null);
      setDiscovery(EMPTY_DISCOVERY);
    }
  }, [profile?.id_auto, seriesId]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  return { loading, refreshing, onRefresh, series, discovery };
}
