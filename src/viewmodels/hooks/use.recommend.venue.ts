// src/viewmodels/hooks/use.recommend.venue.ts
// ═══════════════════════════════════════════════════════════
// Recommend a Venue Hook
// Reuses same Google Places pattern as useCreateVenue
// ViewModel layer: React hooks + service calls. No JSX.
// ═══════════════════════════════════════════════════════════

import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { barRequestService } from "../../models/services/bar-request.service";
import { useAuthContext } from "../../providers/AuthProvider";

const GOOGLE_PLACES_API_KEY = "AIzaSyC8ih2uZXpyubGDgVGJ1D32NLRS9LSs0gw";

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface VenueInfo {
  venue_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY_VENUE: VenueInfo = {
  venue_name: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  phone: "",
  google_place_id: null,
  latitude: null,
  longitude: null,
};

export interface UseRecommendVenueReturn {
  // Modal
  visible: boolean;
  open: () => void;
  close: () => void;

  // Google Places search
  searchQuery: string;
  searching: boolean;
  predictions: PlacePrediction[];
  searchPlaces: (query: string) => void;
  selectPlace: (placeId: string) => void;

  // Selected venue
  venue: VenueInfo;
  venueSelected: boolean;
  clearSelection: () => void;

  // Notes
  notes: string;
  setNotes: (notes: string) => void;

  // Submit
  submitting: boolean;
  submitted: boolean;
  handleSubmit: () => Promise<void>;

  // Reset everything
  reset: () => void;
}

export function useRecommendVenue(): UseRecommendVenueReturn {
  const { user } = useAuthContext();

  const [visible, setVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [venue, setVenue] = useState<VenueInfo>(EMPTY_VENUE);
  const [venueSelected, setVenueSelected] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // —— Google Places ——

  const searchPlaces = useCallback(async (query: string) => {
    setSearchQuery(query);

    if (query.length < 3) {
      setPredictions([]);
      return;
    }

    setSearching(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&key=${GOOGLE_PLACES_API_KEY}`;
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
  }, []);

  const selectPlace = useCallback(async (placeId: string) => {
    setSearching(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,address_components,geometry,formatted_phone_number&key=${GOOGLE_PLACES_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.result) {
        const result = data.result;
        const components = result.address_components || [];

        let streetNumber = "";
        let route = "";
        let city = "";
        let state = "";
        let zipCode = "";

        components.forEach((component: any) => {
          const types = component.types;
          if (types.includes("street_number")) streetNumber = component.long_name;
          else if (types.includes("route")) route = component.long_name;
          else if (types.includes("locality")) city = component.long_name;
          else if (types.includes("administrative_area_level_1")) state = component.short_name;
          else if (types.includes("postal_code")) zipCode = component.long_name;
        });

        const address = streetNumber ? `${streetNumber} ${route}` : route;

        setVenue({
          venue_name: result.name || "",
          address,
          city,
          state,
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
  }, []);

  const clearSelection = useCallback(() => {
    setVenueSelected(false);
    setVenue(EMPTY_VENUE);
  }, []);

  // —— Modal ——

  const open = useCallback(() => {
    setSubmitted(false);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    // Don't reset if submitted — keep the success state
  }, []);

  const reset = useCallback(() => {
    setVisible(false);
    setSearchQuery("");
    setPredictions([]);
    setVenue(EMPTY_VENUE);
    setVenueSelected(false);
    setNotes("");
    setSubmitting(false);
    setSubmitted(false);
  }, []);

  // —— Submit ——

  const handleSubmit = useCallback(async () => {
    if (!user?.id) {
      Alert.alert("Login Required", "Please log in to recommend a venue.");
      return;
    }

    if (!venue.venue_name.trim()) {
      Alert.alert("Error", "Please search for and select a venue.");
      return;
    }

    setSubmitting(true);
    try {
      await barRequestService.create({
        venue_name: venue.venue_name,
        address: venue.address || undefined,
        city: venue.city || undefined,
        state: venue.state || undefined,
        zip_code: venue.zip_code || undefined,
        phone: venue.phone || undefined,
        google_place_id: venue.google_place_id,
        latitude: venue.latitude,
        longitude: venue.longitude,
        submitted_by: user.id,
        submitter_notes: notes.trim() || undefined,
      });

      setSubmitted(true);
      Alert.alert(
        "Thanks!",
        "Your venue recommendation has been submitted. We'll check it out!",
        [{ text: "OK", onPress: () => reset() }],
      );
    } catch (error) {
      console.error("Error submitting bar request:", error);
      Alert.alert("Error", "Failed to submit recommendation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [user, venue, notes, reset]);

  return {
    visible,
    open,
    close,
    searchQuery,
    searching,
    predictions,
    searchPlaces,
    selectPlace,
    venue,
    venueSelected,
    clearSelection,
    notes,
    setNotes,
    submitting,
    submitted,
    handleSubmit,
    reset,
  };
}
