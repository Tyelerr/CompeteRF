import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import { barRequestService } from "../../models/services/bar-request.service";
import { useAuthContext } from "../../providers/AuthProvider";

const GOOGLE_PLACES_API_KEY = "AIzaSyC8ih2uZXpyubGDgVGJ1D32NLRS9LSs0gw";
const isWeb = Platform.OS === "web";

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
  venue_name: "", address: "", city: "", state: "",
  zip_code: "", phone: "", google_place_id: null, latitude: null, longitude: null,
};

export interface UseRecommendVenueReturn {
  visible: boolean;
  open: () => void;
  close: () => void;
  searchQuery: string;
  searching: boolean;
  predictions: PlacePrediction[];
  searchPlaces: (query: string) => void;
  selectPlace: (placeId: string) => void;
  venue: VenueInfo;
  venueSelected: boolean;
  clearSelection: () => void;
  notes: string;
  setNotes: (notes: string) => void;
  submitting: boolean;
  submitted: boolean;
  handleSubmit: () => Promise<void>;
  reset: () => void;
}

// ── Load Google Maps JS SDK once on web ──────────────────────────────────
let googleMapsLoaded = false;
let googleMapsLoading = false;
const googleMapsCallbacks: (() => void)[] = [];

function loadGoogleMapsSDK(): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded) return resolve();
    googleMapsCallbacks.push(resolve);
    if (googleMapsLoading) return;
    googleMapsLoading = true;

    (window as any).__googleMapsCallback = () => {
      googleMapsLoaded = true;
      googleMapsCallbacks.forEach((cb) => cb());
      googleMapsCallbacks.length = 0;
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places&callback=__googleMapsCallback`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

// ── Web: search via JS SDK (no CORS) ────────────────────────────────────
async function webSearchPlaces(query: string): Promise<PlacePrediction[]> {
  await loadGoogleMapsSDK();
  const svc = new (window as any).google.maps.places.AutocompleteService();
  return new Promise((resolve) => {
    svc.getPlacePredictions(
      { input: query, types: ["establishment"] },
      (predictions: any[], status: string) => {
        if (status !== "OK" || !predictions) return resolve([]);
        resolve(
          predictions.map((p) => ({
            place_id: p.place_id,
            description: p.description,
            structured_formatting: {
              main_text: p.structured_formatting?.main_text ?? p.description,
              secondary_text: p.structured_formatting?.secondary_text ?? "",
            },
          }))
        );
      }
    );
  });
}

async function webGetPlaceDetails(placeId: string): Promise<any> {
  await loadGoogleMapsSDK();
  const google = (window as any).google;
  const svc = new google.maps.places.PlacesService(document.createElement("div"));
  return new Promise((resolve, reject) => {
    svc.getDetails(
      { placeId, fields: ["name", "formatted_address", "address_components", "geometry", "formatted_phone_number"] },
      (result: any, status: string) => {
        if (status !== "OK" || !result) return reject(new Error(status));
        resolve(result);
      }
    );
  });
}

// ── Native: search via REST API ──────────────────────────────────────────
async function nativeSearchPlaces(query: string): Promise<PlacePrediction[]> {
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&key=${GOOGLE_PLACES_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.predictions ?? [];
}

async function nativeGetPlaceDetails(placeId: string): Promise<any> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,address_components,geometry,formatted_phone_number&key=${GOOGLE_PLACES_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.result;
}

// ── Hook ─────────────────────────────────────────────────────────────────
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

  // Preload SDK when modal opens on web
  useEffect(() => {
    if (isWeb && visible) loadGoogleMapsSDK();
  }, [visible]);

  const searchPlaces = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 3) { setPredictions([]); return; }
    setSearching(true);
    try {
      const results = isWeb
        ? await webSearchPlaces(query)
        : await nativeSearchPlaces(query);
      setPredictions(results);
    } catch (error) {
      console.error("Error searching places:", error);
    } finally {
      setSearching(false);
    }
  }, []);

  const selectPlace = useCallback(async (placeId: string) => {
    setSearching(true);
    try {
      const result = isWeb
        ? await webGetPlaceDetails(placeId)
        : await nativeGetPlaceDetails(placeId);

      if (result) {
        const components = result.address_components || [];
        let streetNumber = "", route = "", city = "", state = "", zipCode = "";
        components.forEach((c: any) => {
          if (c.types.includes("street_number")) streetNumber = c.long_name;
          else if (c.types.includes("route")) route = c.long_name;
          else if (c.types.includes("locality")) city = c.long_name;
          else if (c.types.includes("administrative_area_level_1")) state = c.short_name;
          else if (c.types.includes("postal_code")) zipCode = c.long_name;
        });

        setVenue({
          venue_name: result.name || "",
          address: streetNumber ? `${streetNumber} ${route}` : route,
          city, state, zip_code: zipCode,
          phone: result.formatted_phone_number || "",
          google_place_id: placeId,
          latitude: result.geometry?.location?.lat?.() ?? result.geometry?.location?.lat ?? null,
          longitude: result.geometry?.location?.lng?.() ?? result.geometry?.location?.lng ?? null,
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

  const clearSelection = useCallback(() => { setVenueSelected(false); setVenue(EMPTY_VENUE); }, []);
  const open = useCallback(() => { setSubmitted(false); setVisible(true); }, []);
  const close = useCallback(() => setVisible(false), []);
  const reset = useCallback(() => {
    setVisible(false); setSearchQuery(""); setPredictions([]);
    setVenue(EMPTY_VENUE); setVenueSelected(false);
    setNotes(""); setSubmitting(false); setSubmitted(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!user?.id) { Alert.alert("Login Required", "Please log in to recommend a venue."); return; }
    if (!venue.venue_name.trim()) { Alert.alert("Error", "Please search for and select a venue."); return; }
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
      Alert.alert("Thanks!", "Your venue recommendation has been submitted. We'll check it out!", [{ text: "OK", onPress: () => reset() }]);
    } catch (error) {
      console.error("Error submitting bar request:", error);
      Alert.alert("Error", "Failed to submit recommendation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [user, venue, notes, reset]);

  return {
    visible, open, close, searchQuery, searching, predictions,
    searchPlaces, selectPlace, venue, venueSelected, clearSelection,
    notes, setNotes, submitting, submitted, handleSubmit, reset,
  };
}
