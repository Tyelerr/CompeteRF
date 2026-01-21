import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { TournamentWithStats } from "../models/dashboard-types";
import { useAuthContext } from "../providers/AuthProvider";

export type TournamentFilter = "all" | "active" | "completed" | "cancelled";

interface UseMyTournamentsReturn {
  // State
  loading: boolean;
  refreshing: boolean;
  tournaments: TournamentWithStats[];
  filter: TournamentFilter;

  // Actions
  onRefresh: () => void;
  setFilter: (filter: TournamentFilter) => void;
  onEditTournament: (tournamentId: number) => void;
  onCancelTournament: (tournamentId: number) => Promise<void>;
  onDuplicateTournament: (tournamentId: number) => void;
}

export const useMyTournaments = (
  initialFilter?: string,
): UseMyTournamentsReturn => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tournaments, setTournaments] = useState<TournamentWithStats[]>([]);
  const [filter, setFilter] = useState<TournamentFilter>(
    (initialFilter as TournamentFilter) || "all",
  );

  // Load tournaments when profile or filter changes
  useEffect(() => {
    if (profile?.id_auto) {
      loadTournaments();
    }
  }, [profile?.id_auto, filter]);

  const loadTournaments = async () => {
    if (!profile?.id_auto) return;

    try {
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
        .eq("director_id", profile.id_auto)
        .order("tournament_date", { ascending: false });

      // Apply filter
      if (filter === "active") {
        query = query
          .eq("status", "active")
          .gte("tournament_date", new Date().toISOString().split("T")[0]);
      } else if (filter === "completed") {
        query = query.eq("status", "completed");
      } else if (filter === "cancelled") {
        query = query.eq("status", "cancelled");
      }

      const { data: tournamentsData, error } = await query;

      if (error) {
        console.error("Error loading tournaments:", error);
        return;
      }

      if (!tournamentsData) {
        setTournaments([]);
        return;
      }

      // Get stats for each tournament
      const tournamentsWithStats: TournamentWithStats[] = await Promise.all(
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
            venue_name: t.venues?.venue || "Unknown",
            favorites_count: favoritesCount || 0,
            views_count: viewsCount || 0,
          };
        }),
      );

      setTournaments(tournamentsWithStats);
    } catch (error) {
      console.error("Error loading tournaments:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTournaments();
  }, [profile?.id_auto, filter]);

  const onEditTournament = useCallback((tournamentId: number) => {
    // Navigation will be handled by the view
    // This is here for any pre-navigation logic if needed
    console.log("Edit tournament:", tournamentId);
  }, []);

  const onCancelTournament = useCallback(
    async (tournamentId: number) => {
      return new Promise<void>((resolve, reject) => {
        Alert.alert(
          "Cancel Tournament",
          "Are you sure you want to cancel this tournament? This action cannot be undone.",
          [
            {
              text: "No, Keep It",
              style: "cancel",
              onPress: () => resolve(),
            },
            {
              text: "Yes, Cancel It",
              style: "destructive",
              onPress: async () => {
                try {
                  const { error } = await supabase
                    .from("tournaments")
                    .update({ status: "cancelled" })
                    .eq("id", tournamentId)
                    .eq("director_id", profile?.id_auto);

                  if (error) {
                    Alert.alert("Error", "Failed to cancel tournament");
                    reject(error);
                    return;
                  }

                  // Refresh the list
                  loadTournaments();
                  resolve();
                } catch (error) {
                  console.error("Error cancelling tournament:", error);
                  Alert.alert("Error", "Failed to cancel tournament");
                  reject(error);
                }
              },
            },
          ],
        );
      });
    },
    [profile?.id_auto],
  );

  const onDuplicateTournament = useCallback((tournamentId: number) => {
    // Navigation will be handled by the view
    // This is here for any pre-navigation logic if needed
    console.log("Duplicate tournament:", tournamentId);
  }, []);

  return {
    // State
    loading,
    refreshing,
    tournaments,
    filter,

    // Actions
    onRefresh,
    setFilter,
    onEditTournament,
    onCancelTournament,
    onDuplicateTournament,
  };
};
