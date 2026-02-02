import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export interface TDDashboardStats {
  totalTournaments: number;
  activeTournaments: number;
  completedTournaments: number;
  totalVenues: number;
  totalViews: number;
  totalFavorites: number;
  activeEvents: number;
}

export interface EventTypeStats {
  gameType: string;
  count: number;
  percentage: number;
}

export interface PerformanceMetrics {
  totalViews: number;
  totalFavorites: number;
  activeEvents: number;
  averageViewsPerTournament: number;
  averageFavoritesPerTournament: number;
}

export interface TimeFilter {
  label: string;
  value: "this_week" | "this_month" | "this_quarter" | "this_year" | "all_time";
  startDate: string;
  endDate: string;
}

export const useTournamentDirectorDashboard = () => {
  const { profile } = useAuthContext();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<TDDashboardStats>({
    totalTournaments: 0,
    activeTournaments: 0,
    completedTournaments: 0,
    totalVenues: 0,
    totalViews: 0,
    totalFavorites: 0,
    activeEvents: 0,
  });
  const [eventTypeStats, setEventTypeStats] = useState<EventTypeStats[]>([]);
  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetrics>({
      totalViews: 0,
      totalFavorites: 0,
      activeEvents: 0,
      averageViewsPerTournament: 0,
      averageFavoritesPerTournament: 0,
    });

  // Time period filter
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<TimeFilter>({
    label: "This Year",
    value: "this_year",
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString(),
    endDate: new Date().toISOString(),
  });

  const timeFilterOptions: TimeFilter[] = [
    {
      label: "This Week",
      value: "this_week",
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
    },
    {
      label: "This Month",
      value: "this_month",
      startDate: new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString(),
      endDate: new Date().toISOString(),
    },
    {
      label: "This Quarter",
      value: "this_quarter",
      startDate: new Date(
        new Date().getFullYear(),
        Math.floor(new Date().getMonth() / 3) * 3,
        1,
      ).toISOString(),
      endDate: new Date().toISOString(),
    },
    {
      label: "This Year",
      value: "this_year",
      startDate: new Date(new Date().getFullYear(), 0, 1).toISOString(),
      endDate: new Date().toISOString(),
    },
    {
      label: "All Time",
      value: "all_time",
      startDate: "2020-01-01T00:00:00.000Z",
      endDate: new Date().toISOString(),
    },
  ];

  useEffect(() => {
    if (profile?.id_auto) {
      loadDashboardData();
    }
  }, [profile?.id_auto, selectedTimeFilter]);

  const loadDashboardData = async () => {
    if (!profile?.id_auto) return;

    try {
      setLoading(true);

      await Promise.all([
        loadBasicStats(),
        loadEventTypeStats(),
        loadPerformanceMetrics(),
      ]);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadBasicStats = async () => {
    if (!profile?.id_auto) return;

    try {
      // Get tournaments created by this director
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select(
          "id, status, venue_id, tournament_date, views_count, favorites_count",
        )
        .eq("director_id", profile.id_auto)
        .gte("tournament_date", selectedTimeFilter.startDate)
        .lte("tournament_date", selectedTimeFilter.endDate);

      if (!tournaments) return;

      // Calculate basic stats
      const totalTournaments = tournaments.length;
      const activeTournaments = tournaments.filter(
        (t) => t.status === "active",
      ).length;
      const completedTournaments = tournaments.filter(
        (t) => t.status === "completed",
      ).length;
      const totalViews = tournaments.reduce(
        (sum, t) => sum + (t.views_count || 0),
        0,
      );
      const totalFavorites = tournaments.reduce(
        (sum, t) => sum + (t.favorites_count || 0),
        0,
      );

      // Get unique venues count
      const uniqueVenues = new Set(tournaments.map((t) => t.venue_id));
      const totalVenues = uniqueVenues.size;

      // Active events (current active tournaments)
      const now = new Date();
      const activeEvents = tournaments.filter(
        (t) => t.status === "active" && new Date(t.tournament_date) >= now,
      ).length;

      setStats({
        totalTournaments,
        activeTournaments,
        completedTournaments,
        totalVenues,
        totalViews,
        totalFavorites,
        activeEvents,
      });
    } catch (error) {
      console.error("Error loading basic stats:", error);
    }
  };

  const loadEventTypeStats = async () => {
    if (!profile?.id_auto) return;

    try {
      // Get game type breakdown
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("game_type")
        .eq("director_id", profile.id_auto)
        .gte("tournament_date", selectedTimeFilter.startDate)
        .lte("tournament_date", selectedTimeFilter.endDate);

      if (!tournaments || tournaments.length === 0) {
        setEventTypeStats([]);
        return;
      }

      // Count by game type
      const gameTypeCounts: Record<string, number> = {};
      tournaments.forEach((t) => {
        const gameType = t.game_type || "Unknown";
        gameTypeCounts[gameType] = (gameTypeCounts[gameType] || 0) + 1;
      });

      // Convert to array with percentages
      const total = tournaments.length;
      const eventStats = Object.entries(gameTypeCounts)
        .map(([gameType, count]) => ({
          gameType,
          count,
          percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      setEventTypeStats(eventStats);
    } catch (error) {
      console.error("Error loading event type stats:", error);
    }
  };

  const loadPerformanceMetrics = async () => {
    if (!profile?.id_auto) return;

    try {
      // Get detailed performance data
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("views_count, favorites_count, status, tournament_date")
        .eq("director_id", profile.id_auto)
        .gte("tournament_date", selectedTimeFilter.startDate)
        .lte("tournament_date", selectedTimeFilter.endDate);

      if (!tournaments || tournaments.length === 0) {
        setPerformanceMetrics({
          totalViews: 0,
          totalFavorites: 0,
          activeEvents: 0,
          averageViewsPerTournament: 0,
          averageFavoritesPerTournament: 0,
        });
        return;
      }

      const totalViews = tournaments.reduce(
        (sum, t) => sum + (t.views_count || 0),
        0,
      );
      const totalFavorites = tournaments.reduce(
        (sum, t) => sum + (t.favorites_count || 0),
        0,
      );

      // Active events (future tournaments with active status)
      const now = new Date();
      const activeEvents = tournaments.filter(
        (t) => t.status === "active" && new Date(t.tournament_date) >= now,
      ).length;

      const averageViewsPerTournament =
        tournaments.length > 0
          ? Math.round(totalViews / tournaments.length)
          : 0;

      const averageFavoritesPerTournament =
        tournaments.length > 0
          ? Math.round(totalFavorites / tournaments.length)
          : 0;

      setPerformanceMetrics({
        totalViews,
        totalFavorites,
        activeEvents,
        averageViewsPerTournament,
        averageFavoritesPerTournament,
      });
    } catch (error) {
      console.error("Error loading performance metrics:", error);
    }
  };

  // Actions
  const updateTimeFilter = (filter: TimeFilter) => {
    setSelectedTimeFilter(filter);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData().finally(() => setRefreshing(false));
  }, [profile?.id_auto, selectedTimeFilter]);

  // Navigation helpers
  const navigateToTournaments = () => {
    // Navigate to TD tournaments page
    return "/(tabs)/admin/tournaments/td-tournaments";
  };

  const navigateToVenues = () => {
    // Navigate to TD venues page
    return "/(tabs)/admin/venues/td-venues";
  };

  const navigateToActiveEvents = () => {
    // Navigate to TD tournaments filtered by active
    return "/(tabs)/admin/tournaments/td-tournaments?status=active";
  };

  return {
    // State
    loading,
    refreshing,

    // Data
    stats,
    eventTypeStats,
    performanceMetrics,

    // Time filtering
    selectedTimeFilter,
    timeFilterOptions,
    updateTimeFilter,

    // Actions
    onRefresh,

    // Navigation
    navigateToTournaments,
    navigateToVenues,
    navigateToActiveEvents,

    // User info
    currentUser: profile,
  };
};
