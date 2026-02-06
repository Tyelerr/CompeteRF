import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  analyticsService,
  ENTITY_TYPES,
  EVENT_TYPES,
  type EventStats,
} from "../models/services/analytics.service";

// ─── Types ──────────────────────────────────────────────────────────
interface TopEntity {
  entity_id: number;
  count: number;
  name?: string;
}

interface AnalyticsDashboardState {
  // Per-event stats
  tournamentViews: EventStats;
  directionsClicked: EventStats;
  venueContactClicked: EventStats;
  tournamentFavorited: EventStats;
  tournamentUnfavorited: EventStats;
  tournamentShared: EventStats;
  searchPerformed: EventStats;
  filtersChanged: EventStats;
  giveawayViewed: EventStats;
  appOpened: EventStats;

  // Top entities
  topViewedTournaments: TopEntity[];
  topFavoritedTournaments: TopEntity[];

  // Totals for the summary row
  totalEvents: number;
}

const EMPTY_STATS: EventStats = { total: 0, today: 0, thisWeek: 0, thisMonth: 0 };

const EMPTY_STATE: AnalyticsDashboardState = {
  tournamentViews: EMPTY_STATS,
  directionsClicked: EMPTY_STATS,
  venueContactClicked: EMPTY_STATS,
  tournamentFavorited: EMPTY_STATS,
  tournamentUnfavorited: EMPTY_STATS,
  tournamentShared: EMPTY_STATS,
  searchPerformed: EMPTY_STATS,
  filtersChanged: EMPTY_STATS,
  giveawayViewed: EMPTY_STATS,
  appOpened: EMPTY_STATS,
  topViewedTournaments: [],
  topFavoritedTournaments: [],
  totalEvents: 0,
};

// ─── Time period helpers ────────────────────────────────────────────
type TimePeriodValue = "today" | "this_week" | "this_month" | "lifetime";

interface TimePeriodOption {
  label: string;
  value: TimePeriodValue;
}

const TIME_PERIOD_OPTIONS: TimePeriodOption[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "Lifetime", value: "lifetime" },
];

function getSinceDate(period: TimePeriodValue): string | undefined {
  if (period === "lifetime") return undefined;
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case "this_week":
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - now.getDay(),
      ).toISOString();
    case "this_month":
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
}

