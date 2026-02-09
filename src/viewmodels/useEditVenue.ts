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

// Roles that CANNOT be added as directors
const PROTECTED_ROLES = ["super_admin", "compete_admin", "bar_owner"];

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
        .select("id_auto, name, email, user_name, role")
        .or(
          `name.ilike.%${query}%,email.ilike.%${query}%,user_name.ilike.%${query}%`,
        )
        .eq("status", "active")
        .limit(20);

      if (error) {
        console.error("Error searching directors:", error);
        return;
      }

      // Filter out already assigned directors and self
      const assignedIds = directors.map((d) => d.director_id);
      const filtered = (data || []).filter(
        (p) =>
          !assignedIds.includes(p.id_auto) &&
          p.id_auto !== profile?.id_auto,
      );

      setSearchResults(filtered);
    } catch (error) {
      console.error("Error searching directors:", error);
    } finally {
      setSearching(false);
    }
  };

  const addDirector = async (directorId: number) => {
    // Find the user in search results to check their role
    const user = searchResults.find((r) => r.id_auto === directorId);
    if (!user) return;

    // Block protected roles
    if (PROTECTED_ROLES.includes(user.role)) {
      Alert.alert(
        "Cannot Add",
        `${user.name} has an elevated account role and cannot be added as a venue director.`,
      );
      return;
    }

    // Confirm promotion for basic_user
    if (user.role === "basic_user") {
      Alert.alert(
        "Promote & Add Director?",
        `${user.name} will be promoted to Tournament Director and assigned to this venue.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Promote & Add",
            onPress: () => executeAddDirector(user),
          },
        ],
      );
    } else {
      // Already a tournament_director, just add
      await executeAddDirector(user);
    }
  };

  const executeAddDirector = async (user: any) => {
    try {
      // Promote basic_user → tournament_director
      if (user.role === "basic_user") {
        const { data: updatedProfile, error: roleError } = await supabase
          .from("profiles")
          .update({ role: "tournament_director" })
          .eq("id_auto", user.id_auto)
          .select("id_auto, role")
          .single();

        if (roleError) {
          console.error("Failed to update user role:", roleError);
          Alert.alert("Error", `Failed to promote user: ${roleError.message}`);
          return;
        }

        if (!updatedProfile) {
          console.error("Role update returned null — likely RLS block");
          Alert.alert(
            "Permission Error",
            "The database blocked the role update. Please ensure the RLS policy has been applied.",
          );
          return;
        }

        if (updatedProfile.role !== "tournament_director") {
          console.error("Role did not change:", updatedProfile.role);
          Alert.alert("Error", "Role update did not take effect.");
          return;
        }
      }

      // Check if an archived record exists (previously removed)
      const { data: archivedRecord } = await supabase
        .from("venue_directors")
        .select("id")
        .eq("venue_id", venueId)
        .eq("director_id", user.id_auto)
        .not("archived_at", "is", null)
        .single();

      if (archivedRecord) {
        // Reactivate the archived record
        const { error: reactivateError } = await supabase
          .from("venue_directors")
          .update({
            archived_at: null,
            archived_by: null,
            assigned_by: profile?.id_auto,
            assigned_at: new Date().toISOString(),
          })
          .eq("id", archivedRecord.id);

        if (reactivateError) {
          Alert.alert("Error", "Failed to add director");
          console.error("Error reactivating director:", reactivateError);
          return;
        }
      } else {
        // Insert new record
        const { error } = await supabase.from("venue_directors").insert({
          venue_id: venueId,
          director_id: user.id_auto,
          assigned_by: profile?.id_auto,
          assigned_at: new Date().toISOString(),
        });

        if (error) {
          Alert.alert("Error", "Failed to add director");
          console.error("Error adding director:", error);
          return;
        }
      }

      const msg =
        user.role === "basic_user"
          ? `${user.name} has been promoted to Tournament Director and assigned to the venue!`
          : `${user.name} has been assigned as a director!`;

      Alert.alert("Success", msg);

      // Reload directors and clear search
      await loadDirectors();
      setSearchQuery("");
      setSearchResults([]);
    } catch (error) {
      console.error("Error adding director:", error);
      Alert.alert("Error", "Failed to add director");
    }
  };

  const removeDirector = async (venueDirectorId: number) => {
    // Find the director to get their name and ID
    const director = directors.find((d) => d.id === venueDirectorId);
    const directorName = director?.profile?.name || "this director";

    Alert.alert(
      `Remove ${directorName}?`,
      `Are you sure you want to remove ${directorName} from this venue?`,
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

              // Update local state
              setDirectors(
                directors.filter((d) => d.id !== venueDirectorId),
              );

              // Downgrade to basic_user if no remaining venues
              if (director) {
                await checkAndDowngradeIfNeeded(director.director_id);
              }

              Alert.alert("Success", `${directorName} removed from venue`);
            } catch (error) {
              console.error("Error removing director:", error);
              Alert.alert("Error", "Failed to remove director");
            }
          },
        },
      ],
    );
  };

  // FIX: Downgrade role if director has no remaining venue assignments
  const checkAndDowngradeIfNeeded = async (directorId: number) => {
    try {
      const { count } = await supabase
        .from("venue_directors")
        .select("id", { count: "exact", head: true })
        .eq("director_id", directorId)
        .is("archived_at", null);

      if (count === 0) {
        const { data, error } = await supabase
          .from("profiles")
          .update({ role: "basic_user" })
          .eq("id_auto", directorId)
          .select("id_auto, role")
          .single();

        if (error) {
          console.error("Error downgrading user role:", error);
          return;
        }

        if (!data) {
          console.error("Role downgrade returned null — likely RLS block");
          return;
        }

        console.log(
          `Director ${directorId} downgraded to basic_user (no remaining venues)`,
        );
      }
    } catch (error) {
      console.error("Error in checkAndDowngradeIfNeeded:", error);
    }
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
