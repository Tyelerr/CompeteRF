import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type SortOption = "name_asc" | "name_desc" | "date_newest" | "date_oldest";

const ITEMS_PER_PAGE = 10;

export interface AdminVenueWithStats {
  id: number;
  venue: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone?: string;
  photo_url?: string;
  status: string;
  created_at: string;
  activeTournaments: number;
  totalDirectors: number;
  totalViews: number;
  ownerName?: string;
}

export const useAdminVenues = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venues, setVenues] = useState<AdminVenueWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name_asc");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { loadVenues(); }, []);

  const loadVenues = async () => {
    try {
      // ── Step 1: all venues in one query ───────────────────────────────────
      const { data: venuesData, error } = await supabase
        .from("venues")
        .select("id, venue, address, city, state, zip_code, phone, photo_url, status, created_at")
        .order("venue", { ascending: true });

      if (error) { console.error("Error loading venues:", error); setVenues([]); return; }
      if (!venuesData || venuesData.length === 0) { setVenues([]); return; }

      const venueIds = venuesData.map((v: any) => v.id);
      const today = new Date().toISOString().split("T")[0];

      // ── Step 2: batch active tournament counts (1 query) ──────────────────
      const { data: activeTournamentsData } = await supabase
        .from("tournaments")
        .select("venue_id")
        .in("venue_id", venueIds)
        .eq("status", "active")
        .gte("tournament_date", today);

      const activeTournsByVenue: Record<number, number> = {};
      for (const t of activeTournamentsData || []) {
        activeTournsByVenue[t.venue_id] = (activeTournsByVenue[t.venue_id] || 0) + 1;
      }

      // ── Step 3: batch director counts (1 query) ───────────────────────────
      const { data: directorsData } = await supabase
        .from("venue_directors")
        .select("venue_id")
        .in("venue_id", venueIds)
        .is("archived_at", null);

      const directorsByVenue: Record<number, number> = {};
      for (const d of directorsData || []) {
        directorsByVenue[d.venue_id] = (directorsByVenue[d.venue_id] || 0) + 1;
      }

      // ── Step 4: batch views via tournament join (2 queries, not N×2) ──────
      // First get all tournament IDs and their venue mappings in one query
      const { data: tournamentVenueData } = await supabase
        .from("tournaments")
        .select("id, venue_id")
        .in("venue_id", venueIds);

      const tournamentToVenue: Record<number, number> = {};
      for (const t of tournamentVenueData || []) {
        tournamentToVenue[t.id] = t.venue_id;
      }

      const allTournamentIds = Object.keys(tournamentToVenue).map(Number);
      const viewsByVenue: Record<number, number> = {};
      if (allTournamentIds.length > 0) {
        const { data: viewsData } = await supabase
          .from("tournament_analytics")
          .select("tournament_id")
          .in("tournament_id", allTournamentIds)
          .eq("event_type", "view");

        for (const v of viewsData || []) {
          const venueId = tournamentToVenue[v.tournament_id];
          if (venueId) viewsByVenue[venueId] = (viewsByVenue[venueId] || 0) + 1;
        }
      }

      // ── Step 5: batch owner names (1 query) ───────────────────────────────
      const { data: ownersData } = await supabase
        .from("venue_owners")
        .select("venue_id, profiles:owner_id(name)")
        .in("venue_id", venueIds)
        .is("archived_at", null);

      const ownerByVenue: Record<number, string> = {};
      for (const o of ownersData || []) {
        // Only store first owner per venue
        if (!ownerByVenue[o.venue_id]) {
          ownerByVenue[o.venue_id] = (o.profiles as any)?.name || "";
        }
      }

      // ── Step 6: map into final shape (pure JS, no more DB calls) ──────────
      const venuesWithStats: AdminVenueWithStats[] = venuesData.map((venue: any) => ({
        id: venue.id,
        venue: venue.venue,
        address: venue.address,
        city: venue.city,
        state: venue.state,
        zip_code: venue.zip_code,
        phone: venue.phone,
        photo_url: venue.photo_url,
        status: venue.status || "active",
        created_at: venue.created_at,
        activeTournaments: activeTournsByVenue[venue.id] || 0,
        totalDirectors: directorsByVenue[venue.id] || 0,
        totalViews: viewsByVenue[venue.id] || 0,
        ownerName: ownerByVenue[venue.id] || undefined,
      }));

      setVenues(venuesWithStats);
    } catch (error) {
      console.error("Error loading admin venues:", error);
      setVenues([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadVenues(); };

  const filteredAndSortedVenues = useMemo(() => {
    let result = [...venues];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((v) =>
        v.venue.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q) ||
        v.state.toLowerCase().includes(q) ||
        (v.ownerName && v.ownerName.toLowerCase().includes(q)),
      );
    }
    switch (sortOption) {
      case "name_asc": result.sort((a, b) => a.venue.localeCompare(b.venue)); break;
      case "name_desc": result.sort((a, b) => b.venue.localeCompare(a.venue)); break;
      case "date_newest": result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case "date_oldest": result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
    }
    return result;
  }, [venues, searchQuery, sortOption]);

  const totalPages = Math.ceil(filteredAndSortedVenues.length / ITEMS_PER_PAGE);

  const paginatedVenues = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedVenues.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedVenues, currentPage]);

  const displayStart = filteredAndSortedVenues.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const displayEnd = Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedVenues.length);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, sortOption]);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) setCurrentPage((p) => p + 1);
  }, [currentPage, totalPages]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  }, [currentPage]);

  const sortOptions = [
    { label: "A-Z", value: "name_asc" },
    { label: "Z-A", value: "name_desc" },
    { label: "Newest", value: "date_newest" },
    { label: "Oldest", value: "date_oldest" },
  ];

  return {
    loading, refreshing,
    venues: paginatedVenues,
    totalCount: filteredAndSortedVenues.length,
    searchQuery, sortOption,
    currentPage, totalPages, displayStart, displayEnd,
    canGoNext: currentPage < totalPages,
    canGoPrev: currentPage > 1,
    sortOptions,
    onRefresh, setSearchQuery, setSortOption, goToNextPage, goToPrevPage,
  };
};
