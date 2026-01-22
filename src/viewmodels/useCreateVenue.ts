import { useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";
import { TABLE_BRANDS, TABLE_SIZES } from "../utils/constants";

const GOOGLE_PLACES_API_KEY = "AIzaSyC8ih2uZXpyubGDgVGJ1D32NLRS9LSs0gw";

export interface VenueForm {
  venue: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface NewTable {
  table_size: string;
  brand: string;
  quantity: number;
}

export interface SelectedDirector {
  id_auto: number;
  name: string;
  email: string;
  role: string;
}

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export const useCreateVenue = () => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [venueSelected, setVenueSelected] = useState(false);

  // Form state
  const [form, setForm] = useState<VenueForm>({
    venue: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    phone: "",
    google_place_id: null,
    latitude: null,
    longitude: null,
  });

  // Tables state
  const [tables, setTables] = useState<NewTable[]>([]);
  const [newTable, setNewTable] = useState<NewTable>({
    table_size: "9ft",
    brand: "Diamond",
    quantity: 1,
  });

  // Directors state
  const [directors, setDirectors] = useState<SelectedDirector[]>([]);
  const [directorSearchQuery, setDirectorSearchQuery] = useState("");
  const [directorSearchResults, setDirectorSearchResults] = useState<
    SelectedDirector[]
  >([]);
  const [searchingDirectors, setSearchingDirectors] = useState(false);

  // Options
  const tableSizeOptions = TABLE_SIZES;
  const brandOptions = TABLE_BRANDS;

  // ==================== GOOGLE PLACES ====================

  const searchPlaces = async (query: string) => {
    setSearchQuery(query);

    if (query.length < 3) {
      setPredictions([]);
      return;
    }

    setSearching(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        query,
      )}&types=establishment&key=${GOOGLE_PLACES_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.predictions) {
        setPredictions(data.predictions);
      }
    } catch (error) {
      console.error("Error searching places:", error);
    } finally {
      setSearching(false);
    }
  };

  const selectPlace = async (placeId: string) => {
    setSearching(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,address_components,geometry,formatted_phone_number&key=${GOOGLE_PLACES_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.result) {
        const result = data.result;
        const components = result.address_components || [];

        // Parse address components
        let streetNumber = "";
        let route = "";
        let city = "";
        let state = "";
        let zipCode = "";

        components.forEach((component: any) => {
          const types = component.types;
          if (types.includes("street_number")) {
            streetNumber = component.long_name;
          } else if (types.includes("route")) {
            route = component.long_name;
          } else if (types.includes("locality")) {
            city = component.long_name;
          } else if (types.includes("administrative_area_level_1")) {
            state = component.short_name;
          } else if (types.includes("postal_code")) {
            zipCode = component.long_name;
          }
        });

        const address = streetNumber ? `${streetNumber} ${route}` : route;

        setForm({
          venue: result.name || "",
          address: address,
          city: city,
          state: state,
          zip_code: zipCode,
          phone: result.formatted_phone_number || "",
          google_place_id: placeId,
          latitude: result.geometry?.location?.lat || null,
          longitude: result.geometry?.location?.lng || null,
        });

        setVenueSelected(true);
        setPredictions([]);
        setSearchQuery("");
      }
    } catch (error) {
      console.error("Error getting place details:", error);
      Alert.alert("Error", "Failed to get venue details");
    } finally {
      setSearching(false);
    }
  };

  const clearSelection = () => {
    setVenueSelected(false);
    setForm({
      venue: "",
      address: "",
      city: "",
      state: "",
      zip_code: "",
      phone: "",
      google_place_id: null,
      latitude: null,
      longitude: null,
    });
  };

  // ==================== FORM ====================

  const updateForm = (field: keyof VenueForm, value: string) => {
    setForm({ ...form, [field]: value });
  };

  // ==================== TABLES ====================

  const updateNewTable = (field: keyof NewTable, value: string | number) => {
    setNewTable({ ...newTable, [field]: value });
  };

  const addTable = () => {
    if (!newTable.table_size) {
      Alert.alert("Error", "Please select a table size");
      return;
    }

    setTables([...tables, { ...newTable }]);
    setNewTable({
      table_size: "9ft",
      brand: "Diamond",
      quantity: 1,
    });
  };

  const removeTable = (index: number) => {
    setTables(tables.filter((_, i) => i !== index));
  };

  // ==================== DIRECTORS ====================

  const searchDirectors = async (query: string) => {
    setDirectorSearchQuery(query);

    if (query.length < 2) {
      setDirectorSearchResults([]);
      return;
    }

    setSearchingDirectors(true);
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

      // Filter out already added directors
      const addedIds = directors.map((d) => d.id_auto);
      const filtered = (data || []).filter(
        (p) => !addedIds.includes(p.id_auto),
      );

      setDirectorSearchResults(filtered);
    } catch (error) {
      console.error("Error searching directors:", error);
    } finally {
      setSearchingDirectors(false);
    }
  };

  const confirmAddDirector = (director: SelectedDirector) => {
    const isBasicUser = director.role === "basic_user";
    const roleMessage = isBasicUser
      ? "\n\nThis user is currently a basic user and will be upgraded to Tournament Director."
      : "";

    Alert.alert(
      "Add Director",
      `Are you sure you want to add ${director.name} (${director.email}) as a director for this venue?${roleMessage}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add Director",
          onPress: () => addDirector(director),
        },
      ],
    );
  };

  const addDirector = (director: SelectedDirector) => {
    setDirectors([...directors, director]);
    setDirectorSearchQuery("");
    setDirectorSearchResults([]);
  };

  const removeDirector = (id: number) => {
    setDirectors(directors.filter((d) => d.id_auto !== id));
  };

  // ==================== CREATE VENUE ====================

  const createVenue = async (): Promise<boolean> => {
    // Validation
    if (!form.venue.trim()) {
      Alert.alert("Error", "Please enter a venue name");
      return false;
    }
    if (!form.address.trim()) {
      Alert.alert("Error", "Please enter an address");
      return false;
    }
    if (!form.city.trim()) {
      Alert.alert("Error", "Please enter a city");
      return false;
    }
    if (!form.state.trim()) {
      Alert.alert("Error", "Please enter a state");
      return false;
    }
    if (!form.zip_code.trim()) {
      Alert.alert("Error", "Please enter a ZIP code");
      return false;
    }

    setLoading(true);
    try {
      // 1. Insert venue
      const { data: venueData, error: venueError } = await supabase
        .from("venues")
        .insert({
          venue: form.venue,
          address: form.address,
          city: form.city,
          state: form.state,
          zip_code: form.zip_code,
          phone: form.phone || null,
          google_place_id: form.google_place_id,
          latitude: form.latitude,
          longitude: form.longitude,
          status: "active",
        })
        .select()
        .single();

      if (venueError) {
        console.error("Error creating venue:", venueError);
        Alert.alert("Error", "Failed to create venue");
        return false;
      }

      const venueId = venueData.id;

      // 2. Insert venue_owner
      const { error: ownerError } = await supabase.from("venue_owners").insert({
        venue_id: venueId,
        owner_id: profile!.id_auto,
        assigned_by: profile!.id_auto,
      });

      if (ownerError) {
        console.error("Error adding venue owner:", ownerError);
        // Don't fail completely, venue was created
      }

      // 3. Insert venue_tables
      if (tables.length > 0) {
        const tableInserts = tables.map((t) => ({
          venue_id: venueId,
          table_size: t.table_size,
          brand: t.brand,
          quantity: t.quantity,
        }));

        const { error: tablesError } = await supabase
          .from("venue_tables")
          .insert(tableInserts);

        if (tablesError) {
          console.error("Error adding tables:", tablesError);
          // Don't fail completely
        }
      }

      // 4. Insert venue_directors and upgrade basic_users
      if (directors.length > 0) {
        // First, upgrade any basic_users to tournament_director
        const basicUsers = directors.filter((d) => d.role === "basic_user");
        if (basicUsers.length > 0) {
          const basicUserIds = basicUsers.map((d) => d.id_auto);
          const { error: upgradeError } = await supabase
            .from("profiles")
            .update({ role: "tournament_director" })
            .in("id_auto", basicUserIds);

          if (upgradeError) {
            console.error("Error upgrading users:", upgradeError);
            // Don't fail completely
          }
        }

        // Then insert venue_directors
        const directorInserts = directors.map((d) => ({
          venue_id: venueId,
          director_id: d.id_auto,
          assigned_by: profile!.id_auto,
        }));

        const { error: directorsError } = await supabase
          .from("venue_directors")
          .insert(directorInserts);

        if (directorsError) {
          console.error("Error adding directors:", directorsError);
          // Don't fail completely
        }
      }

      Alert.alert("Success", "Venue created successfully!");
      return true;
    } catch (error) {
      console.error("Error creating venue:", error);
      Alert.alert("Error", "Failed to create venue");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    // State
    loading,
    searching,
    searchQuery,
    predictions,
    venueSelected,
    setVenueSelected,
    form,
    tables,
    newTable,
    directors,
    directorSearchQuery,
    directorSearchResults,
    searchingDirectors,

    // Options
    tableSizeOptions,
    brandOptions,

    // Actions - Places
    searchPlaces,
    selectPlace,
    clearSelection,

    // Actions - Form
    updateForm,

    // Actions - Tables
    updateNewTable,
    addTable,
    removeTable,

    // Actions - Directors
    searchDirectors,
    confirmAddDirector,
    removeDirector,

    // Actions - Create
    createVenue,
  };
};
