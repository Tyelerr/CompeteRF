import { useCallback, useEffect, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import { GiveawayEntry } from "../models/types/giveaway.types";

type ParticipantEntry = GiveawayEntry & {
  giveaway_name?: string;
  giveaway_prize?: number;
};

type SortOption = "newest" | "oldest" | "name";
type FilterGiveaway = { id: number; name: string };

export function useGiveawayParticipants() {
  const [entries, setEntries] = useState<ParticipantEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<ParticipantEntry[]>([]);
  const [giveaways, setGiveaways] = useState<FilterGiveaway[]>([]);
  const [selectedGiveawayId, setSelectedGiveawayId] = useState<number | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch all entries
      const allEntries = await giveawayService.getAllEntries();
      setEntries(allEntries);

      // Extract unique giveaways for filter dropdown
      const uniqueGiveaways = new Map<number, string>();
      allEntries.forEach((e) => {
        if (e.giveaway_id && e.giveaway_name) {
          uniqueGiveaways.set(e.giveaway_id, e.giveaway_name);
        }
      });
      const giveawayList: FilterGiveaway[] = Array.from(
        uniqueGiveaways.entries(),
      ).map(([id, name]) => ({ id, name }));
      setGiveaways(giveawayList);
    } catch (err) {
      console.error("Error fetching participants:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Apply filters and sorting
  useEffect(() => {
    let result = [...entries];

    // Filter by giveaway
    if (selectedGiveawayId !== null) {
      result = result.filter((e) => e.giveaway_id === selectedGiveawayId);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name_as_on_id?.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q) ||
          e.phone?.includes(q),
      );
    }

    // Sort
    if (sortBy === "newest") {
      result.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      );
    } else if (sortBy === "oldest") {
      result.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime(),
      );
    } else if (sortBy === "name") {
      result.sort((a, b) =>
        (a.name_as_on_id || "").localeCompare(b.name_as_on_id || ""),
      );
    }

    setFilteredEntries(result);
  }, [entries, selectedGiveawayId, searchQuery, sortBy]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
  }, [fetchData]);

  const selectGiveaway = useCallback((id: number | null) => {
    setSelectedGiveawayId(id);
  }, []);

  const cycleSortBy = useCallback(() => {
    setSortBy((prev) => {
      if (prev === "newest") return "oldest";
      if (prev === "oldest") return "name";
      return "newest";
    });
  }, []);

  const formatDate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const formatBirthday = useCallback((dateStr: string | null): string => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  return {
    // Data
    entries: filteredEntries,
    totalCount: entries.length,
    filteredCount: filteredEntries.length,
    giveaways,

    // Filters
    selectedGiveawayId,
    searchQuery,
    sortBy,

    // State
    loading,
    refreshing,

    // Actions
    refresh,
    setSearchQuery,
    selectGiveaway,
    cycleSortBy,

    // Helpers
    formatDate,
    formatBirthday,
  };
}
