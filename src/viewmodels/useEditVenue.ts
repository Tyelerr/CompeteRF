import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export interface VenueDetails {
  id: number;
  venue: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string | null;
  status: string;
}

export interface Director {
  id: number;
  director_id: number;
  profile: {
    id_auto: number;
    name: string;
    email: string;
  };
}

export const useEditVenue = (venueId: number) => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Venue details
  const [venue, setVenue] = useState<VenueDetails | null>(null);
  const [editedVenue, setEditedVenue] = useState<VenueDetails | null>(null);

  // Directors
  const [directors, setDirectors] = useState<Director[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (venueId) {
      loadVenueData();
    }
  }, [venueId]);

  const loadVenueData = async () => {
    try {
      await Promise.all([loadVenueDetails(), loadDirectors()]);
    } catch (error) {
      console.error("Error loading venue data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadVenueDetails = async () => {
    const { data, error } = await supabase
      .from("venues")
      .select("id, venue, address, city, state, zip_code, phone, status")
      .eq("id", venueId)
      .single();

    if (error) {
      console.error("Error loading venue:", error);
      Alert.alert("Error", "Failed to load venue details");
      return;
    }

    setVenue(data);
    setEditedVenue(data);
  };

  const loadDirectors = async () => {
    const { data, error } = await supabase
      .from("venue_directors")
      .select(
        `
        id,
        director_id,
        profiles:director_id (
          id_auto,
          name,
          email
        )
      `,
      )
      .eq("venue_id", venueId)
      .is("archived_at", null);

    if (error) {
      console.error("Error loading directors:", error);
      return;
    }

    const formattedDirectors = (data || []).map((d: any) => ({
      id: d.id,
      director_id: d.director_id,
      profile: d.profiles,
    }));

    setDirectors(formattedDirectors);
  };

  const saveDetails = async () => {
    if (!editedVenue) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("venues")
        .update({
          venue: editedVenue.venue,
          address: editedVenue.address,
          city: editedVenue.city,
          state: editedVenue.state,
          zip_code: editedVenue.zip_code,
          phone: editedVenue.phone,
        })
        .eq("id", venueId);

      if (error) {
        Alert.alert("Error", "Failed to save changes");
        console.error("Error saving venue:", error);
        return;
      }

      setVenue(editedVenue);
      Alert.alert("Success", "Venue updated successfully");
    } catch (error) {
      console.error("Error saving venue:", error);
      Alert.alert("Error", "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const searchDirectors = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_auto, name, email, role")
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .eq("status", "active")
        .limit(10);

      if (error) {
        console.error("Error searching directors:", error);
        return;
      }

      // Filter out already assigned directors
      const assignedIds = directors.map((d) => d.director_id);
      const filtered = (data || []).filter(
        (p) => !assignedIds.includes(p.id_auto),
      );

      setSearchResults(filtered);
    } catch (error) {
      console.error("Error searching directors:", error);
    } finally {
      setSearching(false);
    }
  };

  const addDirector = async (directorId: number) => {
    try {
      const { error } = await supabase.from("venue_directors").insert({
        venue_id: venueId,
        director_id: directorId,
        assigned_by: profile?.id_auto,
      });

      if (error) {
        Alert.alert("Error", "Failed to add director");
        console.error("Error adding director:", error);
        return;
      }

      // Reload directors
      await loadDirectors();
      setSearchQuery("");
      setSearchResults([]);
    } catch (error) {
      console.error("Error adding director:", error);
      Alert.alert("Error", "Failed to add director");
    }
  };

  const removeDirector = async (venueDirectorId: number) => {
    Alert.alert(
      "Remove Director",
      "Are you sure you want to remove this director from the venue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("venue_directors")
                .update({
                  archived_at: new Date().toISOString(),
                  archived_by: profile?.id_auto,
                })
                .eq("id", venueDirectorId);

              if (error) {
                Alert.alert("Error", "Failed to remove director");
                console.error("Error removing director:", error);
                return;
              }

              setDirectors(directors.filter((d) => d.id !== venueDirectorId));
            } catch (error) {
              console.error("Error removing director:", error);
              Alert.alert("Error", "Failed to remove director");
            }
          },
        },
      ],
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadVenueData();
  };

  return {
    // State
    loading,
    saving,
    refreshing,
    venue,
    editedVenue,
    directors,
    searchQuery,
    searchResults,
    searching,

    // Actions
    setEditedVenue,
    saveDetails,
    searchDirectors,
    addDirector,
    removeDirector,
    onRefresh,
    loadVenueData,
  };
};
