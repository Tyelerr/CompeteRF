// src/viewmodels/useVenueDiscovery.ts
// Read-only public venue discovery viewmodel (Billiards → Venues tab). Mirrors the
// tournament-discovery pattern in useBilliards: load the active venue set once, filter
// CLIENT-SIDE (name / state / city / zip radius) using the same geoService + Haversine
// helpers, and expose the filtered list for the view to paginate. Equipment summaries
// are fetched in ONE batched query (never one-per-card). No writes; no ownership reads.

import { useCallback, useEffect, useMemo, useState } from "react";
import { geoService, ZipCoords } from "../models/services/geo.service";
import { tournamentService } from "../models/services/tournament.service";
import { venueService } from "../models/services/venue.service";
import { Venue } from "../models/types/venue.types";
import { getDistanceMiles } from "../utils/tournament-helpers";

export interface VenueTableSummary {
  tableCount: number;
  sizes: string[];
}

export interface VenueNextTournament {
  id: number;
  name: string;
  date: string; // tournament_date
  time: string | null; // start_time
}

export interface CityOption {
  label: string;
  value: string;
}

export const useVenueDiscovery = () => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [tableSummaries, setTableSummaries] = useState<Record<number, VenueTableSummary>>({});
  const [nextByVenue, setNextByVenue] = useState<Record<number, VenueNextTournament>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters (all applied client-side over the loaded active set).
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [searchRadius, setSearchRadius] = useState(0); // miles; 0 = exact zip match
  const [zipCoords, setZipCoords] = useState<ZipCoords | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);

  const load = useCallback(async () => {
    try {
      const list = await venueService.getVenues();
      setVenues(list);
      const ids = list.map((v) => v.id);
      // Two BATCHED queries for the whole set (never per-card): equipment summaries,
      // and upcoming tournaments (soonest-first → first per venue = "next tournament").
      const [summaries, upcoming] = await Promise.all([
        venueService.getTableSummariesByVenueIds(ids),
        tournamentService.getUpcomingByVenueIds(ids),
      ]);
      setTableSummaries(summaries);
      const next: Record<number, VenueNextTournament> = {};
      for (const t of upcoming) {
        const vid = t.venue_id;
        if (vid != null && !(vid in next)) {
          next[vid] = { id: t.id, name: t.name, date: t.tournament_date, time: t.start_time ?? null };
        }
      }
      setNextByVenue(next);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load venues.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Async initial load; state is set after await (same data-fetch pattern as useBilliards).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Cities for the selected state (reuses the venues-backed city list).
  useEffect(() => {
    if (!selectedState) {
      // One-shot reset when the state filter clears (negligible cascade).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCities([]);
      setSelectedCity("");
      return;
    }
    geoService.getCitiesForState(selectedState).then((names) => {
      setCities([
        { label: "All Cities", value: "" },
        ...names.map((c) => ({ label: c, value: c })),
      ]);
    });
  }, [selectedState]);

  // Zip → coords for radius filtering (5-digit only).
  useEffect(() => {
    if (zipCode.length === 5) {
      geoService.lookupZipCoords(zipCode).then(setZipCoords);
    } else {
      // One-shot clear when zip is incomplete.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setZipCoords(null);
    }
  }, [zipCode]);

  const filteredVenues = useMemo(() => {
    let out = [...venues];

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (v) =>
          v.venue?.toLowerCase().includes(q) ||
          v.city?.toLowerCase().includes(q) ||
          v.address?.toLowerCase().includes(q),
      );
    }
    if (selectedState) out = out.filter((v) => v.state === selectedState);
    if (selectedCity) out = out.filter((v) => v.city === selectedCity);

    if (zipCode.length === 5) {
      if (searchRadius === 0) {
        // Exact zip match (mirrors tournament discovery's radius-0 behavior).
        out = out.filter((v) => v.zip_code === zipCode);
      } else if (zipCoords) {
        out = out.filter((v) => {
          if (v.latitude == null || v.longitude == null) return false;
          return (
            getDistanceMiles(zipCoords.lat, zipCoords.lng, v.latitude, v.longitude) <=
            searchRadius
          );
        });
      }
    }
    return out;
  }, [venues, searchQuery, selectedState, selectedCity, zipCode, searchRadius, zipCoords]);

  const hasActiveFilters =
    !!searchQuery || !!selectedState || !!selectedCity || !!zipCode || searchRadius > 0;

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedState("");
    setSelectedCity("");
    setZipCode("");
    setSearchRadius(0);
  }, []);

  return {
    venues,
    filteredVenues,
    tableSummaries,
    nextByVenue,
    loading,
    refreshing,
    error,
    onRefresh,
    // filters
    searchQuery,
    setSearchQuery,
    selectedState,
    setSelectedState,
    selectedCity,
    setSelectedCity,
    zipCode,
    setZipCode,
    searchRadius,
    setSearchRadius,
    cities,
    hasActiveFilters,
    resetFilters,
  };
};
