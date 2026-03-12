import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { geoService, ZipCoords } from "../models/services/geo.service";
import { tournamentService } from "../models/services/tournament.service";
import { defaultFilters, Filters, getFargoMax } from "../models/types/filter.types";
import { Tournament } from "../models/types/tournament.types";
import {
  getDistanceMiles,
  getTournamentImageUrl,
} from "../utils/tournament-helpers";
import { useAuth } from "./hooks/use.auth";
import { useFavorites } from "./hooks/use.favorites";

interface CityOption {
  label: string;
  value: string;
}

export interface UseBilliardsReturn {
  tournaments: Tournament[];
  filteredTournaments: Tournament[];
  favorites: number[];
  cities: CityOption[];
  user: any;
  loading: boolean;
  refreshing: boolean;
  error: string;
  filterModalVisible: boolean;
  searchQuery: string;
  selectedState: string;
  selectedCity: string;
  zipCode: string;
  searchRadius: number;
  filters: Filters;
  isStateFilterEmpty: boolean;
  isHomeStateEmpty: boolean;
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
  const { user, profile } = useAuth();
  const { favoritedIds, toggleFavorite: toggleFav } = useFavorites(profile?.id_auto);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [hasSetHomeState, setHasSetHomeState] = useState(false);

  const [cities, setCities] = useState<CityOption[]>([]);
  const [zipCoords, setZipCoords] = useState<ZipCoords | null>(null);
  const [activeZip, setActiveZip] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [searchRadius, setSearchRadius] = useState(25);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  useEffect(() => { loadTournaments(); }, []);

  useEffect(() => {
    if (!hasSetHomeState && !loading && tournaments.length > 0 && profile?.home_state) {
      const homeState = profile.home_state;
      const hasHomeStateTournaments = tournaments.some((t) => t.venues?.state === homeState);
      if (hasHomeStateTournaments) setSelectedState(homeState);
      setHasSetHomeState(true);
    }
  }, [loading, tournaments, profile?.home_state, hasSetHomeState]);

  useEffect(() => {
    if (zipCode.length === 5) {
      setActiveZip(zipCode);
      setSelectedState("");
      setSelectedCity("");
      setHasSetHomeState(true);
      geoService.lookupZipCoords(zipCode).then(setZipCoords);
    } else {
      setActiveZip("");
      setZipCoords(null);
    }
  }, [zipCode]);

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

  // ── Helper: normalize game_type slug → readable label ──────────────────
  const gameTypeLabel = (gameType: string) =>
    (gameType ?? "").replace(/-/g, " ").toLowerCase();

  const filteredTournaments = useMemo(() => {
    let filtered = [...tournaments];

    // ── Text search: name, venue, AND game type ──────────────────────────
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          t.name?.toLowerCase().includes(q) ||
          t.venues?.venue?.toLowerCase().includes(q) ||
          gameTypeLabel(t.game_type).includes(q)
      );
    }

    if (selectedState) {
      filtered = filtered.filter((t) => t.venues?.state === selectedState);
    }

    if (selectedCity) {
      filtered = filtered.filter((t) => t.venues?.city === selectedCity);
    }

    if (activeZip && activeZip.length === 5) {
      if (zipCoords) {
        if (searchRadius === 0) {
          filtered = filtered.filter((t) => (t.venues as any)?.zip_code === activeZip);
        } else {
          filtered = filtered.filter((t) => {
            const venueLat = Number((t.venues as any)?.latitude);
            const venueLng = Number((t.venues as any)?.longitude);
            if (!venueLat || !venueLng) return false;
            return getDistanceMiles(zipCoords.lat, zipCoords.lng, venueLat, venueLng) <= searchRadius;
          });
        }
      } else {
        const zipMatches = filtered.filter((t) => (t.venues as any)?.zip_code === activeZip);
        if (zipMatches.length > 0) filtered = zipMatches;
      }
    }

    if (filters.gameType) {
      filtered = filtered.filter((t) => t.game_type === filters.gameType);
    }
    if (filters.tournamentFormat) {
      filtered = filtered.filter((t) => t.tournament_format === filters.tournamentFormat);
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
        (t.entry_fee || 0) <= filters.maxEntryFee
    );

    const fargoMax = getFargoMax(filters.gameType);
    const fargoAdjusted = filters.minFargo > 0 || filters.maxFargo < fargoMax;
    if (fargoAdjusted) {
      filtered = filtered.filter(
        (t) =>
          t.max_fargo !== null &&
          t.max_fargo !== undefined &&
          t.max_fargo >= filters.minFargo &&
          t.max_fargo <= filters.maxFargo
      );
    }

    if (filters.reportsToFargo) filtered = filtered.filter((t) => t.reports_to_fargo === true);
    if (filters.calcutta) filtered = filtered.filter((t) => t.calcutta === true);
    if (filters.openTournament) filtered = filtered.filter((t) => t.open_tournament === true);

    return filtered;
  }, [tournaments, searchQuery, selectedState, selectedCity, activeZip, searchRadius, zipCoords, filters]);

  const isStateFilterEmpty = useMemo(() => {
    if (!selectedState) return false;
    return filteredTournaments.length === 0;
  }, [selectedState, filteredTournaments]);

  const isHomeStateEmpty = useMemo(() => {
    if (!profile?.home_state) return false;
    if (selectedState) return false;
    return !tournaments.some((t) => t.venues?.state === profile.home_state);
  }, [profile?.home_state, selectedState, tournaments]);

  const toggleFavorite = useCallback(
    async (tournamentId: number) => {
      if (!user) {
        Alert.alert(
          "Log In Required",
          "Create an account to save your favorite tournaments!",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Log In", onPress: () => router.push("/auth/login") },
            { text: "Create Account", onPress: () => router.push("/auth/register") },
          ]
        );
        return;
      }
      await toggleFav(tournamentId);
    },
    [user, toggleFav, router]
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
    setHasSetHomeState(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTournaments();
    setRefreshing(false);
  }, []);

  return {
    tournaments,
    filteredTournaments,
    favorites: favoritedIds,
    cities,
    user,
    loading,
    refreshing,
    error,
    filterModalVisible,
    searchQuery,
    selectedState,
    selectedCity,
    zipCode,
    searchRadius,
    filters,
    isStateFilterEmpty,
    isHomeStateEmpty,
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