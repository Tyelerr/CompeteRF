import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { VenueWithStats } from "../models/dashboard-types";
import { useAuthContext } from "../providers/AuthProvider";

interface UseMyVenuesReturn {
  // State
  loading: boolean;
  refreshing: boolean;
  venues: VenueWithStats[];

  // Actions
  onRefresh: () => void;
  onViewVenue: (venueId: number) => void;
}

export const useMyVenues = (): UseMyVenuesReturn => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venues, setVenues] = useState<VenueWithStats[]>([]);

  // Load venues when profile changes
  useEffect(() => {
    if (profile?.id_auto) {
      loadVenues();
    }
  }, [profile?.id_auto]);

  const loadVenues = async () => {
    if (!profile?.id_auto) return;

    try {
      const { data: venueDirectors, error } = await supabase
        .from("venue_directors")
        .select(
          `
          venue_id,
          venues (
            id,
            venue,
            address,
            city,
            state,
            zip_code
          )
        `,
        )
        .eq("director_id", profile.id_auto)
        .is("archived_at", null);

      if (error) {
        console.error("Error loading venues:", error);
        return;
      }

      if (!venueDirectors) {
        setVenues([]);
        return;
      }

      // Get stats for each venue
      const venuesWithStats: VenueWithStats[] = await Promise.all(
        venueDirectors.map(async (vd: any) => {
          const venue = vd.venues;

          // Count active tournaments at this venue
          const { count: tournamentCount } = await supabase
            .from("tournaments")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", venue.id)
            .eq("director_id", profile.id_auto)
            .eq("status", "active");

          // Count favorites for tournaments at this venue
          const { count: favoritesCount } = await supabase
            .from("favorites")
            .select("id, tournaments!inner(venue_id, director_id)", {
              count: "exact",
              head: true,
            })
            .eq("tournaments.venue_id", venue.id)
            .eq("tournaments.director_id", profile.id_auto);

          return {
            id: venue.id,
            venue: venue.venue,
            address: venue.address,
            city: venue.city,
            state: venue.state,
            zip_code: venue.zip_code,
            activeTournaments: tournamentCount || 0,
            totalFavorites: favoritesCount || 0,
          };
        }),
      );

      setVenues(venuesWithStats);
    } catch (error) {
      console.error("Error loading venues:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadVenues();
  }, [profile?.id_auto]);

  const onViewVenue = useCallback((venueId: number) => {
    // Navigation will be handled by the view
    // This is here for any pre-navigation logic if needed
    console.log("View venue:", venueId);
  }, []);

  return {
    // State
    loading,
    refreshing,
    venues,

    // Actions
    onRefresh,
    onViewVenue,
  };
};
