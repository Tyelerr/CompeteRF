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

export type TournamentStatusFilter = "active" | "completed" | "cancelled" | "archived" | "all";
export type SortOption = "date" | "name";
export type SortDirection = "asc" | "desc";

interface StatusCounts {
  active: number;
  completed: number;
  cancelled: number;
  archived: number;
  all: number;
}

export const useBarTournamentManager = () => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [tournaments, setTournaments] = useState<BarTournamentWithStats[]>([]);
  const [filteredTournaments, setFilteredTournaments] = useState<BarTournamentWithStats[]>([]);
  const [statusFilter, setStatusFilter] = useState<TournamentStatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    active: 0, completed: 0, cancelled: 0, archived: 0, all: 0,
  });

  const totalCount = tournaments.length;

  useEffect(() => {
    if (profile?.id_auto) loadTournaments();
  }, [profile?.id_auto]);

  useEffect(() => {
    applyFilters();
  }, [tournaments, statusFilter, sortOption, sortDirection, searchQuery]);

  const loadTournaments = async () => {
    if (!profile?.id_auto) return;
    try {
      setLoading(true);
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
      const { data: tournamentData } = await supabase
        .from("tournaments")
        .select(`*, venues (id, venue), profiles!director_id (user_name)`)
        .in("venue_id", venueIds)
        .order("tournament_date", { ascending: false });

      if (!tournamentData) { setTournaments([]); return; }

      const tournamentsWithStats: BarTournamentWithStats[] = await Promise.all(
        tournamentData.map(async (tournament: any) => {
          const { count: viewsCount } = await supabase
            .from("tournament_analytics")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournament.id)
            .eq("event_type", "view");
          const { count: favoritesCount } = await supabase
            .from("favorites")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournament.id);
          return {
            ...tournament,
            venue_name: tournament.venues?.venue || "Unknown",
            director_name: tournament.profiles?.user_name || "Unknown",
            views_count: viewsCount || 0,
            favorites_count: favoritesCount || 0,
            can_edit: true,
            can_delete: tournament.status !== "completed",
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
      (acc, t) => { acc.all++; acc[t.status as keyof StatusCounts]++; return acc; },
      { active: 0, completed: 0, cancelled: 0, archived: 0, all: 0 },
    );
    setStatusCounts(counts);
  };

  const applyFilters = () => {
    let filtered = [...tournaments];
    if (statusFilter !== "all") filtered = filtered.filter((t) => t.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.game_type.toLowerCase().includes(q) ||
          t.venue_name.toLowerCase().includes(q) ||
          t.director_name.toLowerCase().includes(q),
      );
    }
    filtered.sort((a, b) => {
      if (sortOption === "date") {
        const diff = new Date(a.tournament_date).getTime() - new Date(b.tournament_date).getTime();
        return sortDirection === "desc" ? -diff : diff;
      }
      const nameDiff = a.name.localeCompare(b.name);
      return sortDirection === "asc" ? nameDiff : -nameDiff;
    });
    setFilteredTournaments(filtered);
  };

  const archiveTournament = async (tournamentId: number): Promise<boolean> => {
    if (!profile?.id_auto) return false;
    try {
      setProcessing(tournamentId);
      await tournamentService.archiveTournament(tournamentId, profile.id_auto);
      await loadTournaments();
      return true;
    } catch (error) { console.error("Error archiving tournament:", error); return false; }
    finally { setProcessing(null); }
  };

  const cancelTournament = async (tournamentId: number, reason: string): Promise<boolean> => {
    if (!profile?.id_auto) return false;
    try {
      setProcessing(tournamentId);
      await tournamentService.cancelTournament(tournamentId, reason, profile.id_auto);
      await loadTournaments();
      return true;
    } catch (error) { console.error("Error cancelling tournament:", error); return false; }
    finally { setProcessing(null); }
  };

  const restoreTournament = async (tournamentId: number): Promise<boolean> => {
    try {
      setProcessing(tournamentId);
      await tournamentService.restoreTournament(tournamentId);
      await loadTournaments();
      return true;
    } catch (error) { console.error("Error restoring tournament:", error); return false; }
    finally { setProcessing(null); }
  };

  const onRefresh = () => { setRefreshing(true); loadTournaments(); };

  return {
    loading, refreshing, processing,
    tournaments: filteredTournaments,
    totalCount,
    statusFilter, sortOption, sortDirection, searchQuery, statusCounts,
    setStatusFilter,
    setSortOption,
    setSortDirection,
    setSearchQuery,
    archiveTournament, cancelTournament, restoreTournament, onRefresh,
  };
};

