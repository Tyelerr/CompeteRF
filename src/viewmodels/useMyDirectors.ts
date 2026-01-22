import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export interface DirectorWithVenue {
  id: number;
  director_id: number;
  venue_id: number;
  name: string;
  email: string;
  venue_name: string;
  assigned_at: string;
  tournament_count: number;
}

export const useMyDirectors = () => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [directors, setDirectors] = useState<DirectorWithVenue[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [venueIds, setVenueIds] = useState<number[]>([]);

  useEffect(() => {
    if (profile?.id_auto) {
      loadDirectors();
    }
  }, [profile?.id_auto]);

  const loadDirectors = async () => {
    if (!profile?.id_auto) return;

    try {
      // First get all venues owned by this bar owner
      const { data: venueOwners, error: venueError } = await supabase
        .from("venue_owners")
        .select("venue_id")
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      if (venueError) {
        console.error("Error loading venues:", venueError);
        setDirectors([]);
        return;
      }

      const ids = venueOwners?.map((vo) => vo.venue_id) || [];
      setVenueIds(ids);

      if (ids.length === 0) {
        setDirectors([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Get all directors for those venues
      const { data: venueDirectors, error: directorsError } = await supabase
        .from("venue_directors")
        .select(
          `
          id,
          director_id,
          venue_id,
          assigned_at,
          profiles:director_id (
            id_auto,
            name,
            email
          ),
          venues:venue_id (
            id,
            venue
          )
        `,
        )
        .in("venue_id", ids)
        .is("archived_at", null);

      if (directorsError) {
        console.error("Error loading directors:", directorsError);
        setDirectors([]);
        return;
      }

      // Get tournament counts for each director at each venue
      const formattedDirectors: DirectorWithVenue[] = await Promise.all(
        (venueDirectors || []).map(async (vd: any) => {
          // Count tournaments this director has run at this venue
          const { count } = await supabase
            .from("tournaments")
            .select("id", { count: "exact", head: true })
            .eq("director_id", vd.director_id)
            .eq("venue_id", vd.venue_id);

          return {
            id: vd.id,
            director_id: vd.director_id,
            venue_id: vd.venue_id,
            name: vd.profiles?.name || "Unknown",
            email: vd.profiles?.email || "",
            venue_name: vd.venues?.venue || "Unknown Venue",
            assigned_at: vd.assigned_at || new Date().toISOString(),
            tournament_count: count || 0,
          };
        }),
      );

      setDirectors(formattedDirectors);
    } catch (error) {
      console.error("Error loading directors:", error);
      setDirectors([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const confirmRemoveDirector = (director: DirectorWithVenue) => {
    Alert.alert(
      `Remove ${director.name}?`,
      `Remove from ${director.venue_name} only, or remove from all your venues?`,
      [
        {
          text: "All Venues",
          style: "destructive",
          onPress: () => removeFromAllVenues(director),
        },
        {
          text: "This Venue",
          style: "destructive",
          onPress: () => removeFromVenue(director),
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const removeFromVenue = async (director: DirectorWithVenue) => {
    try {
      // Archive this venue_director record
      const { error } = await supabase
        .from("venue_directors")
        .update({
          archived_at: new Date().toISOString(),
          archived_by: profile?.id_auto,
        })
        .eq("id", director.id);

      if (error) {
        console.error("Error removing director:", error);
        Alert.alert("Error", "Failed to remove director");
        return;
      }

      // Check if director has any remaining assignments
      await checkAndDowngradeIfNeeded(director.director_id);

      // Update local state
      setDirectors(directors.filter((d) => d.id !== director.id));
      Alert.alert(
        "Success",
        `${director.name} removed from ${director.venue_name}`,
      );
    } catch (error) {
      console.error("Error removing director:", error);
      Alert.alert("Error", "Failed to remove director");
    }
  };

  const removeFromAllVenues = async (director: DirectorWithVenue) => {
    try {
      // Archive all venue_director records for this director at owner's venues
      const { error } = await supabase
        .from("venue_directors")
        .update({
          archived_at: new Date().toISOString(),
          archived_by: profile?.id_auto,
        })
        .eq("director_id", director.director_id)
        .in("venue_id", venueIds);

      if (error) {
        console.error("Error removing director:", error);
        Alert.alert("Error", "Failed to remove director");
        return;
      }

      // Check if director has any remaining assignments
      await checkAndDowngradeIfNeeded(director.director_id);

      // Update local state - remove all entries for this director
      setDirectors(
        directors.filter((d) => d.director_id !== director.director_id),
      );
      Alert.alert("Success", `${director.name} removed from all venues`);
    } catch (error) {
      console.error("Error removing director:", error);
      Alert.alert("Error", "Failed to remove director");
    }
  };

  const checkAndDowngradeIfNeeded = async (directorId: number) => {
    // Check if director has any remaining active venue assignments
    const { count } = await supabase
      .from("venue_directors")
      .select("id", { count: "exact", head: true })
      .eq("director_id", directorId)
      .is("archived_at", null);

    // If no remaining assignments, downgrade to basic_user
    if (count === 0) {
      const { error } = await supabase
        .from("profiles")
        .update({ role: "basic_user" })
        .eq("id_auto", directorId);

      if (error) {
        console.error("Error downgrading user:", error);
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDirectors();
  };

  // Filter directors by search query
  const filteredDirectors = directors.filter((director) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      director.name.toLowerCase().includes(query) ||
      director.email.toLowerCase().includes(query) ||
      director.venue_name.toLowerCase().includes(query) ||
      director.director_id.toString().includes(query)
    );
  });

  // Group directors by venue
  const directorsByVenue = filteredDirectors.reduce(
    (acc, director) => {
      if (!acc[director.venue_name]) {
        acc[director.venue_name] = [];
      }
      acc[director.venue_name].push(director);
      return acc;
    },
    {} as Record<string, DirectorWithVenue[]>,
  );

  return {
    // State
    loading,
    refreshing,
    directors: filteredDirectors,
    directorsByVenue,
    searchQuery,

    // Actions
    onRefresh,
    setSearchQuery,
    confirmRemoveDirector,
  };
};
