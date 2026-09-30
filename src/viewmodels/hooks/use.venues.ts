import { useQuery } from "@tanstack/react-query";
import { useVenueScope } from "./use.venue.scope";
import { venueService } from "../../models/services/venue.service";

export const useVenues = (state?: string, city?: string) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["venues", state, city],
    queryFn: () => venueService.getVenues(state, city),
  });

  return {
    venues: data || [],
    isLoading,
    error,
    refetch,
  };
};

export const useVenue = (id?: number) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["venue", id],
    queryFn: () => venueService.getVenue(id!),
    enabled: !!id,
  });

  return {
    venue: data,
    isLoading,
    error,
  };
};

export const useCitiesByState = (state?: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["cities", state],
    queryFn: () => venueService.getCitiesByState(state!),
    enabled: !!state,
  });

  return {
    cities: data || [],
    isLoading,
  };
};

// Venues the current user may administer (shared scope, src/utils/venue-scope.ts): every active
// venue for an admin (by role), otherwise only the venues they own or direct.
export const useVenuesInScope = () => {
  const { scope, isAdmin } = useVenueScope();
  const scopeKey = scope.kind === "all" ? "all" : scope.ids.join(",");
  const { data, isLoading, error } = useQuery({
    queryKey: ["venues", "scope", scopeKey],
    queryFn: () => venueService.getVenuesInScope(scope),
  });
  return { venues: data || [], isLoading, error, isAdmin };
};

export const useVenuesByOwner = (ownerId?: number) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["venues", "owner", ownerId],
    queryFn: () => venueService.getVenuesByOwner(ownerId!),
    enabled: !!ownerId,
  });

  return {
    venues: data || [],
    isLoading,
    error,
  };
};

export const useVenuesByDirector = (directorId?: number) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["venues", "director", directorId],
    queryFn: () => venueService.getVenuesByDirector(directorId!),
    enabled: !!directorId,
  });

  return {
    venues: data || [],
    isLoading,
    error,
  };
};
