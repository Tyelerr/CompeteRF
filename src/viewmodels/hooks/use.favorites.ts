import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { favoriteService } from "../../models/services/favorite.service";

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

  // ── Query ────────────────────────────────────────────────────────────────
  const {
    data: favorites = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["favorites", "tournaments", userId],
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

  // ── Mutations ────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (tournamentId: number) =>
      favoriteService.addFavoriteTournament(userId!, tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (tournamentId: number) =>
      favoriteService.removeFavoriteTournament(userId!, tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const toggleFavorite = async (tournamentId: number) => {
    if (!userId) return;
    if (favoritedIds.includes(tournamentId)) {
      await removeMutation.mutateAsync(tournamentId);
    } else {
      await addMutation.mutateAsync(tournamentId);
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
