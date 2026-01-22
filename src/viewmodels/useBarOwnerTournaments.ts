import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export type TournamentStatusFilter =
  | "active"
  | "completed"
  | "cancelled"
  | "all";
export type SortOption = "date" | "name" | "views" | "favorites";

export interface BarOwnerTournamentWithStats {
  id: number;
  name: string;
  game_type: string;
  tournament_format: string;
  tournament_date: string;
  start_time: string;
  status: string;
  venue_id: number;
  venue_name: string;
  director_name: string;
  director_id: number;
  favorites_count: number;
  views_count: number;
}

export interface VenueOption {
  id: number;
  name: string;
}

interface UseBarOwnerTournamentsReturn {
  // State
  loading: boolean;
  refreshing: boolean;
  tournaments: BarOwnerTournamentWithStats[];
  filteredTournaments: BarOwnerTournamentWithStats[];

  // Filters & Sort
  statusFilter: TournamentStatusFilter;
  sortOption: SortOption;
  searchQuery: string;

  // Counts for tabs
  statusCounts: {
    active: number;
    completed: number;
    cancelled: number;
    all: number;
  };

  // Venue info
  venues: VenueOption[];
  venueCount: number;

  // Actions
  onRefresh: () => void;
  setStatusFilter: (filter: TournamentStatusFilter) => void;
  setSortOption: (sort: SortOption) => void;
  setSearchQuery: (query: string) => void;
}

export const useBarOwnerTournaments = (): UseBarOwnerTournamentsReturn => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tournaments, setTournaments] = useState<BarOwnerTournamentWithStats[]>(
    [],
  );
  const [venues, setVenues] = useState<VenueOption[]>([]);

  // Filters - default to "active" tab
  const [statusFilter, setStatusFilter] =
    useState<TournamentStatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [searchQuery, setSearchQuery] = useState("");

  // Load venues and tournaments when profile is available
  useEffect(() => {
    if (profile?.id_auto) {
      loadData();
    }
  }, [profile?.id_auto]);

  const loadData = async () => {
    if (!profile?.id_auto) return;

    try {
      // Step 1: Get all venues owned by this bar owner
      const { data: venueOwnersData, error: venueOwnersError } = await supabase
        .from("venue_owners")
        .select("venue_id, venues(id, venue)")
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      if (venueOwnersError) {
        console.error("Error loading venue owners:", venueOwnersError);
        return;
      }

      if (!venueOwnersData || venueOwnersData.length === 0) {
        setVenues([]);
        setTournaments([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Extract venue IDs and build venue options
      const venueIds = venueOwnersData.map((vo: any) => vo.venue_id);
      const venueOptions: VenueOption[] = venueOwnersData.map((vo: any) => ({
        id: vo.venue_id,
        name: vo.venues?.venue || "Unknown Venue",
      }));
      setVenues(venueOptions);

      // Step 2: Get all tournaments at these venues
      const { data: tournamentsData, error: tournamentsError } = await supabase
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
          venue_id,
          director_id,
          venues (venue),
          profiles:director_id (name)
        `,
        )
        .in("venue_id", venueIds)
        .order("tournament_date", { ascending: false });

      if (tournamentsError) {
        console.error("Error loading tournaments:", tournamentsError);
        return;
      }

      if (!tournamentsData) {
        setTournaments([]);
        return;
      }

      // Step 3: Get stats for each tournament
      const tournamentsWithStats: BarOwnerTournamentWithStats[] =
        await Promise.all(
          tournamentsData.map(async (t: any) => {
            const { count: favoritesCount } = await supabase
              .from("favorites")
              .select("id", { count: "exact", head: true })
              .eq("tournament_id", t.id);

            const { count: viewsCount } = await supabase
              .from("tournament_analytics")
              .select("id", { count: "exact", head: true })
              .eq("tournament_id", t.id)
              .eq("event_type", "view");

            return {
              id: t.id,
              name: t.name,
              game_type: t.game_type,
              tournament_format: t.tournament_format,
              tournament_date: t.tournament_date,
              start_time: t.start_time,
              status: t.status,
              venue_id: t.venue_id,
              venue_name: t.venues?.venue || "Unknown",
              director_name: t.profiles?.name || "Unknown Director",
              director_id: t.director_id,
              favorites_count: favoritesCount || 0,
              views_count: viewsCount || 0,
            };
          }),
        );

      setTournaments(tournamentsWithStats);
    } catch (error) {
      console.error("Error loading bar owner tournaments:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Apply filters and sorting to tournaments
  const filteredTournaments = useMemo(() => {
    let result = [...tournaments];
    const today = new Date().toISOString().split("T")[0];

    // Status filter
    if (statusFilter === "active") {
      result = result.filter(
        (t) => t.status === "active" && t.tournament_date >= today,
      );
    } else if (statusFilter === "completed") {
      result = result.filter((t) => t.status === "completed");
    } else if (statusFilter === "cancelled") {
      result = result.filter((t) => t.status === "cancelled");
    }
    // "all" shows everything

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.game_type.toLowerCase().includes(query) ||
          t.venue_name.toLowerCase().includes(query) ||
          t.director_name.toLowerCase().includes(query),
      );
    }

    // Sorting
    switch (sortOption) {
      case "date":
        result.sort(
          (a, b) =>
            new Date(b.tournament_date).getTime() -
            new Date(a.tournament_date).getTime(),
        );
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "views":
        result.sort((a, b) => b.views_count - a.views_count);
        break;
      case "favorites":
        result.sort((a, b) => b.favorites_count - a.favorites_count);
        break;
    }

    return result;
  }, [tournaments, statusFilter, sortOption, searchQuery]);

  // Calculate counts for each status tab
  // Calculate counts for each status tab
  const statusCounts = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];

    const active = tournaments.filter(
      (t) => t.status === "active" && t.tournament_date >= today,
    ).length;

    const completed = tournaments.filter(
      (t) => t.status === "completed",
    ).length;

    const cancelled = tournaments.filter(
      (t) => t.status === "cancelled",
    ).length;

    return {
      active,
      completed,
      cancelled,
      all: tournaments.length,
    };
  }, [tournaments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [profile?.id_auto]);

  return {
    // State
    loading,
    refreshing,
    tournaments,
    filteredTournaments,

    // Filters & Sort
    statusFilter,
    sortOption,
    searchQuery,

    // Counts for tabs
    statusCounts,

    // Venue info
    venues,
    venueCount: venues.length,

    // Actions
    onRefresh,
    setStatusFilter,
    setSortOption,
    setSearchQuery,
  };
};
