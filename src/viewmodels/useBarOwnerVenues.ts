import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export interface BarOwnerVenueWithStats {
  id: number;
  venue: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone?: string;
  photo_url?: string;
  status: string;
  activeTournaments: number;
  totalDirectors: number;
  totalViews: number;
}

export const useBarOwnerVenues = () => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venues, setVenues] = useState<BarOwnerVenueWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (profile?.id_auto) {
      loadVenues();
    }
  }, [profile?.id_auto]);

  const loadVenues = async () => {
    if (!profile?.id_auto) return;

    try {
      // Get venues where user is an owner
      const { data: venueOwners, error } = await supabase
        .from("venue_owners")
        .select(
          `
          venue_id,
          venues (
            id,
            venue,
            address,
            city,
            state,
            zip_code,
            phone,
            photo_url,
            status
          )
        `,
        )
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      if (error) {
        console.error("Error loading venues:", error);
        setVenues([]);
        return;
      }

      if (!venueOwners || venueOwners.length === 0) {
        setVenues([]);
        return;
      }

      // Get stats for each venue
      const venuesWithStats: BarOwnerVenueWithStats[] = await Promise.all(
        venueOwners.map(async (vo: any) => {
          const venue = vo.venues;

          // Count active tournaments at this venue
          const { count: tournamentCount } = await supabase
            .from("tournaments")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", venue.id)
            .eq("status", "active")
            .gte("tournament_date", new Date().toISOString().split("T")[0]);

          // Count directors assigned to this venue
          const { count: directorCount } = await supabase
            .from("venue_directors")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", venue.id)
            .is("archived_at", null);

          // Count total views for tournaments at this venue
          const { count: viewsCount } = await supabase
            .from("tournament_analytics")
            .select("id, tournaments!inner(venue_id)", {
              count: "exact",
              head: true,
            })
            .eq("tournaments.venue_id", venue.id)
            .eq("event_type", "view");

          return {
            id: venue.id,
            venue: venue.venue,
            address: venue.address,
            city: venue.city,
            state: venue.state,
            zip_code: venue.zip_code,
            phone: venue.phone,
            photo_url: venue.photo_url,
            status: venue.status || "active",
            activeTournaments: tournamentCount || 0,
            totalDirectors: directorCount || 0,
            totalViews: viewsCount || 0,
          };
        }),
      );

      setVenues(venuesWithStats);
    } catch (error) {
      console.error("Error loading bar owner venues:", error);
      setVenues([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadVenues();
  };

  // Filter venues by search query
  const filteredVenues = venues.filter((venue) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      venue.venue.toLowerCase().includes(query) ||
      venue.city.toLowerCase().includes(query) ||
      venue.address.toLowerCase().includes(query)
    );
  });

  return {
    // State
    loading,
    refreshing,
    venues: filteredVenues,
    searchQuery,

    // Actions
    onRefresh,
    setSearchQuery,
  };
};
