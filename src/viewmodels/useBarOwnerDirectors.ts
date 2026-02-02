import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { directorService } from "../models/services/director.service";
import {
  Director,
  DirectorFilters,
  DirectorOption,
  DirectorStats,
  VenueOption,
} from "../models/types/director.types";
import { useAuthContext } from "../providers/AuthProvider";

export const useBarOwnerDirectors = () => {
  const { profile } = useAuthContext();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [directors, setDirectors] = useState<Director[]>([]);
  const [stats, setStats] = useState<DirectorStats>({
    totalDirectors: 0,
    activeDirectors: 0,
    archivedDirectors: 0,
    venuesWithDirectors: 0,
  });

  // Filters
  const [filters, setFilters] = useState<DirectorFilters>({
    search: "",
    venue_id: undefined,
    status: "active",
  });

  // Options for dropdowns
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([]);
  const [availableDirectors, setAvailableDirectors] = useState<
    DirectorOption[]
  >([]);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedDirector, setSelectedDirector] = useState<Director | null>(
    null,
  );
  const [removeReason, setRemoveReason] = useState("");

  useEffect(() => {
    if (profile?.id_auto) {
      loadData();
    }
  }, [profile?.id_auto, filters]);

  const loadData = async () => {
    if (!profile?.id_auto) return;

    try {
      setLoading(true);

      // Load directors with bar owner specific filtering
      const directorsData = await directorService.getDirectors({
        ...filters,
        owner_id: profile.id_auto, // Bar owner can only see directors at venues they own
      });

      // Load stats
      const statsData = await directorService.getDirectorStats({
        owner_id: profile.id_auto,
      });

      setDirectors(directorsData);
      setStats(statsData);

      // Load venue options (only venues owned by this bar owner)
      await loadVenueOptions();
    } catch (error) {
      console.error("Error loading directors:", error);
      Alert.alert("Error", "Failed to load directors");
    } finally {
      setLoading(false);
    }
  };

  const loadVenueOptions = async () => {
    if (!profile?.id_auto) return;

    try {
      // Get venues owned by this bar owner
      const { data: venueOwnerships } = await supabase
        .from("venue_owners")
        .select(
          `
          venues (
            id,
            venue,
            city,
            state
          )
        `,
        )
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      const venues =
        venueOwnerships?.map((vo) => (vo as any).venues).filter(Boolean) || [];

      setVenueOptions(
        venues.map((venue) => ({
          label: `${venue.venue} - ${venue.city}, ${venue.state}`,
          value: venue.id.toString(),
          id: venue.id,
        })),
      );
    } catch (error) {
      console.error("Error loading venue options:", error);
    }
  };

  const loadAvailableDirectors = async (venueId: number) => {
    try {
      const directors = await directorService.getAvailableDirectors(venueId);

      setAvailableDirectors(
        directors.map((director) => ({
          label: `${director.name} (${director.user_name})`,
          value: director.id_auto.toString(),
          email: director.email,
          role: director.role,
        })),
      );
    } catch (error) {
      console.error("Error loading available directors:", error);
      Alert.alert("Error", "Failed to load available directors");
    }
  };

  // Actions
  const handleAddDirector = async (venueId: number, directorId: number) => {
    if (!profile?.id_auto) return;

    try {
      setProcessing(directorId);

      await directorService.addDirector({
        venue_id: venueId,
        director_id: directorId,
        assigned_by: profile.id_auto,
      });

      Alert.alert("Success", "Director added successfully");
      setShowAddModal(false);
      await loadData();
    } catch (error: any) {
      console.error("Error adding director:", error);
      Alert.alert("Error", error.message || "Failed to add director");
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveDirector = (director: Director) => {
    setSelectedDirector(director);
    setRemoveReason("");
    setShowRemoveModal(true);
  };

  const confirmRemoveDirector = async () => {
    if (!selectedDirector || !profile?.id_auto) return;

    try {
      setProcessing(selectedDirector.id);

      await directorService.removeDirector({
        id: selectedDirector.id,
        reason: removeReason,
        archived_by: profile.id_auto,
      });

      Alert.alert("Success", "Director removed successfully");
      setShowRemoveModal(false);
      setSelectedDirector(null);
      await loadData();
    } catch (error) {
      console.error("Error removing director:", error);
      Alert.alert("Error", "Failed to remove director");
    } finally {
      setProcessing(null);
    }
  };

  const handleRestoreDirector = async (director: Director) => {
    try {
      setProcessing(director.id);

      await directorService.restoreDirector(director.id);

      Alert.alert("Success", "Director restored successfully");
      await loadData();
    } catch (error) {
      console.error("Error restoring director:", error);
      Alert.alert("Error", "Failed to restore director");
    } finally {
      setProcessing(null);
    }
  };

  // Filter helpers
  const updateSearch = (search: string) => {
    setFilters((prev) => ({ ...prev, search }));
  };

  const updateStatusFilter = (status: "all" | "active" | "archived") => {
    setFilters((prev) => ({ ...prev, status }));
  };

  const updateVenueFilter = (venue_id?: number) => {
    setFilters((prev) => ({ ...prev, venue_id }));
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }, [profile?.id_auto, filters]);

  // Computed values
  const filteredDirectors = directors; // Filtering already done in service
  const statusCounts = {
    all: stats.totalDirectors,
    active: stats.activeDirectors,
    archived: stats.archivedDirectors,
  };

  // Permissions (bar owner specific)
  const canAddDirectors = true; // Bar owners can add directors to their venues
  const canRemoveDirectors = true; // Bar owners can remove directors from their venues
  const canViewArchivedDirectors = true; // Bar owners can see archived directors

  return {
    // State
    loading,
    refreshing,
    processing,

    // Data
    directors: filteredDirectors,
    stats,
    venueOptions,
    availableDirectors,

    // Filters
    filters,
    statusCounts,

    // Modal states
    showAddModal,
    setShowAddModal,
    showRemoveModal,
    setShowRemoveModal,
    selectedDirector,
    removeReason,
    setRemoveReason,

    // Actions
    handleAddDirector,
    handleRemoveDirector,
    confirmRemoveDirector,
    handleRestoreDirector,
    loadAvailableDirectors,

    // Filter actions
    updateSearch,
    updateStatusFilter,
    updateVenueFilter,
    onRefresh,

    // Permissions
    canAddDirectors,
    canRemoveDirectors,
    canViewArchivedDirectors,

    // User info
    currentUser: profile,
  };
};
