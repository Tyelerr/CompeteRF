import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type SortOption =
  | "name_asc"
  | "name_desc"
  | "date_newest"
  | "date_oldest";

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

  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async () => {
    try {
      // Get ALL venues (admin sees everything)
      const { data: venuesData, error } = await supabase
        .from("venues")
        .select(
          "id, venue, address, city, state, zip_code, phone, photo_url, status, created_at",
        )
        .order("venue", { ascending: true });

      if (error) {
        console.error("Error loading venues:", error);
        setVenues([]);
        return;
      }

      if (!venuesData || venuesData.length === 0) {
        setVenues([]);
        return;
      }

      // Get stats for each venue
      const venuesWithStats: AdminVenueWithStats[] = await Promise.all(
        venuesData.map(async (venue: any) => {
          // Count active tournaments at this venue
          const { count: tournamentCount } = await supabase
            .from("tournaments")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", venue.id)
            .eq("status", "active")
            .gte("tournament_date", new Date().toISOString().split("T")[0]);

          // Count directors assigned to this venue
          const { count: directorCount } = await supabase
            .from("venue_directors")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", venue.id)
            .is("archived_at", null);

          // Count total views for tournaments at this venue
          const { count: viewsCount } = await supabase
            .from("tournament_analytics")
            .select("id, tournaments!inner(venue_id)", {
              count: "exact",
              head: true,
            })
            .eq("tournaments.venue_id", venue.id)
            .eq("event_type", "view");

          // Get owner name (if any)
          const { data: ownerData } = await supabase
            .from("venue_owners")
            .select("profiles:owner_id(name)")
            .eq("venue_id", venue.id)
            .is("archived_at", null)
            .limit(1)
            .single();

          return {
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
            activeTournaments: tournamentCount || 0,
            totalDirectors: directorCount || 0,
            totalViews: viewsCount || 0,
            ownerName: (ownerData?.profiles as any)?.name || undefined,
          };
        }),
      );

      setVenues(venuesWithStats);
    } catch (error) {
      console.error("Error loading admin venues:", error);
      setVenues([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadVenues();
  };

  // Filter and sort venues
  const filteredAndSortedVenues = useMemo(() => {
    let result = [...venues];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (venue) =>
          venue.venue.toLowerCase().includes(query) ||
          venue.city.toLowerCase().includes(query) ||
          venue.address.toLowerCase().includes(query) ||
          venue.state.toLowerCase().includes(query) ||
          (venue.ownerName && venue.ownerName.toLowerCase().includes(query)),
      );
    }

    // Sort
    switch (sortOption) {
      case "name_asc":
        result.sort((a, b) => a.venue.localeCompare(b.venue));
        break;
      case "name_desc":
        result.sort((a, b) => b.venue.localeCompare(a.venue));
        break;
      case "date_newest":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
      case "date_oldest":
        result.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        break;
    }

    return result;
  }, [venues, searchQuery, sortOption]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedVenues.length / ITEMS_PER_PAGE);

  const paginatedVenues = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedVenues.slice(
      startIndex,
      startIndex + ITEMS_PER_PAGE,
    );
  }, [filteredAndSortedVenues, currentPage]);

  const displayStart =
    filteredAndSortedVenues.length === 0
      ? 0
      : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const displayEnd = Math.min(
    currentPage * ITEMS_PER_PAGE,
    filteredAndSortedVenues.length,
  );

  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortOption]);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [currentPage, totalPages]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  }, [currentPage]);

  // Sort options
  const sortOptions = [
    { label: "A-Z", value: "name_asc" },
    { label: "Z-A", value: "name_desc" },
    { label: "Newest", value: "date_newest" },
    { label: "Oldest", value: "date_oldest" },
  ];

  return {
    // State
    loading,
    refreshing,
    venues: paginatedVenues,
    totalCount: filteredAndSortedVenues.length,
    searchQuery,
    sortOption,

    // Pagination
    currentPage,
    totalPages,
    displayStart,
    displayEnd,
    canGoNext: currentPage < totalPages,
    canGoPrev: currentPage > 1,

    // Options
    sortOptions,

    // Actions
    onRefresh,
    setSearchQuery,
    setSortOption,
    goToNextPage,
    goToPrevPage,
  };
};
