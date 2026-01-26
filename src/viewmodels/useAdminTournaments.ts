import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { tournamentService } from "../models/services/tournament.service";
import { useAuthContext } from "../providers/AuthProvider";

export type TournamentStatusFilter =
  | "active"
  | "completed"
  | "cancelled"
  | "archived"
  | "all";
export type SortOption = "date" | "name";

export interface AdminTournamentWithStats {
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
  // Tracking fields
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancelled_by_name: string | null;
  cancellation_reason: string | null;
  archived_at: string | null;
  archived_by: number | null;
  archived_by_name: string | null;
}

export const useAdminTournaments = () => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tournaments, setTournaments] = useState<AdminTournamentWithStats[]>(
    [],
  );
  const [processing, setProcessing] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] =
    useState<TournamentStatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    try {
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
          director:profiles!tournaments_director_id_fkey (name),
          cancelled_at,
          cancelled_by,
          canceller:profiles!tournaments_cancelled_by_fkey (name),
          cancellation_reason,
          archived_at,
          archived_by,
          archiver:profiles!tournaments_archived_by_fkey (name)
        `,
        )
        .order("tournament_date", { ascending: false });

      if (tournamentsError) {
        console.error("Error loading tournaments:", tournamentsError);
        setTournaments([]);
        return;
      }

      if (!tournamentsData) {
        setTournaments([]);
        return;
      }

      // Get stats for each tournament
      const tournamentsWithStats: AdminTournamentWithStats[] =
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
              director_name: t.director?.name || "Unknown Director",
              director_id: t.director_id,
              favorites_count: favoritesCount || 0,
              views_count: viewsCount || 0,
              cancelled_at: t.cancelled_at,
              cancelled_by: t.cancelled_by,
              cancelled_by_name: t.canceller?.name || null,
              cancellation_reason: t.cancellation_reason,
              archived_at: t.archived_at,
              archived_by: t.archived_by,
              archived_by_name: t.archiver?.name || null,
            };
          }),
        );

      setTournaments(tournamentsWithStats);
    } catch (error) {
      console.error("Error loading admin tournaments:", error);
      setTournaments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Archive tournament using shared service
  const handleArchiveTournament = useCallback(
    async (tournamentId: number): Promise<boolean> => {
      if (!profile?.id_auto) return false;

      setProcessing(tournamentId);
      try {
        await tournamentService.archiveTournament(
          tournamentId,
          profile.id_auto,
        );
        setTournaments((prev) =>
          prev.map((t) =>
            t.id === tournamentId
              ? {
                  ...t,
                  status: "archived",
                  archived_at: new Date().toISOString(),
                  archived_by: profile.id_auto,
                  archived_by_name: profile.name || null,
                }
              : t,
          ),
        );
        return true;
      } catch (error) {
        console.error("Error archiving tournament:", error);
        return false;
      } finally {
        setProcessing(null);
      }
    },
    [profile?.id_auto, profile?.name],
  );

  // Cancel tournament using shared service
  const handleCancelTournament = useCallback(
    async (tournamentId: number, reason: string): Promise<boolean> => {
      if (!profile?.id_auto) return false;

      setProcessing(tournamentId);
      try {
        await tournamentService.cancelTournament(
          tournamentId,
          reason,
          profile.id_auto,
        );
        setTournaments((prev) =>
          prev.map((t) =>
            t.id === tournamentId
              ? {
                  ...t,
                  status: "cancelled",
                  cancelled_at: new Date().toISOString(),
                  cancelled_by: profile.id_auto,
                  cancelled_by_name: profile.name || null,
                  cancellation_reason: reason,
                }
              : t,
          ),
        );
        return true;
      } catch (error) {
        console.error("Error cancelling tournament:", error);
        return false;
      } finally {
        setProcessing(null);
      }
    },
    [profile?.id_auto, profile?.name],
  );

  // Restore tournament using shared service
  const handleRestoreTournament = useCallback(
    async (tournamentId: number): Promise<boolean> => {
      setProcessing(tournamentId);
      try {
        await tournamentService.restoreTournament(tournamentId);
        setTournaments((prev) =>
          prev.map((t) =>
            t.id === tournamentId
              ? {
                  ...t,
                  status: "active",
                  archived_at: null,
                  archived_by: null,
                  archived_by_name: null,
                  cancelled_at: null,
                  cancelled_by: null,
                  cancelled_by_name: null,
                  cancellation_reason: null,
                }
              : t,
          ),
        );
        return true;
      } catch (error) {
        console.error("Error restoring tournament:", error);
        return false;
      } finally {
        setProcessing(null);
      }
    },
    [],
  );

  // Complete tournament using shared service
  const handleCompleteTournament = useCallback(
    async (tournamentId: number): Promise<boolean> => {
      setProcessing(tournamentId);
      try {
        await tournamentService.completeTournament(tournamentId);
        setTournaments((prev) =>
          prev.map((t) =>
            t.id === tournamentId ? { ...t, status: "completed" } : t,
          ),
        );
        return true;
      } catch (error) {
        console.error("Error completing tournament:", error);
        return false;
      } finally {
        setProcessing(null);
      }
    },
    [],
  );

  // Apply filters and sorting
  const filteredTournaments = useMemo(() => {
    let result = [...tournaments];

    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }

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
    }

    return result;
  }, [tournaments, statusFilter, sortOption, searchQuery]);

  // Calculate counts for each status tab
  const statusCounts = useMemo(() => {
    return {
      active: tournaments.filter((t) => t.status === "active").length,
      completed: tournaments.filter((t) => t.status === "completed").length,
      cancelled: tournaments.filter((t) => t.status === "cancelled").length,
      archived: tournaments.filter((t) => t.status === "archived").length,
      all: tournaments.length,
    };
  }, [tournaments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTournaments();
  }, []);

  return {
    // State
    loading,
    refreshing,
    tournaments,
    filteredTournaments,
    totalCount: tournaments.length,
    processing,

    // Filters & Sort
    statusFilter,
    sortOption,
    searchQuery,

    // Counts for tabs
    statusCounts,

    // Actions
    onRefresh,
    setStatusFilter,
    setSortOption,
    setSearchQuery,
    archiveTournament: handleArchiveTournament,
    cancelTournament: handleCancelTournament,
    restoreTournament: handleRestoreTournament,
    completeTournament: handleCompleteTournament,
  };
};
