import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  EventTypeStats,
  TIME_PERIODS,
  TimePeriod,
} from "../models/dashboard-types";
import { useAuthContext } from "../providers/AuthProvider";

export interface BarOwnerStats {
  totalVenues: number;
  totalDirectors: number;
  activeTournaments: number;
  totalViews: number;
  totalFavorites: number;
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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(TIME_PERIODS[5]); // Lifetime default

  // Stats
  const [stats, setStats] = useState<BarOwnerStats>({
    totalVenues: 0,
    totalDirectors: 0,
    activeTournaments: 0,
    totalViews: 0,
    totalFavorites: 0,
  });

  // Recent venues
  const [recentVenues, setRecentVenues] = useState<BarOwnerVenueSummary[]>([]);

  // Analytics data
  const [eventTypeStats, setEventTypeStats] = useState<EventTypeStats[]>([]);

  useEffect(() => {
    if (profile?.id_auto) {
      loadDashboardData();
    }
  }, [profile?.id_auto, timePeriod]);

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
    if (!profile?.id_auto) return;

    try {
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
      });
      return;
    }

    // Count total directors across all venues
    const { count: directorCount } = await supabase
      .from("venue_directors")
      .select("id", { count: "exact", head: true })
      .in("venue_id", venueIds)
      .is("archived_at", null);

    // Count active tournaments across all venues
    const { count: tournamentCount } = await supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .in("venue_id", venueIds)
      .eq("status", "active")
      .gte("tournament_date", new Date().toISOString().split("T")[0]);

    // Count total views for tournaments at owned venues
    let viewsQuery = supabase
      .from("tournament_analytics")
      .select("id, tournaments!inner(venue_id)", {
        count: "exact",
        head: true,
      })
      .in("tournaments.venue_id", venueIds)
      .eq("event_type", "view");

    if (dateFilter) {
      viewsQuery = viewsQuery.gte("created_at", dateFilter);
    }

    const { count: viewsCount } = await viewsQuery;

    // Count total favorites for tournaments at owned venues
    let favoritesQuery = supabase
      .from("favorites")
      .select("id, tournaments!inner(venue_id)", {
        count: "exact",
        head: true,
      })
      .in("tournaments.venue_id", venueIds);

    if (dateFilter) {
      favoritesQuery = favoritesQuery.gte("created_at", dateFilter);
    }

    const { count: favoritesCount } = await favoritesQuery;

    setStats({
      totalVenues,
      totalDirectors: directorCount || 0,
      activeTournaments: tournamentCount || 0,
      totalViews: viewsCount || 0,
      totalFavorites: favoritesCount || 0,
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

        // Count active tournaments
        const { count: tournamentCount } = await supabase
          .from("tournaments")
          .select("id", { count: "exact", head: true })
          .eq("venue_id", venue.id)
          .eq("status", "active")
          .gte("tournament_date", new Date().toISOString().split("T")[0]);

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
    recentVenues,
    eventTypeStats,

    // Options
    timePeriodOptions,

    // Actions
    onRefresh,
    handleTimePeriodChange,
  };
};
