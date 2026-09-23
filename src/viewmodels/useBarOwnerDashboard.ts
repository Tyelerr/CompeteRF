import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { analyticsService } from "../models/services/analytics.service";
import {
  EventTypeStats,
  TIME_PERIODS,
  TimePeriod,
} from "../models/types/dashboard-types";
import { useAuthContext } from "../providers/AuthProvider";
import { getNavCache, setNavCache } from "./nav-cache";

export interface BarOwnerStats {
  totalVenues: number;
  totalDirectors: number;
  activeTournaments: number;
  totalViews: number;
  totalFavorites: number;
  todayViews: number;
  todayFavorites: number;
}

export interface BarOwnerVenueSummary {
  id: number;
  venue: string;
  city: string;
  state: string;
  activeTournaments: number;
  totalDirectors: number;
}

export const useBarOwnerDashboard = () => {
  const { profile } = useAuthContext();

  const [timePeriod, setTimePeriod] = useState<TimePeriod>(TIME_PERIODS[5]); // Lifetime default

  // Show the last-loaded dashboard instantly on revisit; refresh in the
  // background. Keyed by owner + selected time period so numbers never mismatch.
  const cacheKey = `bo-dashboard:${profile?.id_auto ?? "none"}:${timePeriod.days ?? "life"}`;
  const cached = getNavCache<{
    stats: BarOwnerStats;
    recentVenues: BarOwnerVenueSummary[];
    eventTypeStats: EventTypeStats[];
  }>(cacheKey);

  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);

  // Stats
  const [stats, setStats] = useState<BarOwnerStats>(cached?.stats ?? {
    totalVenues: 0,
    totalDirectors: 0,
    activeTournaments: 0,
    totalViews: 0,
    totalFavorites: 0,
    todayViews: 0,
    todayFavorites: 0,
  });

  // Recent venues
  const [recentVenues, setRecentVenues] = useState<BarOwnerVenueSummary[]>(cached?.recentVenues ?? []);

  // Analytics data
  const [eventTypeStats, setEventTypeStats] = useState<EventTypeStats[]>(cached?.eventTypeStats ?? []);

  useEffect(() => {
    // Background refresh when we already have cached data → no full-screen spinner.
    if (profile?.id_auto) loadDashboardData(!!getNavCache(cacheKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id_auto, timePeriod]);

  // Persist whatever's on screen so the next visit renders it instantly.
  useEffect(() => {
    if (!loading) setNavCache(cacheKey, { stats, recentVenues, eventTypeStats });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, recentVenues, eventTypeStats, loading]);

  const getDateFilter = () => {
    if (timePeriod.days === null) return null; // Lifetime
    if (timePeriod.days === 0) {
      // Today - start of today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today.toISOString();
    }
    const date = new Date();
    date.setDate(date.getDate() - timePeriod.days);
    return date.toISOString();
  };

  const loadDashboardData = async (background = false) => {
    if (!profile?.id_auto) return;

    try {
      if (!background) setLoading(true);
      await Promise.all([
        loadStats(),
        loadRecentVenues(),
        loadEventTypeStats(),
      ]);
    } catch (error) {
      console.error("Error loading bar owner dashboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadStats = async () => {
    const dateFilter = getDateFilter();

    // Get venues owned by this user
    const { data: venueOwners } = await supabase
      .from("venue_owners")
      .select("venue_id")
      .eq("owner_id", profile!.id_auto)
      .is("archived_at", null);

    const venueIds = venueOwners?.map((vo) => vo.venue_id) || [];
    const totalVenues = venueIds.length;

    if (venueIds.length === 0) {
      setStats({
        totalVenues: 0,
        totalDirectors: 0,
        activeTournaments: 0,
        totalViews: 0,
        totalFavorites: 0,
        todayViews: 0,
        todayFavorites: 0,
      });
      return;
    }

    // Count total directors across all venues
    const { count: directorCount } = await supabase
      .from("venue_directors")
      .select("id", { count: "exact", head: true })
      .in("venue_id", venueIds)
      .is("archived_at", null);

    // Count active tournaments across all venues. Matches the Tournament Manager
    // list (status = active, any date) — a running/past-dated active event still
    // counts, so the card total agrees with what the manager shows.
    const { count: tournamentCount } = await supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .in("venue_id", venueIds)
      .eq("status", "active");

    // Get tournament IDs for owned venues
    const { data: venueTournaments } = await supabase
      .from("tournaments")
      .select("id")
      .in("venue_id", venueIds);

    const tournamentIds = venueTournaments?.map((t: any) => t.id) || [];

    // Views / favorites via the aggregate RPC — directors and owners can't read
    // app_events rows; the server only counts tournaments this user may see.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();
    const counted = ["tournament_viewed", "tournament_favorited"];
    const [periodCounts, todayCounts] = await Promise.all([
      analyticsService.countTournamentEventsByType(counted, tournamentIds, dateFilter),
      analyticsService.countTournamentEventsByType(counted, tournamentIds, todayIso),
    ]);
    const viewsCount = periodCounts["tournament_viewed"] || 0;
    const favoritesCount = periodCounts["tournament_favorited"] || 0;
    const todayViews = todayCounts["tournament_viewed"] || 0;
    const todayFavorites = todayCounts["tournament_favorited"] || 0;
    setStats({
      totalVenues,
      totalDirectors: directorCount || 0,
      activeTournaments: tournamentCount || 0,
      totalViews: viewsCount,
      totalFavorites: favoritesCount,
      todayViews,
      todayFavorites,
    });
  };

  const loadRecentVenues = async () => {
    const { data: venueOwners } = await supabase
      .from("venue_owners")
      .select(
        `
        venue_id,
        venues (
          id,
          venue,
          city,
          state
        )
      `,
      )
      .eq("owner_id", profile!.id_auto)
      .is("archived_at", null)
      .limit(5);

    if (!venueOwners || venueOwners.length === 0) {
      setRecentVenues([]);
      return;
    }

    // Get stats for each venue
    const venuesWithStats: BarOwnerVenueSummary[] = await Promise.all(
      venueOwners.map(async (vo: any) => {
        const venue = vo.venues;

        // Count active tournaments (status = active, any date — see loadStats).
        const { count: tournamentCount } = await supabase
          .from("tournaments")
          .select("id", { count: "exact", head: true })
          .eq("venue_id", venue.id)
          .eq("status", "active");

        // Count directors
        const { count: directorCount } = await supabase
          .from("venue_directors")
          .select("id", { count: "exact", head: true })
          .eq("venue_id", venue.id)
          .is("archived_at", null);

        return {
          id: venue.id,
          venue: venue.venue,
          city: venue.city,
          state: venue.state,
          activeTournaments: tournamentCount || 0,
          totalDirectors: directorCount || 0,
        };
      }),
    );

    setRecentVenues(venuesWithStats);
  };

  const loadEventTypeStats = async () => {
    const dateFilter = getDateFilter();

    // Get venues owned by this user
    const { data: venueOwners } = await supabase
      .from("venue_owners")
      .select("venue_id")
      .eq("owner_id", profile!.id_auto)
      .is("archived_at", null);

    const venueIds = venueOwners?.map((vo) => vo.venue_id) || [];

    if (venueIds.length === 0) {
      setEventTypeStats([]);
      return;
    }

    let query = supabase
      .from("tournaments")
      .select("game_type")
      .in("venue_id", venueIds);

    if (dateFilter) {
      query = query.gte("created_at", dateFilter);
    }

    const { data } = await query;

    if (!data) {
      setEventTypeStats([]);
      return;
    }

    // Count by game type
    const counts: Record<string, number> = {};
    data.forEach((t: any) => {
      const type = t.game_type || "Unknown";
      counts[type] = (counts[type] || 0) + 1;
    });

    const stats: EventTypeStats[] = Object.entries(counts)
      .map(([game_type, count]) => ({ game_type, count }))
      .sort((a, b) => b.count - a.count);

    setEventTypeStats(stats);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData(true);
  };

  const handleTimePeriodChange = (value: string) => {
    const period = TIME_PERIODS.find((p) => p.value === value);
    if (period) {
      setTimePeriod(period);
    }
  };

  // Build time period options for dropdown
  const timePeriodOptions = TIME_PERIODS.map((p) => ({
    label: p.label,
    value: p.value,
  }));

  return {
    // State
    loading,
    refreshing,
    timePeriod,
    stats,
    recentVenues,
    eventTypeStats,

    // Options
    timePeriodOptions,

    // Actions
    onRefresh,
    handleTimePeriodChange,
  };
};

