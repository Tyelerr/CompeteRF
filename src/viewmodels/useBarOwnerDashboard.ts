import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export interface BarOwnerStats {
  totalVenues: number;
  totalDirectors: number;
  activeTournaments: number;
  totalViews: number;
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

  // Stats
  const [stats, setStats] = useState<BarOwnerStats>({
    totalVenues: 0,
    totalDirectors: 0,
    activeTournaments: 0,
    totalViews: 0,
  });

  // Recent venues
  const [recentVenues, setRecentVenues] = useState<BarOwnerVenueSummary[]>([]);

  useEffect(() => {
    if (profile?.id_auto) {
      loadDashboardData();
    }
  }, [profile?.id_auto]);

  const loadDashboardData = async () => {
    if (!profile?.id_auto) return;

    try {
      await Promise.all([loadStats(), loadRecentVenues()]);
    } catch (error) {
      console.error("Error loading bar owner dashboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadStats = async () => {
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
    const { count: viewsCount } = await supabase
      .from("tournament_analytics")
      .select("id, tournaments!inner(venue_id)", {
        count: "exact",
        head: true,
      })
      .in("tournaments.venue_id", venueIds)
      .eq("event_type", "view");

    setStats({
      totalVenues,
      totalDirectors: directorCount || 0,
      activeTournaments: tournamentCount || 0,
      totalViews: viewsCount || 0,
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

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  return {
    // State
    loading,
    refreshing,
    stats,
    recentVenues,

    // Actions
    onRefresh,
  };
};
