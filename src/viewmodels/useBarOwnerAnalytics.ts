// src/viewmodels/useBarOwnerAnalytics.ts
//
// Bar-owner-scoped version of useAnalyticsDashboard.
// Queries the same app_events table but filters by tournaments
// that belong to the bar owner's venues.
// Completely standalone — does NOT import from or affect
// useAnalyticsDashboard or analyticsService.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EventStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
}

interface TopEntity {
  entity_id: number;
  count: number;
  name?: string;
}

interface BarOwnerAnalyticsState {
  tournamentViews: EventStats;
  directionsClicked: EventStats;
  venueContactClicked: EventStats;
  tournamentFavorited: EventStats;
  tournamentShared: EventStats;
  giveawayViewed: EventStats;

  topViewedTournaments: TopEntity[];
  topFavoritedTournaments: TopEntity[];

  totalEvents: number;
}

const EMPTY_STATS: EventStats = {
  total: 0,
  today: 0,
  thisWeek: 0,
  thisMonth: 0,
};

const EMPTY_STATE: BarOwnerAnalyticsState = {
  tournamentViews: EMPTY_STATS,
  directionsClicked: EMPTY_STATS,
  venueContactClicked: EMPTY_STATS,
  tournamentFavorited: EMPTY_STATS,
  tournamentShared: EMPTY_STATS,
  giveawayViewed: EMPTY_STATS,
  topViewedTournaments: [],
  topFavoritedTournaments: [],
  totalEvents: 0,
};

// ─── Time period helpers ─────────────────────────────────────────────────────

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
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).toISOString();
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

// ─── Scoped query helpers ────────────────────────────────────────────────────

/**
 * Get event stats for a specific event type, scoped to the given tournament IDs.
 */
async function getScopedEventStats(
  eventType: string,
  tournamentIds: number[],
): Promise<EventStats> {
  if (tournamentIds.length === 0) return EMPTY_STATS;

  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();

  const startOfWeek = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - now.getDay(),
  ).toISOString();

  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();

  const buildQuery = (since?: string) => {
    let q = supabase
      .from("app_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", eventType)
      .in("entity_id", tournamentIds);

    if (since) q = q.gte("created_at", since);
    return q;
  };

  const [total, today, thisWeek, thisMonth] = await Promise.all([
    buildQuery(),
    buildQuery(startOfToday),
    buildQuery(startOfWeek),
    buildQuery(startOfMonth),
  ]);

  return {
    total: total.count || 0,
    today: today.count || 0,
    thisWeek: thisWeek.count || 0,
    thisMonth: thisMonth.count || 0,
  };
}

/**
 * Get top entities for a specific event type, scoped to given tournament IDs.
 */
