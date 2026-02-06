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
  filters: Filters;

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedState: (state: string) => void;
  setSelectedCity: (city: string) => void;
  setZipCode: (zip: string) => void;
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
  }, [tournaments, searchQuery, selectedState, selectedCity, zipCode, filters]);

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
            phone
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
    // Updated game type to image file mapping with Scotch Doubles
    const gameTypeImageMap: Record<string, string> = {
      "8-ball": "8-ball.jpeg",
      "9-ball": "9-ball.jpeg",
      "10-ball": "10-ball.jpeg",
      "8-ball-scotch-doubles": "8-ball.jpeg", // Reuse 8-ball image
      "9-ball-scotch-doubles": "9-ball.jpeg", // Reuse 9-ball image
      "10-ball-scotch-doubles": "10-ball.jpeg", // Reuse 10-ball image
      "one-pocket": "One-Pocket.jpeg",
      "straight-pool": "Straight-Pool.jpeg",
      "banks": "Banks.jpeg",
    };

    // First check if tournament has a custom thumbnail
    if (tournament.thumbnail) {
      if (tournament.thumbnail.startsWith("custom:")) {
        // Custom uploaded image - return the full Supabase URL
        return tournament.thumbnail.replace("custom:", "");
      } else {
        // Game type image selected during submission
        const imageFile = gameTypeImageMap[tournament.thumbnail];
        if (imageFile) {
          // Use the correct Supabase project URL
          return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
        }
      }
    }

    // Fallback: try to get default image based on game type
    const imageFile = gameTypeImageMap[tournament.game_type];
    if (imageFile) {
      // Use the correct Supabase project URL
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
    }

    // No image available
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
    filters,

    // Actions
    setSearchQuery,
    setSelectedState,
    setSelectedCity,
    setZipCode,
    setFilters,
    setFilterModalVisible,
    toggleFavorite,
    resetAllFilters,
    onRefresh,
    getTournamentImageUrl,
  };
}
