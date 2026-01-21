import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import {
  Filters,
  defaultFilters,
} from "../views/components/common/filter-modal";

export interface Tournament {
  id: number;
  name: string;
  description: string;
  game_type: string;
  tournament_format: string;
  tournament_date: string;
  start_time: string;
  entry_fee: number;
  added_money: number;
  is_recurring: boolean;
  reports_to_fargo: boolean;
  open_tournament: boolean;
  max_fargo: number | null;
  venues: {
    venue: string;
    city: string;
    state: string;
  };
}

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
          name,
          description,
          game_type,
          tournament_format,
          tournament_date,
          start_time,
          entry_fee,
          added_money,
          is_recurring,
          reports_to_fargo,
          open_tournament,
          max_fargo,
          venues (
            venue,
            city,
            state
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
        t.entry_fee >= filters.minEntryFee &&
        t.entry_fee <= filters.maxEntryFee,
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
    } else {
      await supabase.from("favorites").insert({
        user_id: profile.id_auto,
        tournament_id: tournamentId,
        favorite_type: "single",
      });

      setFavorites([...favorites, tournamentId]);
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
  };
}
