import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { directorService } from "../models/services/director.service";
import {
  DirectorFilters,
  DirectorOption,
  GroupedDirector,
  VenueOption,
} from "../models/types/director.types";
import { useAuthContext } from "../providers/AuthProvider";
import { usePagination } from "./hooks/use.pagination";

const ITEMS_PER_PAGE = 5;

export const useBarOwnerDirectors = () => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [allGroupedDirectors, setAllGroupedDirectors] = useState<GroupedDirector[]>([]);
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([]);
  const [availableDirectors, setAvailableDirectors] = useState<DirectorOption[]>([]);

  const [filters, setFilters] = useState<DirectorFilters>({ search: "", status: "active" });

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showEditVenuesModal, setShowEditVenuesModal] = useState(false);
  const [selectedDirector, setSelectedDirector] = useState<GroupedDirector | null>(null);
  const [editingDirector, setEditingDirector] = useState<GroupedDirector | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  useEffect(() => {
    if (profile?.id_auto) loadData();
  }, [profile?.id_auto]);

  const loadData = async () => {
    if (!profile?.id_auto) return;
    try {
      setLoading(true);
      const [grouped] = await Promise.all([
        directorService.getGroupedDirectors(profile.id_auto),
        loadVenueOptions(),
      ]);
      setAllGroupedDirectors(grouped);
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
      const { data: venueOwnerships } = await supabase
        .from("venue_owners")
        .select("venues (id, venue, city, state)")
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);
      const venues = venueOwnerships?.map((vo) => (vo as any).venues).filter(Boolean) || [];
      setVenueOptions(
        venues.map((v: any) => ({
          label: `${v.venue} - ${v.city}, ${v.state}`,
          value: v.id.toString(),
          id: v.id,
        }))
      );
    } catch (error) {
      console.error("Error loading venue options:", error);
    }
  };

  const loadAvailableDirectors = async (venueId: number) => {
    try {
      const directors = await directorService.getAvailableDirectors(venueId);
      setAvailableDirectors(
        directors.map((d) => ({ label: `${d.name} (${d.user_name})`, value: d.id_auto.toString(), email: d.email, role: d.role }))
      );
    } catch (error) {
      console.error("Error loading available directors:", error);
    }
  };

  // ── Client-side filter ────────────────────────────────────────────────────
  const filteredDirectors = useMemo(() => {
    let result = allGroupedDirectors;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (d) =>
          d.profile.name?.toLowerCase().includes(q) ||
          d.profile.user_name?.toLowerCase().includes(q) ||
          d.profile.email?.toLowerCase().includes(q) ||
          d.profile.id_auto?.toString().includes(q) ||
          d.assignments.some((a) => a.venue_name?.toLowerCase().includes(q))
      );
    }

    return result;
  }, [allGroupedDirectors, filters]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const pagination = usePagination(filteredDirectors, { itemsPerPage: ITEMS_PER_PAGE });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    totalDirectors: allGroupedDirectors.length,
    activeDirectors: allGroupedDirectors.filter((d) => d.active_venue_count > 0).length,
    archivedDirectors: allGroupedDirectors.filter((d) => d.active_venue_count === 0).length,
    venuesWithDirectors: new Set(
      allGroupedDirectors.flatMap((d) =>
        d.assignments.filter((a) => a.status === "active").map((a) => a.venue_id)
      )
    ).size,
  }), [allGroupedDirectors]);

  const statusCounts = useMemo(() => ({
    all: allGroupedDirectors.length,
    active: allGroupedDirectors.filter((d) => d.active_venue_count > 0).length,
    archived: allGroupedDirectors.filter((d) => d.active_venue_count === 0).length,
  }), [allGroupedDirectors]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAddDirector = async (venueId: number, directorId: number) => {
    if (!profile?.id_auto) return;
    try {
      setProcessing(directorId);
      await directorService.addDirector({ venue_id: venueId, director_id: directorId, assigned_by: profile.id_auto });
      Alert.alert("Success", "Director added successfully");
      setShowAddModal(false);
      await loadData();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to add director");
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveDirector = (director: GroupedDirector) => {
    setSelectedDirector(director);
    setRemoveReason("");
    setShowRemoveModal(true);
  };

  const confirmRemoveDirector = async () => {
    if (!selectedDirector || !profile?.id_auto) return;
    try {
      setProcessing(selectedDirector.director_id);
      const ownerVenueIds = venueOptions.map((v) => v.id);
      await directorService.removeDirectorFromAllVenues(
        selectedDirector.director_id, ownerVenueIds, profile.id_auto
      );
      Alert.alert("Success", "Director removed from all venues");
      setShowRemoveModal(false);
      setSelectedDirector(null);
      await loadData();
    } catch (error) {
      Alert.alert("Error", "Failed to remove director");
    } finally {
      setProcessing(null);
    }
  };

  const handleEditVenues = (director: GroupedDirector) => {
    setEditingDirector(director);
    setShowEditVenuesModal(true);
  };

  const confirmEditVenues = async (selectedVenueIds: number[]) => {
    if (!editingDirector || !profile?.id_auto) return;
    try {
      setProcessing(editingDirector.director_id);
      await directorService.updateDirectorVenues(
        editingDirector.director_id,
        profile.id_auto,
        selectedVenueIds,
        editingDirector.assignments.map((a) => ({ id: a.id, venue_id: a.venue_id, status: a.status }))
      );
      Alert.alert("Success", "Venues updated successfully");
      setShowEditVenuesModal(false);
      setEditingDirector(null);
      await loadData();
    } catch (error) {
      Alert.alert("Error", "Failed to update venues");
    } finally {
      setProcessing(null);
    }
  };

  const handleRestoreDirector = async (director: GroupedDirector) => {
    if (!profile?.id_auto) return;
    try {
      setProcessing(director.director_id);
      const archivedIds = director.assignments.filter((a) => a.status === "archived").map((a) => a.id);
      for (const id of archivedIds) {
        await directorService.restoreDirector(id);
      }
      Alert.alert("Success", "Director restored");
      await loadData();
    } catch (error) {
      Alert.alert("Error", "Failed to restore director");
    } finally {
      setProcessing(null);
    }
  };

  const updateSearch = (search: string) => setFilters((prev) => ({ ...prev, search }));
  const updateStatusFilter = (status: "all" | "active" | "archived") => {
    setFilters((prev) => ({ ...prev, status }));
    pagination.resetPage();
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }, [profile?.id_auto]);

  return {
    loading, refreshing, processing,
    directors: pagination.paginatedItems,
    stats, statusCounts,
    venueOptions, availableDirectors,
    filters,
    pagination,
    showAddModal, setShowAddModal,
    showRemoveModal, setShowRemoveModal,
    showEditVenuesModal, setShowEditVenuesModal,
    selectedDirector, editingDirector,
    removeReason, setRemoveReason,
    handleAddDirector, handleRemoveDirector, confirmRemoveDirector,
    handleEditVenues, confirmEditVenues,
    handleRestoreDirector, loadAvailableDirectors,
    updateSearch, updateStatusFilter, onRefresh,
    canAddDirectors: true,
    canRemoveDirectors: true,
    canViewArchivedDirectors: true,
    currentUser: profile,
  };
};