async function getScopedTopEntities(
  eventType: string,
  tournamentIds: number[],
  since?: string,
  limit: number = 10,
): Promise<{ entity_id: number; count: number }[]> {
  if (tournamentIds.length === 0) return [];

  let query = supabase
    .from("app_events")
    .select("entity_id")
    .eq("event_type", eventType)
    .in("entity_id", tournamentIds)
    .not("entity_id", "is", null);

  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;

  if (error || !data) {
    console.error("[BarOwnerAnalytics] getScopedTopEntities error:", error?.message);
    return [];
  }

  // Count occurrences client-side
  const counts: Record<number, number> = {};
  for (const row of data) {
    if (row.entity_id != null) {
      counts[row.entity_id] = (counts[row.entity_id] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([id, count]) => ({ entity_id: Number(id), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBarOwnerAnalytics() {
  const { profile } = useAuthContext();

  const [data, setData] = useState<BarOwnerAnalyticsState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriodOption>(
    TIME_PERIOD_OPTIONS[3], // Lifetime
  );

  // ── Get the owner's tournament IDs ─────────────────────────────────────
  const getOwnerTournamentIds = useCallback(async (): Promise<number[]> => {
    if (!profile?.id_auto) return [];

    const { data: venueOwners, error: voError } = await supabase
      .from("venue_owners")
      .select("venue_id")
      .eq("owner_id", profile.id_auto)
      .is("archived_at", null);

    if (voError || !venueOwners || venueOwners.length === 0) return [];

    const venueIds = venueOwners.map(
      (vo: { venue_id: number }) => vo.venue_id,
    );

    const { data: tournaments, error: tError } = await supabase
      .from("tournaments")
      .select("id")
      .in("venue_id", venueIds);

    if (tError || !tournaments) return [];

    return tournaments.map((t: { id: number }) => t.id);
  }, [profile?.id_auto]);

  // ── Resolve tournament names from IDs ──────────────────────────────────
  const resolveTournamentNames = useCallback(
    async (
      entities: { entity_id: number; count: number }[],
    ): Promise<TopEntity[]> => {
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

  // ── Fetch all analytics data ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const tournamentIds = await getOwnerTournamentIds();

      if (tournamentIds.length === 0) {
        setData(EMPTY_STATE);
        return;
      }

      const since = getSinceDate(timePeriod.value);

      const [
        tournamentViews,
        directionsClicked,
        venueContactClicked,
        tournamentFavorited,
        tournamentShared,
        giveawayViewed,
        topViewedRaw,
        topFavoritedRaw,
      ] = await Promise.all([
        getScopedEventStats("tournament_viewed", tournamentIds),
        getScopedEventStats("directions_clicked", tournamentIds),
        getScopedEventStats("venue_contact_clicked", tournamentIds),
        getScopedEventStats("tournament_favorited", tournamentIds),
        getScopedEventStats("tournament_shared", tournamentIds),
        getScopedEventStats("giveaway_viewed", tournamentIds),
        getScopedTopEntities("tournament_viewed", tournamentIds, since, 10),
        getScopedTopEntities(
          "tournament_favorited",
          tournamentIds,
          since,
          10,
        ),
      ]);

      const [topViewedTournaments, topFavoritedTournaments] =
        await Promise.all([
          resolveTournamentNames(topViewedRaw),
          resolveTournamentNames(topFavoritedRaw),
        ]);

      const allStats = [
        tournamentViews,
        directionsClicked,
        venueContactClicked,
        tournamentFavorited,
        tournamentShared,
        giveawayViewed,
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
        tournamentShared,
        giveawayViewed,
        topViewedTournaments,
        topFavoritedTournaments,
        totalEvents,
      });
    } catch (err) {
      console.error("[useBarOwnerAnalytics] Error fetching data:", err);
    }
  }, [
    timePeriod.value,
    getOwnerTournamentIds,
    resolveTournamentNames,
  ]);

  // ── Initial load ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // ── Pull-to-refresh ────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ── Time period change ─────────────────────────────────────────────────
  const handleTimePeriodChange = useCallback((value: string) => {
    const option = TIME_PERIOD_OPTIONS.find((o) => o.value === value);
    if (option) setTimePeriod(option);
  }, []);

  // ── Derived: event breakdown for charts ────────────────────────────────
  const eventBreakdown = useMemo(() => {
    const p = timePeriod.value;
    return [
      {
        label: "Views",
        value: statForPeriod(data.tournamentViews, p),
        color: "#4CAF50",
      },
      {
        label: "Directions",
        value: statForPeriod(data.directionsClicked, p),
        color: "#2196F3",
      },
      {
        label: "Calls",
        value: statForPeriod(data.venueContactClicked, p),
        color: "#FF9800",
      },
      {
        label: "Favorites",
        value: statForPeriod(data.tournamentFavorited, p),
        color: "#E91E63",
      },
      {
        label: "Shares",
        value: statForPeriod(data.tournamentShared, p),
        color: "#9C27B0",
      },
      {
        label: "Giveaways",
        value: statForPeriod(data.giveawayViewed, p),
        color: "#FF5722",
      },
    ].filter((item) => item.value > 0);
  }, [data, timePeriod.value]);

  // ── Derived: stat cards summary ────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const p = timePeriod.value;
    return {
      totalViews: statForPeriod(data.tournamentViews, p),
      totalDirections: statForPeriod(data.directionsClicked, p),
      totalCalls: statForPeriod(data.venueContactClicked, p),
      totalFavorites: statForPeriod(data.tournamentFavorited, p),
      totalShares: statForPeriod(data.tournamentShared, p),
      totalGiveawayViews: statForPeriod(data.giveawayViewed, p),
      totalEvents: data.totalEvents,
    };
  }, [data, timePeriod.value]);

  return {
    loading,
    refreshing,
    timePeriod,
    timePeriodOptions: TIME_PERIOD_OPTIONS,

    summaryStats,
    eventBreakdown,
    topViewedTournaments: data.topViewedTournaments,
    topFavoritedTournaments: data.topFavoritedTournaments,

    rawStats: data,

    onRefresh,
    handleTimePeriodChange,
  };
}