/** Pick the correct value from EventStats based on selected period */
function statForPeriod(stats: EventStats, period: TimePeriodValue): number {
  switch (period) {
    case "today":
      return stats.today;
    case "this_week":
      return stats.thisWeek;
    case "this_month":
      return stats.thisMonth;
    case "lifetime":
      return stats.total;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────
export function useAnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsDashboardState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriodOption>(
    TIME_PERIOD_OPTIONS[3], // Lifetime
  );

  // ── Resolve tournament names from IDs ─────────────────────────
  const resolveTournamentNames = useCallback(
    async (entities: { entity_id: number; count: number }[]): Promise<TopEntity[]> => {
      if (entities.length === 0) return [];
      const ids = entities.map((e) => e.entity_id);

      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, title")
        .in("id", ids);

      const nameMap: Record<number, string> = {};
      tournaments?.forEach((t: any) => {
        nameMap[t.id] = t.title;
      });

      return entities.map((e) => ({
        ...e,
        name: nameMap[e.entity_id] || `Tournament #${e.entity_id}`,
      }));
    },
    [],
  );

  // ── Fetch all analytics data ──────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const since = getSinceDate(timePeriod.value);

      // Parallel fetch all event stats + top entities
      const [
        tournamentViews,
        directionsClicked,
        venueContactClicked,
        tournamentFavorited,
        tournamentUnfavorited,
        tournamentShared,
        searchPerformed,
        filtersChanged,
        giveawayViewed,
        appOpened,
        topViewedRaw,
        topFavoritedRaw,
      ] = await Promise.all([
        analyticsService.getEventStats(EVENT_TYPES.TOURNAMENT_VIEWED),
        analyticsService.getEventStats(EVENT_TYPES.DIRECTIONS_CLICKED),
        analyticsService.getEventStats(EVENT_TYPES.VENUE_CONTACT_CLICKED),
        analyticsService.getEventStats(EVENT_TYPES.TOURNAMENT_FAVORITED),
        analyticsService.getEventStats(EVENT_TYPES.TOURNAMENT_UNFAVORITED),
        analyticsService.getEventStats(EVENT_TYPES.TOURNAMENT_SHARED),
        analyticsService.getEventStats(EVENT_TYPES.SEARCH_PERFORMED),
        analyticsService.getEventStats(EVENT_TYPES.FILTERS_CHANGED),
        analyticsService.getEventStats(EVENT_TYPES.GIVEAWAY_VIEWED),
        analyticsService.getEventStats(EVENT_TYPES.APP_OPENED),
        analyticsService.getTopEntities(
          EVENT_TYPES.TOURNAMENT_VIEWED,
          ENTITY_TYPES.TOURNAMENT,
          since,
          10,
        ),
        analyticsService.getTopEntities(
          EVENT_TYPES.TOURNAMENT_FAVORITED,
          ENTITY_TYPES.TOURNAMENT,
          since,
          10,
        ),
      ]);

      // Resolve names in parallel
      const [topViewedTournaments, topFavoritedTournaments] = await Promise.all([
        resolveTournamentNames(topViewedRaw),
        resolveTournamentNames(topFavoritedRaw),
      ]);

      // Total events across all types for the selected period
      const allStats = [
        tournamentViews,
        directionsClicked,
        venueContactClicked,
        tournamentFavorited,
        tournamentUnfavorited,
        tournamentShared,
        searchPerformed,
        filtersChanged,
        giveawayViewed,
        appOpened,
      ];
      const totalEvents = allStats.reduce(
        (sum, s) => sum + statForPeriod(s, timePeriod.value),
        0,
      );

      setData({
        tournamentViews,
        directionsClicked,
        venueContactClicked,
        tournamentFavorited,
        tournamentUnfavorited,
        tournamentShared,
        searchPerformed,
        filtersChanged,
        giveawayViewed,
        appOpened,
        topViewedTournaments,
        topFavoritedTournaments,
        totalEvents,
      });
    } catch (err) {
      console.error("[useAnalyticsDashboard] Error fetching data:", err);
    }
  }, [timePeriod.value, resolveTournamentNames]);

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // ── Pull-to-refresh ───────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ── Time period change ────────────────────────────────────────
  const handleTimePeriodChange = useCallback((value: string) => {
    const option = TIME_PERIOD_OPTIONS.find((o) => o.value === value);
    if (option) setTimePeriod(option);
  }, []);

  // ── Derived: event breakdown for charts ───────────────────────
  const eventBreakdown = useMemo(() => {
    const p = timePeriod.value;
    return [
      { label: "Views", value: statForPeriod(data.tournamentViews, p), color: "#4CAF50" },
      { label: "Directions", value: statForPeriod(data.directionsClicked, p), color: "#2196F3" },
      { label: "Calls", value: statForPeriod(data.venueContactClicked, p), color: "#FF9800" },
      { label: "Favorites", value: statForPeriod(data.tournamentFavorited, p), color: "#E91E63" },
      { label: "Shares", value: statForPeriod(data.tournamentShared, p), color: "#9C27B0" },
      { label: "Searches", value: statForPeriod(data.searchPerformed, p), color: "#00BCD4" },
      { label: "Filters", value: statForPeriod(data.filtersChanged, p), color: "#607D8B" },
      { label: "Giveaways", value: statForPeriod(data.giveawayViewed, p), color: "#FF5722" },
      { label: "App Opens", value: statForPeriod(data.appOpened, p), color: "#8BC34A" },
    ].filter((item) => item.value > 0);
  }, [data, timePeriod.value]);

  // ── Derived: stat cards summary ───────────────────────────────
  const summaryStats = useMemo(() => {
    const p = timePeriod.value;
    return {
      totalViews: statForPeriod(data.tournamentViews, p),
      totalDirections: statForPeriod(data.directionsClicked, p),
      totalCalls: statForPeriod(data.venueContactClicked, p),
      totalFavorites: statForPeriod(data.tournamentFavorited, p),
      totalShares: statForPeriod(data.tournamentShared, p),
      totalSearches: statForPeriod(data.searchPerformed, p),
      totalGiveawayViews: statForPeriod(data.giveawayViewed, p),
      totalAppOpens: statForPeriod(data.appOpened, p),
      totalEvents: data.totalEvents,
    };
  }, [data, timePeriod.value]);

  return {
    // State
    loading,
    refreshing,
    timePeriod,
    timePeriodOptions: TIME_PERIOD_OPTIONS,

    // Data
    summaryStats,
    eventBreakdown,
    topViewedTournaments: data.topViewedTournaments,
    topFavoritedTournaments: data.topFavoritedTournaments,

    // Raw stats (if view needs period-level detail)
    rawStats: data,

    // Actions
    onRefresh,
    handleTimePeriodChange,
  };
}
