import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { tournamentService } from "../models/services/tournament.service";
import { Tournament } from "../models/types/tournament.types";
import { useAuthContext } from "../providers/AuthProvider";

export interface BarTournamentWithStats extends Tournament {
  views_count: number;
  favorites_count: number;
  venue_name: string;
  director_name: string;
  can_edit: boolean;
  can_delete: boolean;
}

export type TournamentStatusFilter =
  | "active"
  | "completed"
  | "cancelled"
  | "archived"
  | "all";
export type SortOption = "date" | "name";

interface StatusCounts {
  active: number;
  completed: number;
  cancelled: number;
  archived: number;
  all: number;
}

export const useBarTournamentManager = () => {
  const { profile } = useAuthContext();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);

  // Data
  const [tournaments, setTournaments] = useState<BarTournamentWithStats[]>([]);
  const [filteredTournaments, setFilteredTournaments] = useState<
    BarTournamentWithStats[]
  >([]);

  // Filters
  const [statusFilter, setStatusFilter] =
    useState<TournamentStatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [searchQuery, setSearchQuery] = useState("");

  // Counts
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    active: 0,
    completed: 0,
    cancelled: 0,
    archived: 0,
    all: 0,
  });

  const totalCount = tournaments.length;

  useEffect(() => {
    if (profile?.id_auto) {
      loadTournaments();
    }
  }, [profile?.id_auto]);

  useEffect(() => {
    applyFilters();
  }, [tournaments, statusFilter, sortOption, searchQuery]);

  // Load tournaments for bar owner's venues only
  const loadTournaments = async () => {
    if (!profile?.id_auto) return;

    try {
      setLoading(true);

      // First, get venues owned by this bar owner
      const { data: venueOwnerships } = await supabase
        .from("venue_owners")
        .select("venue_id")
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      if (!venueOwnerships || venueOwnerships.length === 0) {
        setTournaments([]);
        calculateStatusCounts([]);
        return;
      }

      const venueIds = venueOwnerships.map((vo) => vo.venue_id);

      // Get tournaments from owned venues
      const { data: tournamentData } = await supabase
        .from("tournaments")
        .select(
          `
          *,
          venues (
            id,
            venue
          ),
          profiles!director_id (
            user_name
          )
        `,
        )
        .in("venue_id", venueIds)
        .order("tournament_date", { ascending: false });

      if (!tournamentData) {
        setTournaments([]);
        return;
      }

      // Get stats for each tournament
      const tournamentsWithStats: BarTournamentWithStats[] = await Promise.all(
        tournamentData.map(async (tournament: any) => {
          // Get view count
          const { count: viewsCount } = await supabase
            .from("tournament_analytics")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournament.id)
            .eq("event_type", "view");

          // Get favorites count
          const { count: favoritesCount } = await supabase
            .from("favorites")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournament.id);

          // Bar owners can edit/delete tournaments at their venues
          const canEdit = true;
          const canDelete = tournament.status !== "completed";

          return {
            ...tournament,
            venue_name: tournament.venues?.venue || "Unknown",
            director_name: tournament.profiles?.user_name || "Unknown",
            views_count: viewsCount || 0,
            favorites_count: favoritesCount || 0,
            can_edit: canEdit,
            can_delete: canDelete,
          };
        }),
      );

      setTournaments(tournamentsWithStats);
      calculateStatusCounts(tournamentsWithStats);
    } catch (error) {
      console.error("Error loading tournaments:", error);
      Alert.alert("Error", "Failed to load tournaments. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const calculateStatusCounts = (tournamentList: BarTournamentWithStats[]) => {
    const counts = tournamentList.reduce(
      (acc, tournament) => {
        acc.all++;
        acc[tournament.status as keyof StatusCounts]++;
        return acc;
      },
      { active: 0, completed: 0, cancelled: 0, archived: 0, all: 0 },
    );
    setStatusCounts(counts);
  };

  const applyFilters = () => {
    let filtered = [...tournaments];

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.game_type.toLowerCase().includes(query) ||
          t.venue_name.toLowerCase().includes(query) ||
          t.director_name.toLowerCase().includes(query),
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortOption === "date") {
        return (
          new Date(b.tournament_date).getTime() -
          new Date(a.tournament_date).getTime()
        );
      } else {
        return a.name.localeCompare(b.name);
      }
    });

    setFilteredTournaments(filtered);
  };

  // Actions
  const archiveTournament = async (tournamentId: number): Promise<boolean> => {
    if (!profile?.id_auto) return false;

    try {
      setProcessing(tournamentId);
      await tournamentService.archiveTournament(tournamentId, profile.id_auto);
      await loadTournaments(); // Reload data
      return true;
    } catch (error) {
      console.error("Error archiving tournament:", error);
      return false;
    } finally {
      setProcessing(null);
    }
  };

  const cancelTournament = async (
    tournamentId: number,
    reason: string,
  ): Promise<boolean> => {
    if (!profile?.id_auto) return false;

    try {
      setProcessing(tournamentId);
      await tournamentService.cancelTournament(
        tournamentId,
        reason,
        profile.id_auto,
      );
      await loadTournaments(); // Reload data
      return true;
    } catch (error) {
      console.error("Error cancelling tournament:", error);
      return false;
    } finally {
      setProcessing(null);
    }
  };

  const restoreTournament = async (tournamentId: number): Promise<boolean> => {
    try {
      setProcessing(tournamentId);
      await tournamentService.restoreTournament(tournamentId);
      await loadTournaments(); // Reload data
      return true;
    } catch (error) {
      console.error("Error restoring tournament:", error);
      return false;
    } finally {
      setProcessing(null);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTournaments();
  };

  return {
    // State
    loading,
    refreshing,
    processing,

    // Data
    tournaments: filteredTournaments,
    totalCount,

    // Filters
    statusFilter,
    sortOption,
    searchQuery,
    statusCounts,

    // Filter actions
    setStatusFilter,
    setSortOption,
    setSearchQuery,

    // Tournament actions
    archiveTournament,
    cancelTournament,
    restoreTournament,
    onRefresh,
  };
};
