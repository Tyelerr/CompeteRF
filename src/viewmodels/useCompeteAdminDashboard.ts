import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  EventTypeStats,
  TIME_PERIODS,
  TimePeriod,
} from "../models/dashboard-types";

export interface CompeteAdminStats {
  totalUsers: number;
  totalTournaments: number;
  totalVenues: number;
  activeTournaments: number;
  pendingApprovals: number;
  totalViews: number;
}

export const useCompeteAdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(TIME_PERIODS[5]); // Lifetime default

  // Stats
  const [stats, setStats] = useState<CompeteAdminStats>({
    totalUsers: 0,
    totalTournaments: 0,
    totalVenues: 0,
    activeTournaments: 0,
    pendingApprovals: 0,
    totalViews: 0,
  });

  // Analytics data
  const [eventTypeStats, setEventTypeStats] = useState<EventTypeStats[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [timePeriod]);

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

  const loadDashboardData = async () => {
    try {
      await Promise.all([loadStats(), loadEventTypeStats()]);
    } catch (error) {
      console.error("Error loading compete admin dashboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadStats = async () => {
    const dateFilter = getDateFilter();
    const today = new Date().toISOString().split("T")[0];

    try {
      // Total users
      const { count: userCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });

      // Total venues
      const { count: venueCount } = await supabase
        .from("venues")
        .select("id", { count: "exact", head: true });

      // Total tournaments (with date filter if applicable)
      let tournamentsQuery = supabase
        .from("tournaments")
        .select("id", { count: "exact", head: true });

      if (dateFilter) {
        tournamentsQuery = tournamentsQuery.gte("created_at", dateFilter);
      }

      const { count: tournamentCount } = await tournamentsQuery;

      // Active tournaments (upcoming or today)
      const { count: activeCount } = await supabase
        .from("tournaments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("tournament_date", today);

      // Pending approvals (venues or tournaments with pending status)
      const { count: pendingVenueCount } = await supabase
        .from("venues")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: pendingTournamentCount } = await supabase
        .from("tournaments")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      const pendingApprovals =
        (pendingVenueCount || 0) + (pendingTournamentCount || 0);

      // Total views (with date filter if applicable)
      let viewsQuery = supabase
        .from("tournament_analytics")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "view");

      if (dateFilter) {
        viewsQuery = viewsQuery.gte("created_at", dateFilter);
      }

      const { count: viewsCount } = await viewsQuery;

      setStats({
        totalUsers: userCount || 0,
        totalTournaments: tournamentCount || 0,
        totalVenues: venueCount || 0,
        activeTournaments: activeCount || 0,
        pendingApprovals,
        totalViews: viewsCount || 0,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const loadEventTypeStats = async () => {
    const dateFilter = getDateFilter();

    try {
      let query = supabase.from("tournaments").select("game_type");

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
    } catch (error) {
      console.error("Error loading event type stats:", error);
      setEventTypeStats([]);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
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
    eventTypeStats,

    // Options
    timePeriodOptions,

    // Actions
    onRefresh,
    handleTimePeriodChange,
  };
};
