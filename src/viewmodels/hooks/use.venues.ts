import { useQuery } from "@tanstack/react-query";
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
