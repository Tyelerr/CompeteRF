// src/viewmodels/hooks/use.registrations.ts
// React Query hooks for registrations. Mirrors use.tournaments.ts:
// useQuery for reads, useMutation + invalidateQueries for writes.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { registrationService } from "../../models/services/registration.service";
import {
  RegistrationInsert,
  RegistrationUpdate,
} from "../../models/types/registration.types";

// All registrations for one tournament (TD manager + bracket/spectator).
export const useRegistrations = (tournamentId?: number) => {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["registrations", tournamentId],
    queryFn: () => registrationService.getRegistrations(tournamentId!),
    enabled: !!tournamentId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["registrations", tournamentId] });

  const registerMutation = useMutation({
    mutationFn: (registration: RegistrationInsert) =>
      registrationService.register(registration),
    onSuccess: invalidate,
  });

  const addPlayerMutation = useMutation({
    mutationFn: (registration: RegistrationInsert) =>
      registrationService.addPlayer(registration),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: RegistrationUpdate }) =>
      registrationService.updateRegistration(id, updates),
    onSuccess: invalidate,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => registrationService.approve(id),
    onSuccess: invalidate,
  });

  const checkInMutation = useMutation({
    mutationFn: (id: number) => registrationService.checkIn(id),
    onSuccess: invalidate,
  });

  const markNoShowMutation = useMutation({
    mutationFn: (id: number) => registrationService.markNoShow(id),
    onSuccess: invalidate,
  });

  const cancelOwnMutation = useMutation({
    mutationFn: (id: number) => registrationService.cancelOwnRegistration(id),
    onSuccess: invalidate,
  });

  return {
    registrations: data || [],
    isLoading,
    error,
    refetch,
    register: registerMutation.mutateAsync,
    addPlayer: addPlayerMutation.mutateAsync,
    updateRegistration: updateMutation.mutateAsync,
    approve: approveMutation.mutateAsync,
    checkIn: checkInMutation.mutateAsync,
    markNoShow: markNoShowMutation.mutateAsync,
    cancelOwnRegistration: cancelOwnMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
};

// A single player's registrations across tournaments (profile "Registered").
export const usePlayerRegistrations = (playerId?: number) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["registrations", "player", playerId],
    queryFn: () => registrationService.getPlayerRegistrations(playerId!),
    enabled: !!playerId,
  });

  return {
    registrations: data || [],
    isLoading,
    error,
    refetch,
  };
};