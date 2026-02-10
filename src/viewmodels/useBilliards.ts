import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { geoService, ZipCoords } from "../models/services/geo.service";
import { tournamentService } from "../models/services/tournament.service";
import { defaultFilters, Filters } from "../models/types/filter.types";
import { Tournament } from "../models/types/tournament.types";
import {
  getDistanceMiles,
  getTournamentImageUrl,
} from "../utils/tournament-helpers";
import { useAuth } from "./hooks/use.auth";
import { useFavorites } from "./hooks/use.favorites";

// ——— Types ———————————————————————————————————————————————————————————

interface CityOption {
  label: string;
  value: string;
}

export interface UseBilliardsReturn {
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

  // Empty state helpers
  isStateFilterEmpty: boolean;
  isHomeStateEmpty: boolean;

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

// ——— Hook ————————————————————————————————————————————————————————————

export function useBilliards(): UseBilliardsReturn {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { favoritedIds, toggleFavorite: toggleFav } = useFavorites(
    profile?.id_auto,
  );

  // —— Tournament data ————————————————————————————————————————————————
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [hasSetHomeState, setHasSetHomeState] = useState(false);

  // —— Location helpers ———————————————————————————————————————————————
  const [cities, setCities] = useState<CityOption[]>([]);
  const [zipCoords, setZipCoords] = useState<ZipCoords | null>(null);
  const [activeZip, setActiveZip] = useState("");

  // —— Filter state (local — resets on navigation) ————————————————————
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [searchRadius, setSearchRadius] = useState(25);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // —— Effects ————————————————————————————————————————————————————————

  // Initial load
  useEffect(() => {
    loadTournaments();
  }, []);

  // Default to user's home state once tournaments are loaded
  useEffect(() => {
    if (!hasSetHomeState && !loading && tournaments.length > 0 && profile?.home_state) {
      const homeState = profile.home_state;

      // Check if any tournaments exist in the user's home state
      const hasHomeStateTournaments = tournaments.some(
        (t) => t.venues?.state === homeState,
      );

      if (hasHomeStateTournaments) {
        // Home state has tournaments — pre-select it
        setSelectedState(homeState);
      }
      // If no tournaments in home state, leave as "" (show all)

      setHasSetHomeState(true);
    }
  }, [loading, tournaments, profile?.home_state, hasSetHomeState]);

  // Auto-geocode when zip reaches 5 digits
  useEffect(() => {
    if (zipCode.length === 5) {
      setActiveZip(zipCode);
      geoService.lookupZipCoords(zipCode).then(setZipCoords);
    } else {
      setActiveZip("");
      setZipCoords(null);
    }
  }, [zipCode]);

  // Load cities when state changes
  useEffect(() => {
    if (selectedState) {
      geoService.getCitiesForState(selectedState).then((cityNames) => {
        setCities([
          { label: "All Cities", value: "" },
          ...cityNames.map((c) => ({ label: c, value: c })),
        ]);
      });
    } else {
      setCities([]);
      setSelectedCity("");
    }
  }, [selectedState]);

  // —— Data fetching ——————————————————————————————————————————————————

  const loadTournaments = async () => {
    try {
      const { data } = await tournamentService.getTournaments({}, 1, 10000);
      setTournaments(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // —— Client-side filtering ——————————————————————————————————————————

  const filteredTournaments = useMemo(() => {
    let filtered = [...tournaments];

    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.venues?.venue?.toLowerCase().includes(q),
      );
    }

    // State
    if (selectedState) {
      filtered = filtered.filter((t) => t.venues?.state === selectedState);
    }

    // City
    if (selectedCity) {
      filtered = filtered.filter((t) => t.venues?.city === selectedCity);
    }

    // Zip + radius
    if (activeZip && activeZip.length === 5) {
      if (zipCoords) {
        if (searchRadius === 0) {
          filtered = filtered.filter(
            (t) => (t.venues as any)?.zip_code === activeZip,
          );
        } else {
          filtered = filtered.filter((t) => {
            const venueLat = Number((t.venues as any)?.latitude);
            const venueLng = Number((t.venues as any)?.longitude);
            if (!venueLat || !venueLng) return false;
            return (
              getDistanceMiles(
                zipCoords.lat,
                zipCoords.lng,
                venueLat,
                venueLng,
              ) <= searchRadius
            );
          });
        }
      } else {
        const zipMatches = filtered.filter(
          (t) => (t.venues as any)?.zip_code === activeZip,
        );
        if (zipMatches.length > 0) filtered = zipMatches;
      }
    }

    // —— Modal filters ————————————————————————————————————————————————
    if (filters.gameType) {
      filtered = filtered.filter((t) => t.game_type === filters.gameType);
    }
    if (filters.tournamentFormat) {
      filtered = filtered.filter(
        (t) => t.tournament_format === filters.tournamentFormat,
      );
    }
    if (filters.daysOfWeek.length > 0) {
      filtered = filtered.filter((t) => {
        const day = new Date(t.tournament_date).getDay();
        return filters.daysOfWeek.includes(day);
      });
    }
    if (filters.fromDate) {
      filtered = filtered.filter((t) => t.tournament_date >= filters.fromDate);
    }
    if (filters.toDate) {
      filtered = filtered.filter((t) => t.tournament_date <= filters.toDate);
    }
    filtered = filtered.filter(
      (t) =>
        (t.entry_fee || 0) >= filters.minEntryFee &&
        (t.entry_fee || 0) <= filters.maxEntryFee,
    );
    if (filters.maxFargo < 900) {
      filtered = filtered.filter(
        (t) => !t.max_fargo || t.max_fargo <= filters.maxFargo,
      );
    }
    if (filters.reportsToFargo) {
      filtered = filtered.filter((t) => t.reports_to_fargo === true);
    }
    if (filters.openTournament) {
      filtered = filtered.filter((t) => t.open_tournament === true);
    }

    return filtered;
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

  // —— Empty state helpers ————————————————————————————————————————————

  // True when a state is selected but yields no results
  const isStateFilterEmpty = useMemo(() => {
    if (!selectedState) return false;
    return filteredTournaments.length === 0;
  }, [selectedState, filteredTournaments]);

  // True when the user's home state was skipped because it had no tournaments
  const isHomeStateEmpty = useMemo(() => {
    if (!profile?.home_state) return false;
    if (selectedState) return false; // they manually picked something
    return !tournaments.some((t) => t.venues?.state === profile.home_state);
  }, [profile?.home_state, selectedState, tournaments]);

  // —— Actions ————————————————————————————————————————————————————————

  const toggleFavorite = useCallback(
    async (tournamentId: number) => {
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
      await toggleFav(tournamentId);
    },
    [user, toggleFav, router],
  );

  const resetAllFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedState("");
    setSelectedCity("");
    setZipCode("");
    setActiveZip("");
    setSearchRadius(25);
    setZipCoords(null);
    setFilters(defaultFilters);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTournaments();
    setRefreshing(false);
  }, []);

  // —— Public API (flat object the screen destructures) ———————————————

  return {
    // Data
    tournaments,
    filteredTournaments,
    favorites: favoritedIds,
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

    // Empty state helpers
    isStateFilterEmpty,
    isHomeStateEmpty,

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