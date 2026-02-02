import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export interface TDVenue {
  id: number;
  venue_id: number;
  director_id: number;
  assigned_by: number | null;
  assigned_at: string;
  archived_at: string | null;

  // Joined venue data
  venues?: {
    id: number;
    venue: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    phone_number?: string;
    status: string;
  };

  // Joined assigner data
  assigned_by_profile?: {
    name: string;
    user_name: string;
    email: string;
  };

  // Computed stats
  tournament_count?: number;
  active_tournaments?: number;
  last_tournament_date?: string;
  total_views?: number;
  total_favorites?: number;
  status?: "active" | "archived";
}

export interface TDVenueStats {
  totalVenues: number;
  activeVenues: number;
  archivedVenues: number;
  totalTournaments: number;
  activeTournaments: number;
}

export interface TDVenueFilters {
  search: string;
  status: "all" | "active" | "archived";
  state?: string;
}

export const useTournamentDirectorVenues = () => {
  const { profile } = useAuthContext();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venues, setVenues] = useState<TDVenue[]>([]);
  const [stats, setStats] = useState<TDVenueStats>({
    totalVenues: 0,
    activeVenues: 0,
    archivedVenues: 0,
    totalTournaments: 0,
    activeTournaments: 0,
  });

  // Filters
  const [filters, setFilters] = useState<TDVenueFilters>({
    search: "",
    status: "active",
  });

  // Options
  const [stateOptions, setStateOptions] = useState<string[]>([]);

  useEffect(() => {
    if (profile?.id_auto) {
      loadData();
    }
  }, [profile?.id_auto, filters]);

  const loadData = async () => {
    if (!profile?.id_auto) return;

    try {
      setLoading(true);

      await Promise.all([loadVenues(), loadStats(), loadStateOptions()]);
    } catch (error) {
      console.error("Error loading TD venues:", error);
      Alert.alert("Error", "Failed to load venues");
    } finally {
      setLoading(false);
    }
  };

  const loadVenues = async () => {
    if (!profile?.id_auto) return;

    try {
      // Get venues where this director is assigned
      let query = supabase
        .from("venue_directors")
        .select(
          `
          *,
          venues!venue_directors_venue_id_fkey (
            id,
            venue,
            address,
            city,
            state,
            zip_code,
            phone_number,
            status
          ),
          assigned_by_profile:profiles!venue_directors_assigned_by_fkey (
            name,
            user_name,
            email
          )
        `,
        )
        .eq("director_id", profile.id_auto)
        .order("assigned_at", { ascending: false });

      // Apply status filter
      if (filters.status === "active") {
        query = query.is("archived_at", null);
      } else if (filters.status === "archived") {
        query = query.not("archived_at", "is", null);
      }

      const { data, error } = await query;
      if (error) throw error;

      let venueDirectorships = data || [];

      // Search filter (done client-side for complex search)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        venueDirectorships = venueDirectorships.filter(
          (vd: any) =>
            vd.venues?.venue?.toLowerCase().includes(searchLower) ||
            vd.venues?.city?.toLowerCase().includes(searchLower) ||
            vd.venues?.state?.toLowerCase().includes(searchLower) ||
            vd.venues?.address?.toLowerCase().includes(searchLower) ||
            vd.assigned_by_profile?.name?.toLowerCase().includes(searchLower),
        );
      }

      // State filter
      if (filters.state) {
        venueDirectorships = venueDirectorships.filter(
          (vd: any) => vd.venues?.state === filters.state,
        );
      }

      // Add computed stats for each venue
      const venuesWithStats = await Promise.all(
        venueDirectorships.map(async (vd: any) => {
          // Get tournament stats for this director at this venue
          const { data: tournaments } = await supabase
            .from("tournaments")
            .select("id, status, views_count, favorites_count, tournament_date")
            .eq("director_id", profile.id_auto)
            .eq("venue_id", vd.venue_id);

          const tournamentCount = tournaments?.length || 0;
          const activeTournaments =
            tournaments?.filter((t) => t.status === "active").length || 0;
          const totalViews =
            tournaments?.reduce((sum, t) => sum + (t.views_count || 0), 0) || 0;
          const totalFavorites =
            tournaments?.reduce(
              (sum, t) => sum + (t.favorites_count || 0),
              0,
            ) || 0;

          // Get last tournament date
          const sortedTournaments = tournaments?.sort(
            (a, b) =>
              new Date(b.tournament_date).getTime() -
              new Date(a.tournament_date).getTime(),
          );
          const lastTournamentDate =
            sortedTournaments?.[0]?.tournament_date || null;

          return {
            ...vd,
            tournament_count: tournamentCount,
            active_tournaments: activeTournaments,
            last_tournament_date: lastTournamentDate,
            total_views: totalViews,
            total_favorites: totalFavorites,
            status: vd.archived_at ? "archived" : "active",
          };
        }),
      );

      setVenues(venuesWithStats);
    } catch (error) {
      console.error("Error loading venues:", error);
      throw error;
    }
  };

  const loadStats = async () => {
    if (!profile?.id_auto) return;

    try {
      // Get all venue directorships for stats
      const { data: allVenueDirectorships } = await supabase
        .from("venue_directors")
        .select("venue_id, archived_at")
        .eq("director_id", profile.id_auto);

      if (!allVenueDirectorships) return;

      const totalVenues = allVenueDirectorships.length;
      const activeVenues = allVenueDirectorships.filter(
        (vd) => !vd.archived_at,
      ).length;
      const archivedVenues = allVenueDirectorships.filter(
        (vd) => vd.archived_at,
      ).length;

      // Get tournament stats
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, status")
        .eq("director_id", profile.id_auto);

      const totalTournaments = tournaments?.length || 0;
      const activeTournaments =
        tournaments?.filter((t) => t.status === "active").length || 0;

      setStats({
        totalVenues,
        activeVenues,
        archivedVenues,
        totalTournaments,
        activeTournaments,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const loadStateOptions = async () => {
    try {
      // Get unique states from venues where this director is assigned
      const { data } = await supabase
        .from("venue_directors")
        .select(
          `
          venues!venue_directors_venue_id_fkey (state)
        `,
        )
        .eq("director_id", profile?.id_auto)
        .is("archived_at", null);

      if (data) {
        const states = [
          ...new Set(data.map((vd: any) => vd.venues?.state).filter(Boolean)),
        ].sort();

        setStateOptions(states);
      }
    } catch (error) {
      console.error("Error loading state options:", error);
    }
  };

  // Actions
  const handleVenuePress = (venue: TDVenue) => {
    // Navigate to venue tournaments or details
    console.log("Navigate to venue:", venue);
  };

  const handleCreateTournament = (venue: TDVenue) => {
    // Navigate to create tournament with venue pre-selected
    console.log("Create tournament for venue:", venue);
  };

  // Filter helpers
  const updateSearch = (search: string) => {
    setFilters((prev) => ({ ...prev, search }));
  };

  const updateStatusFilter = (status: "all" | "active" | "archived") => {
    setFilters((prev) => ({ ...prev, status }));
  };

  const updateStateFilter = (state?: string) => {
    setFilters((prev) => ({ ...prev, state }));
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }, [profile?.id_auto, filters]);

  // Computed values
  const filteredVenues = venues; // Filtering already done in loadVenues
  const statusCounts = {
    all: stats.totalVenues,
    active: stats.activeVenues,
    archived: stats.archivedVenues,
  };

  // Permissions (tournament director specific)
  const canCreateTournaments = true; // TDs can create tournaments at assigned venues
  const canViewArchivedVenues = true; // TDs can see their archived venue assignments
  const canRequestVenueAssignment = false; // Usually handled by admins/bar owners

  return {
    // State
    loading,
    refreshing,

    // Data
    venues: filteredVenues,
    stats,
    stateOptions,

    // Filters
    filters,
    statusCounts,

    // Actions
    handleVenuePress,
    handleCreateTournament,

    // Filter actions
    updateSearch,
    updateStatusFilter,
    updateStateFilter,
    onRefresh,

    // Permissions
    canCreateTournaments,
    canViewArchivedVenues,
    canRequestVenueAssignment,

    // User info
    currentUser: profile,
  };
};
