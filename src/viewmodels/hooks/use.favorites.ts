import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Alert } from "react-native";
import { favoriteService } from "../../models/services/favorite.service";
import { Favorite } from "../../models/types/tournament.types";

/**
 * Shared hook for tournament favorites.
 *
 * @param userId  The profile's `id_auto` (internal integer PK).
 *                Pass `undefined` when the user is not authenticated —
 *                the query will be disabled automatically.
 *
 * Usage:
 *   const { favoritedIds, toggleFavorite, isFavorited } = useFavorites(profile?.id_auto);
 */
export const useFavorites = (userId?: number) => {
  const queryClient = useQueryClient();

  const QUERY_KEY = ["favorites", "tournaments", userId];

  // ── Query ────────────────────────────────────────────────────────────────
  const {
    data: favorites = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => favoriteService.getFavoriteTournaments(userId!),
    enabled: !!userId,
  });

  /** Flat array of tournament IDs the user has favorited */
  const favoritedIds = useMemo(
    () =>
      favorites
        .map((f) => f.tournament_id)
        .filter((id): id is number => id != null),
    [favorites],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (tournamentId: number) =>
      favoriteService.addFavoriteTournament(userId!, tournamentId),

    // Optimistic update — fill the heart instantly
    onMutate: async (tournamentId: number) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Favorite[]>(QUERY_KEY);
      queryClient.setQueryData<Favorite[]>(QUERY_KEY, (old = []) => [
        ...old,
        { tournament_id: tournamentId, favorite_type: "single" } as Favorite,
      ]);
      return { previous };
    },

    // Roll back on failure
    onError: (_err, _tournamentId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      Alert.alert("Error", "Could not save favourite. Please try again.");
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (tournamentId: number) =>
      favoriteService.removeFavoriteTournament(userId!, tournamentId),

    // Optimistic update — unfill the heart instantly
    onMutate: async (tournamentId: number) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Favorite[]>(QUERY_KEY);
      queryClient.setQueryData<Favorite[]>(QUERY_KEY, (old = []) =>
        old.filter((f) => f.tournament_id !== tournamentId),
      );
      return { previous };
    },

    // Roll back on failure
    onError: (_err, _tournamentId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      Alert.alert("Error", "Could not remove favourite. Please try again.");
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Toggle favourite state for a tournament.
   * Errors are caught here — mutations handle their own rollback and alerts.
   */
  const toggleFavorite = async (tournamentId: number) => {
    if (!userId) return;
    try {
      if (favoritedIds.includes(tournamentId)) {
        await removeMutation.mutateAsync(tournamentId);
      } else {
        await addMutation.mutateAsync(tournamentId);
      }
    } catch {
      // onError in each mutation already rolled back and showed the alert.
      // Catch here prevents the unhandled promise rejection.
    }
  };

  const isFavorited = (tournamentId: number) =>
    favoritedIds.includes(tournamentId);

  return {
    /** Full Favorite rows with joined tournament + venue data */
    favorites,
    /** Just the tournament IDs — handy for quick lookup */
    favoritedIds,
    isLoading,
    refetch,
    toggleFavorite,
    isFavorited,
    isToggling: addMutation.isPending || removeMutation.isPending,
  };
};
