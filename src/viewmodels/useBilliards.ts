import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { analyticsService } from "../models/services/analytics.service";
import { Tournament } from "../models/types/tournament.types";
import {
  Filters,
  defaultFilters,
} from "../views/components/common/filter-modal";

interface CityOption {
  label: string;
  value: string;
}

interface UseBilliardsReturn {
  // Data
  tournaments: Tournament[];
  filteredTournaments: Tournament[];
  favorites: number[];
  cities: CityOption[];
  user: any;

  // State
  loading: boolean;
  refreshing: boolean;
  error: string;
  filterModalVisible: boolean;

  // Filter values
  searchQuery: string;
  selectedState: string;
  selectedCity: string;
  zipCode: string;
  searchRadius: number;
  filters: Filters;

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedState: (state: string) => void;
  setSelectedCity: (city: string) => void;
  setZipCode: (zip: string) => void;
  setSearchRadius: (radius: number) => void;
  setFilters: (filters: Filters) => void;
  setFilterModalVisible: (visible: boolean) => void;
  toggleFavorite: (tournamentId: number) => void;
  resetAllFilters: () => void;
  onRefresh: () => Promise<void>;
  getTournamentImageUrl: (tournament: Tournament) => string | null;
}

export function useBilliards(): UseBilliardsReturn {
  const router = useRouter();

  // Data state
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [filteredTournaments, setFilteredTournaments] = useState<Tournament[]>(
    [],
  );
  const [favorites, setFavorites] = useState<number[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [user, setUser] = useState<any>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [searchRadius, setSearchRadius] = useState(25);
  const [activeZip, setActiveZip] = useState(""); // The "committed" zip used for filtering
  const [zipCoords, setZipCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  // Initialize
  useEffect(() => {
    checkUser();
    loadTournaments();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        loadFavorites(session.user.id);
      } else {
        setFavorites([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Apply filters when dependencies change
  useEffect(() => {
    applyFilters();
  }, [
    tournaments,
    searchQuery,
    selectedState,
    selectedCity,
    activeZip,
    searchRadius,
    zipCoords,
    filters,
  ]);

  // Auto-geocode and apply when zip reaches 5 digits, clear when less
  useEffect(() => {
    if (zipCode.length === 5) {
      setActiveZip(zipCode);
      lookupZipCoords(zipCode);
      console.log("🔍 Zip auto-applied:", zipCode);
    } else {
      setActiveZip("");
      setZipCoords(null);
    }
  }, [zipCode]);

  // Load cities when state changes
  useEffect(() => {
    if (selectedState) {
      loadCitiesForState(selectedState);
    } else {
      setCities([]);
      setSelectedCity("");
    }
  }, [selectedState]);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setUser(session?.user || null);
    if (session?.user) {
      await loadFavorites(session.user.id);
    }
  };

  const loadTournaments = async () => {
    try {
      const { data, error } = (await supabase
        .from("tournaments")
        .select(
          `
          id,
          venue_id,
          director_id,
          template_id,
          name,
          description,
          game_type,
          tournament_format,
          game_spot,
          race,
          table_size,
          equipment,
          number_of_tables,
          tournament_date,
          start_time,
          timezone,
          entry_fee,
          added_money,
          max_fargo,
          required_fargo_games,
          reports_to_fargo,
          open_tournament,
          phone_number,
          thumbnail,
          is_recurring,
          status,
          created_at,
          updated_at,
          venues!inner (
            id,
            venue,
            address,
            city,
            state,
            zip_code,
            phone,
            latitude,
            longitude
          )
        `,
        )
        .eq("status", "active")
        .order("tournament_date", { ascending: true })) as {
        data: Tournament[] | null;
        error: any;
      };

      if (error) {
        setError(error.message);
      } else {
        setTournaments(data || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCitiesForState = async (state: string) => {
    const { data } = await supabase
      .from("venues")
      .select("city")
      .eq("state", state);

    if (data) {
      const uniqueCities = [...new Set(data.map((v) => v.city))].sort();
      setCities([
        { label: "All Cities", value: "" },
        ...uniqueCities.map((city) => ({ label: city, value: city })),
      ]);
    }
  };

  // Haversine formula — returns distance in miles between two lat/lng points
  const getDistanceMiles = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 3958.8; // Earth's radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Look up lat/lng for any US zip code using free geocoding API
  const lookupZipCoords = async (zip: string) => {
    if (zip.length !== 5) {
      setZipCoords(null);
      return;
    }
    try {
      const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (response.ok) {
        const data = await response.json();
        console.log("📍 Zip geocode response:", JSON.stringify(data));
        if (data.places && data.places.length > 0) {
          setZipCoords({
            lat: parseFloat(data.places[0].latitude),
            lng: parseFloat(data.places[0].longitude),
          });
          return;
        }
      } else {
        console.warn("📍 Zip geocode failed with status:", response.status);
      }
    } catch (err) {
      console.warn("Zip geocode failed, falling back to venue lookup:", err);
    }

    // Fallback: try to find coords from our own venues table
    const { data } = await supabase
      .from("venues")
      .select("latitude, longitude")
      .eq("zip_code", zip)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(1)
      .single();

    if (data && data.latitude && data.longitude) {
      setZipCoords({ lat: Number(data.latitude), lng: Number(data.longitude) });
    } else {
      setZipCoords(null);
    }
  };

  // Called when user taps the blue checkmark to commit their zip code
  // (kept for backwards compat but auto-apply handles it now)

  const applyFilters = () => {
    let filtered = [...tournaments];

    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.venues?.venue?.toLowerCase().includes(query),
      );
    }

    // State filter
    if (selectedState) {
      filtered = filtered.filter((t) => t.venues?.state === selectedState);
    }

    // City filter
    if (selectedCity) {
      filtered = filtered.filter((t) => t.venues?.city === selectedCity);
    }

    // Zip code + radius filter — uses real distance when coordinates available
    if (activeZip && activeZip.length === 5) {
      if (zipCoords) {
        // Real Haversine distance filtering
        if (searchRadius === 0) {
          // Exact zip match
          filtered = filtered.filter(
            (t) => (t.venues as any)?.zip_code === activeZip,
          );
        } else {
          filtered = filtered.filter((t) => {
            const venueLat = Number((t.venues as any)?.latitude);
            const venueLng = Number((t.venues as any)?.longitude);
            // If venue has no coords, exclude it
            if (!venueLat || !venueLng) return false;
            const distance = getDistanceMiles(
              zipCoords.lat,
              zipCoords.lng,
              venueLat,
              venueLng,
            );
            return distance <= searchRadius;
          });
        }
      } else {
        // No coordinates for this zip — try exact zip match, but if nothing
        // matches show all results rather than empty
        const zipMatches = filtered.filter(
          (t) => (t.venues as any)?.zip_code === activeZip,
        );
        if (zipMatches.length > 0) {
          filtered = zipMatches;
        }
        // else: keep all results (can't filter by distance without coords)
      }
    }

    // Game type filter
    if (filters.gameType) {
      filtered = filtered.filter((t) => t.game_type === filters.gameType);
    }

    // Tournament format filter
    if (filters.tournamentFormat) {
      filtered = filtered.filter(
        (t) => t.tournament_format === filters.tournamentFormat,
      );
    }

    // Days of week filter
    if (filters.daysOfWeek.length > 0) {
      filtered = filtered.filter((t) => {
        const date = new Date(t.tournament_date);
        const dayOfWeek = date.getDay();
        return filters.daysOfWeek.includes(dayOfWeek);
      });
    }

    // Date range filter
    if (filters.fromDate) {
      filtered = filtered.filter((t) => t.tournament_date >= filters.fromDate);
    }
    if (filters.toDate) {
      filtered = filtered.filter((t) => t.tournament_date <= filters.toDate);
    }

    // Entry fee range
    filtered = filtered.filter(
      (t) =>
        (t.entry_fee || 0) >= filters.minEntryFee &&
        (t.entry_fee || 0) <= filters.maxEntryFee,
    );

    // Fargo range
    if (filters.maxFargo < 900) {
      filtered = filtered.filter(
        (t) => !t.max_fargo || t.max_fargo <= filters.maxFargo,
      );
    }

    // Reports to Fargo
    if (filters.reportsToFargo) {
      filtered = filtered.filter((t) => t.reports_to_fargo === true);
    }

    // Open tournament
    if (filters.openTournament) {
      filtered = filtered.filter((t) => t.open_tournament === true);
    }

    setFilteredTournaments(filtered);
  };

  const loadFavorites = async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id_auto")
      .eq("id", userId)
      .single();

    if (profile) {
      const { data } = await supabase
        .from("favorites")
        .select("tournament_id")
        .eq("user_id", profile.id_auto)
        .not("tournament_id", "is", null);

      if (data) {
        setFavorites(data.map((f) => f.tournament_id));
      }
    }
  };

  const toggleFavorite = async (tournamentId: number) => {
    if (!user) {
      Alert.alert(
        "Log In Required",
        "Create an account to save your favorite tournaments!",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Log In", onPress: () => router.push("/auth/login") },
          {
            text: "Create Account",
            onPress: () => router.push("/auth/register"),
          },
        ],
      );
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id_auto")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    const isFavorited = favorites.includes(tournamentId);

    if (isFavorited) {
      await supabase
        .from("favorites")
        .delete()
        .eq("user_id", profile.id_auto)
        .eq("tournament_id", tournamentId);

      setFavorites(favorites.filter((id) => id !== tournamentId));

      // Track analytics (fire-and-forget)
      analyticsService.trackTournamentUnfavorited(tournamentId);
    } else {
      await supabase.from("favorites").insert({
        user_id: profile.id_auto,
        tournament_id: tournamentId,
        favorite_type: "single",
      });

      setFavorites([...favorites, tournamentId]);

      // Track analytics (fire-and-forget)
      analyticsService.trackTournamentFavorited(tournamentId);
    }
  };

  const resetAllFilters = () => {
    setSearchQuery("");
    setSelectedState("");
    setSelectedCity("");
    setZipCode("");
    setActiveZip("");
    setSearchRadius(25);
    setZipCoords(null);
    setFilters(defaultFilters);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTournaments();
    if (user) {
      await loadFavorites(user.id);
    }
    setRefreshing(false);
  };

  // Get tournament image URL helper (updated with Scotch Doubles support)
  const getTournamentImageUrl = (tournament: Tournament) => {
    const gameTypeImageMap: Record<string, string> = {
      "8-ball": "8-ball.jpeg",
      "9-ball": "9-ball.jpeg",
      "10-ball": "10-ball.jpeg",
      "8-ball-scotch-doubles": "8-ball.jpeg",
      "9-ball-scotch-doubles": "9-ball.jpeg",
      "10-ball-scotch-doubles": "10-ball.jpeg",
      "one-pocket": "One-Pocket.jpeg",
      "straight-pool": "Straight-Pool.jpeg",
      banks: "Banks.jpeg",
    };

    if (tournament.thumbnail) {
      if (tournament.thumbnail.startsWith("custom:")) {
        return tournament.thumbnail.replace("custom:", "");
      } else {
        const imageFile = gameTypeImageMap[tournament.thumbnail];
        if (imageFile) {
          return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
        }
      }
    }

    const imageFile = gameTypeImageMap[tournament.game_type];
    if (imageFile) {
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
    }

    return null;
  };

  return {
    // Data
    tournaments,
    filteredTournaments,
    favorites,
    cities,
    user,

    // State
    loading,
    refreshing,
    error,
    filterModalVisible,

    // Filter values
    searchQuery,
    selectedState,
    selectedCity,
    zipCode,
    searchRadius,
    filters,

    // Actions
    setSearchQuery,
    setSelectedState,
    setSelectedCity,
    setZipCode,
    setSearchRadius,
    setFilters,
    setFilterModalVisible,
    toggleFavorite,
    resetAllFilters,
    onRefresh,
    getTournamentImageUrl,
  };
}
