import { supabase } from "../../lib/supabase";

export interface ZipCoords {
  lat: number;
  lng: number;
}

class GeoService {
  /**
   * Look up lat/lng for a US zip code.
   * Tries the free zippopotam.us API first, falls back to the venues table.
   */
  async lookupZipCoords(zip: string): Promise<ZipCoords | null> {
    if (zip.length !== 5) return null;

    // Try external geocoding API first
    try {
      const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (response.ok) {
        const data = await response.json();
        if (data.places && data.places.length > 0) {
          return {
            lat: parseFloat(data.places[0].latitude),
            lng: parseFloat(data.places[0].longitude),
          };
        }
      }
    } catch (err) {
      console.warn("Zip geocode failed, falling back to venue lookup:", err);
    }

    // Fallback: find coords from our own venues table
    const { data } = await supabase
      .from("venues")
      .select("latitude, longitude")
      .eq("zip_code", zip)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(1)
      .single();

    if (data?.latitude && data?.longitude) {
      return { lat: Number(data.latitude), lng: Number(data.longitude) };
    }

    return null;
  }

  /**
   * Load the unique list of cities for a given US state from the venues table.
   * Returns sorted city names.
   */
  async getCitiesForState(state: string): Promise<string[]> {
    const { data } = await supabase
      .from("venues")
      .select("city")
      .eq("state", state);

    if (!data) return [];
    return [...new Set(data.map((v) => v.city))].sort();
  }
}

export const geoService = new GeoService();
