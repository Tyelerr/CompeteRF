import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type TournamentStatusFilter =
  | "active"
  | "completed"
  | "cancelled"
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
}

export const useAdminTournaments = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tournaments, setTournaments] = useState<AdminTournamentWithStats[]>(
    [],
  );

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
      // Get ALL tournaments (admin sees everything)
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
              director_name: t.profiles?.name || "Unknown Director",
              director_id: t.director_id,
              favorites_count: favoritesCount || 0,
              views_count: viewsCount || 0,
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

  // Apply filters and sorting
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
    }

    return result;
  }, [tournaments, statusFilter, sortOption, searchQuery]);

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
    loadTournaments();
  }, []);

  return {
    // State
    loading,
    refreshing,
    tournaments,
    filteredTournaments,
    totalCount: tournaments.length,

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
  };
};
