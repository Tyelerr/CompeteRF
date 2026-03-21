import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  DashboardStats,
  EventTypeStats,
  TIME_PERIODS,
  TournamentWithStats,
  VenueWithStats,
} from "../models/types/dashboard-types";
import { useAuthContext } from "../providers/AuthProvider";

export const useTDDashboard = () => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState(TIME_PERIODS[4]); // Lifetime default

  // Stats
  const [stats, setStats] = useState<DashboardStats>({
    myTournaments: 0,
    activeEvents: 0,
    venues: 0,
    totalFavorites: 0,
    totalViews: 0,
    todayViews: 0,
    todayFavorites: 0,
  });

  // Data
  const [venues, setVenues] = useState<VenueWithStats[]>([]);
  const [tournaments, setTournaments] = useState<TournamentWithStats[]>([]);
  const [eventTypeStats, setEventTypeStats] = useState<EventTypeStats[]>([]);

  useEffect(() => {
    if (profile?.id_auto) {
      loadDashboardData();
    }
  }, [profile?.id_auto, timePeriod]);

  const getDateFilter = () => {
    if (!timePeriod.days) return null;
    const date = new Date();
    date.setDate(date.getDate() - timePeriod.days);
    return date.toISOString();
  };

  const loadDashboardData = async () => {
    if (!profile?.id_auto) return;

    try {
      await Promise.all([
        loadStats(),
        loadVenues(),
        loadTournaments(),
        loadEventTypeStats(),
      ]);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadStats = async () => {
    const dateFilter = getDateFilter();

    // Get tournament count
    let tournamentsQuery = supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("director_id", profile!.id_auto);

    if (dateFilter) {
      tournamentsQuery = tournamentsQuery.gte("created_at", dateFilter);
    }

    const { count: tournamentCount } = await tournamentsQuery;

    // Get active events count
    const { count: activeCount } = await supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("director_id", profile!.id_auto)
      .eq("status", "active");

    // Get venues count
    const { count: venueCount } = await supabase
      .from("venue_directors")
      .select("id", { count: "exact", head: true })
      .eq("director_id", profile!.id_auto)
      .is("archived_at", null);

    // Get tournament IDs for this director
    const { data: myTournaments } = await supabase
      .from("tournaments")
      .select("id")
      .eq("director_id", profile!.id_auto);

    const tournamentIds = myTournaments?.map((t: any) => t.id) || [];

    let viewsCount = 0;
    let favoritesCount = 0;

    if (tournamentIds.length > 0) {
      // Get total views from app_events
      let viewsQuery = supabase
        .from("app_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "tournament_viewed")
        .in("entity_id", tournamentIds);

      if (dateFilter) {
        viewsQuery = viewsQuery.gte("created_at", dateFilter);
      }

      const { count: vc } = await viewsQuery;
      viewsCount = vc || 0;

      // Get total favorites from app_events
      let favoritesQuery = supabase
        .from("app_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "tournament_favorited")
        .in("entity_id", tournamentIds);

      if (dateFilter) {
        favoritesQuery = favoritesQuery.gte("created_at", dateFilter);
      }

      const { count: fc } = await favoritesQuery;
      favoritesCount = fc || 0;
    }

    // Today counts
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();
    let todayViews = 0;
    let todayFavorites = 0;
    if (tournamentIds.length > 0) {
      const { count: tv } = await supabase
        .from("app_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "tournament_viewed")
        .in("entity_id", tournamentIds)
        .gte("created_at", todayIso);
      todayViews = tv || 0;
      const { count: tf } = await supabase
        .from("app_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "tournament_favorited")
        .in("entity_id", tournamentIds)
        .gte("created_at", todayIso);
      todayFavorites = tf || 0;
    }
    setStats({
      myTournaments: tournamentCount || 0,
      activeEvents: activeCount || 0,
      venues: venueCount || 0,
      totalFavorites: favoritesCount,
      totalViews: viewsCount,
      todayViews,
      todayFavorites,
    });
  };

  const loadVenues = async () => {
    const { data: venueDirectors } = await supabase
      .from("venue_directors")
      .select(
        `
        venue_id,
        venues (
          id,
          venue,
          address,
          city,
          state,
          zip_code
        )
      `,
      )
      .eq("director_id", profile!.id_auto)
      .is("archived_at", null);

    if (!venueDirectors) {
      setVenues([]);
      return;
    }

    // Get stats for each venue
    const venuesWithStats: VenueWithStats[] = await Promise.all(
      venueDirectors.map(async (vd: any) => {
        const venue = vd.venues;

        // Count active tournaments at this venue
        const { count: tournamentCount } = await supabase
          .from("tournaments")
          .select("id", { count: "exact", head: true })
          .eq("venue_id", venue.id)
          .eq("director_id", profile!.id_auto)
          .eq("status", "active");

        // Count favorites for tournaments at this venue from app_events
        const { data: venueTournaments } = await supabase
          .from("tournaments")
          .select("id")
          .eq("venue_id", venue.id)
          .eq("director_id", profile!.id_auto);

        const venueTournamentIds =
          venueTournaments?.map((t: any) => t.id) || [];

        let favoritesCount = 0;
        if (venueTournamentIds.length > 0) {
          const { count: fc } = await supabase
            .from("app_events")
            .select("id", { count: "exact", head: true })
            .eq("event_type", "tournament_favorited")
            .in("entity_id", venueTournamentIds);
          favoritesCount = fc || 0;
        }

        return {
          id: venue.id,
          venue: venue.venue,
          address: venue.address,
          city: venue.city,
          state: venue.state,
          zip_code: venue.zip_code,
          activeTournaments: tournamentCount || 0,
          totalFavorites: favoritesCount,
        };
      }),
    );

    setVenues(venuesWithStats);
  };

  const loadTournaments = async () => {
    const dateFilter = getDateFilter();

    let query = supabase
      .from("tournaments")
      .select(
        `
        id,
        name,
        game_type,
        tournament_format,
        tournament_date,
        start_time,
        status,
        venues (venue)
      `,
      )
      .eq("director_id", profile!.id_auto)
      .order("tournament_date", { ascending: false })
      .limit(10);

    if (dateFilter) {
      query = query.gte("created_at", dateFilter);
    }

    const { data: tournamentsData } = await query;

    if (!tournamentsData) {
      setTournaments([]);
      return;
    }

    // Get stats for each tournament
    const tournamentsWithStats: TournamentWithStats[] = await Promise.all(
      tournamentsData.map(async (t: any) => {
        // Favorites from app_events
        const { count: favoritesCount } = await supabase
          .from("app_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "tournament_favorited")
          .eq("entity_id", t.id);

        // Views from app_events
        const { count: viewsCount } = await supabase
          .from("app_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "tournament_viewed")
          .eq("entity_id", t.id);

        return {
          id: t.id,
          name: t.name,
          game_type: t.game_type,
          tournament_format: t.tournament_format,
          tournament_date: t.tournament_date,
          start_time: t.start_time,
          status: t.status,
          venue_name: t.venues?.venue || "Unknown",
          favorites_count: favoritesCount || 0,
          views_count: viewsCount || 0,
        };
      }),
    );

    setTournaments(tournamentsWithStats);
  };

  const loadEventTypeStats = async () => {
    const dateFilter = getDateFilter();

    let query = supabase
      .from("tournaments")
      .select("game_type")
      .eq("director_id", profile!.id_auto);

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
    venues,
    tournaments,
    eventTypeStats,

    // Options
    timePeriodOptions,

    // Actions
    onRefresh,
    handleTimePeriodChange,
  };
};

