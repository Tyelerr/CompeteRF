import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tournamentService } from "../../models/services/tournament.service";
import { Tournament } from "../../models/types/tournament.types";
import { useFilterStore } from "../stores/filter.store";

export const useTournaments = () => {
  const queryClient = useQueryClient();
  const { filters, page } = useFilterStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tournaments", filters, page],
    queryFn: () => tournamentService.getTournaments(filters, page),
  });

  const createMutation = useMutation({
    mutationFn: (tournament: Partial<Tournament>) =>
      tournamentService.createTournament(tournament),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: number;
      updates: Partial<Tournament>;
    }) => tournamentService.updateTournament(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({
      id,
      reason,
      cancelledBy,
    }: {
      id: number;
      reason: string;
      cancelledBy: number;
    }) => tournamentService.cancelTournament(id, reason, cancelledBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });

  return {
    tournaments: data?.data || [],
    totalCount: data?.count || 0,
    isLoading,
    error,
    refetch,
    createTournament: createMutation.mutateAsync,
    updateTournament: updateMutation.mutateAsync,
    cancelTournament: cancelMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isCancelling: cancelMutation.isPending,
  };
};

export const useTournament = (id?: number) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => tournamentService.getTournament(id!),
    enabled: !!id,
  });

  return {
    tournament: data,
    isLoading,
    error,
  };
};

export const useTournamentsByDirector = (directorId?: number) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tournaments", "director", directorId],
    queryFn: () => tournamentService.getTournamentsByDirector(directorId!),
    enabled: !!directorId,
  });

  return {
    tournaments: data || [],
    isLoading,
    error,
  };
};
