import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { roleService } from "../models/services/role.service";
import { venueService } from "../models/services/venue.service";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [directors, setDirectors] = useState<Director[]>([]);


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
      const update: Record<string, unknown> = {
        venue: editedVenue.venue,
        address: editedVenue.address,
        city: editedVenue.city,
        state: editedVenue.state,
        zip_code: editedVenue.zip_code,
        phone: editedVenue.phone,
      };

      // If the address/location fields changed, re-geocode so latitude/longitude/
      // google_place_id stay in sync (otherwise Near Me / distance goes stale). Reuse
      // the existing google-places geocoder. On failure we DO NOT null out existing
      // coordinates — we save the text and warn the owner. Isolated from tournaments.
      const locationChanged =
        !!venue &&
        (venue.address !== editedVenue.address ||
          venue.city !== editedVenue.city ||
          venue.state !== editedVenue.state ||
          venue.zip_code !== editedVenue.zip_code);
      let geocodeFailed = false;
      if (locationChanged) {
        const geo = await venueService.geocodeAddress({
          address: editedVenue.address,
          city: editedVenue.city,
          state: editedVenue.state,
          zip: editedVenue.zip_code,
        });
        if (geo) {
          update.latitude = geo.latitude;
          update.longitude = geo.longitude;
          update.google_place_id = geo.google_place_id;
        } else {
          geocodeFailed = true; // keep prior coords; surface below
        }
      }

      const { error } = await supabase
        .from("venues")
        .update(update)
        .eq("id", venueId);

      if (error) {
        Alert.alert("Error", "Failed to save changes");
        console.error("Error saving venue:", error);
        return;
      }

      setVenue(editedVenue);
      if (geocodeFailed) {
        Alert.alert(
          "Saved — location not updated",
          "Your changes were saved, but we couldn't update the map location for the new address. Distance / Near Me may still use the previous location. Try again later or re-enter the address.",
        );
      } else {
        Alert.alert("Success", "Venue updated successfully");
      }
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

      // The user now directs this venue — re-derive their role server-side
      // (basic_user → tournament_director; owners/admins keep theirs).
      await roleService.recomputeUserRole(user.id_auto);

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

  // Recompute the user's role from all relationships (ownership + directorship +
  // active tournaments), so it never wrongly demotes someone with other ties.
  const checkAndDowngradeIfNeeded = async (directorId: number) => {
    await roleService.recomputeUserRole(directorId);
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
