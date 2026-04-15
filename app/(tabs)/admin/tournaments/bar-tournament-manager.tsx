// app/(tabs)/admin/tournaments/bar-tournament-manager.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { supabase } from "../../../../src/lib/supabase";
import { useAuthContext } from "../../../../src/providers/AuthProvider";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { moderateScale, scale } from "../../../../src/utils/scaling";
import { usePagination } from "../../../../src/viewmodels/hooks/use.pagination";
import { DirectorSearchResult } from "../../../../src/viewmodels/useAdminTournaments";
import {
  BarTournamentWithStats,
  SortOption,
  TournamentStatusFilter,
  useBarTournamentManager,
} from "../../../../src/viewmodels/useBarTournamentManager";
import { Pagination } from "../../../../src/views/components/common/pagination";
import { ReassignDirectorModal } from "../../../../src/views/components/common/reassign-director-modal";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";
import { TournamentCard } from "../../../../src/views/components/tournament";
import { TournamentDetailModal } from "../../../../src/views/components/tournament/TournamentDetailModal";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "name", label: "A-Z" },
];

const DeleteModal = ({
  visible,
  tournamentName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  tournamentName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) => {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!reason.trim()) {
      Alert.alert("Required", "Please enter a deletion reason.");
      return;
    }
    onConfirm(reason.trim());
    setReason("");
  };

  const handleCancel = () => {
    setReason("");
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text allowFontScaling={false} style={styles.modalTitle}>Delete Tournament</Text>
          <Text allowFontScaling={false} style={styles.modalSubtitle}>{`"${tournamentName}"`}</Text>
          <Text allowFontScaling={false} style={styles.modalLabel}>Deletion Reason *</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Enter reason for deletion..."
            placeholderTextColor={COLORS.textSecondary}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalButtonCancel} onPress={handleCancel}>
              <Text allowFontScaling={false} style={styles.modalButtonCancelText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButtonConfirm} onPress={handleConfirm}>
              <Text allowFontScaling={false} style={styles.modalButtonConfirmText}>Delete Tournament</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function BarTournamentManagerScreen() {
  const router = useRouter();
  const vm = useBarTournamentManager();
  const { profile } = useAuthContext();

  // Tournament detail modal
  const [detailId, setDetailId] = useState<string | null>(null);

  // Cancel modal state
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [tournamentToCancel, setTournamentToCancel] = useState<BarTournamentWithStats | null>(null);

  // Reassign modal state
  const [reassignModalVisible, setReassignModalVisible] = useState(false);
  const [tournamentToReassign, setTournamentToReassign] = useState<BarTournamentWithStats | null>(null);
  const [directorResults, setDirectorResults] = useState<DirectorSearchResult[]>([]);
  const [searchingDirectors, setSearchingDirectors] = useState(false);

  // Pagination
  const pagination = usePagination(vm.tournaments, { itemsPerPage: 10 });
  const listRef = useRef<any>(null);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [pagination.currentPage]);

  const handleStatusFilter = (filter: TournamentStatusFilter) => {
    vm.setStatusFilter(filter);
    pagination.resetPage();
  };

  const handleSortOption = (sort: SortOption) => {
    if (vm.sortOption === sort) {
      vm.setSortDirection(vm.sortDirection === "desc" ? "asc" : "desc");
    } else {
      vm.setSortOption(sort);
      vm.setSortDirection(sort === "date" ? "desc" : "asc");
    }
    pagination.resetPage();
  };

  const handleSearch = (query: string) => {
    vm.setSearchQuery(query);
    pagination.resetPage();
  };

  const handleEditTournament = (tournamentId: number) => {
    router.push({
      pathname: "/(tabs)/admin/edit-tournament/[id]",
      params: { id: tournamentId.toString() },
    } as any);
  };

  const handleArchiveTournament = (tournament: BarTournamentWithStats) => {
    Alert.alert(
      "Archive Tournament",
      `Are you sure you want to archive "${tournament.name}"? It will be hidden from public view but can be restored later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            const success = await vm.archiveTournament(tournament.id);
            if (success) {
              Alert.alert("Success", "Tournament archived successfully.");
            } else {
              Alert.alert("Error", "Failed to archive tournament.");
            }
          },
        },
      ],
    );
  };

  const handleDeleteTournament = (tournament: BarTournamentWithStats) => {
    setTournamentToCancel(tournament);
    setCancelModalVisible(true);
  };

  const handleConfirmDelete = async (reason: string) => {
    if (!tournamentToCancel) return;
    const success = await vm.cancelTournament(tournamentToCancel.id, reason);
    setCancelModalVisible(false);
    setTournamentToCancel(null);
    if (success) {
      Alert.alert("Success", "Tournament deleted successfully.");
    } else {
      Alert.alert("Error", "Failed to delete tournament.");
    }
  };

  const handleRestoreTournament = (tournament: BarTournamentWithStats) => {
    Alert.alert(
      "Restore Tournament",
      `Are you sure you want to restore "${tournament.name}" to active status?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            const success = await vm.restoreTournament(tournament.id);
            if (success) {
              Alert.alert("Success", "Tournament restored successfully.");
            } else {
              Alert.alert("Error", "Failed to restore tournament.");
            }
          },
        },
      ],
    );
  };

  const handleSearchDirectors = useCallback(async (query: string) => {
    if (query.length < 2) { setDirectorResults([]); return; }
    setSearchingDirectors(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_auto, name, email")
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);
      if (error) { setDirectorResults([]); return; }
      setDirectorResults(
        (data || []).map((u: any) => ({ id: u.id_auto, name: u.name || u.email, email: u.email })),
      );
    } catch {
      setDirectorResults([]);
    } finally {
      setSearchingDirectors(false);
    }
  }, []);

  const handleConfirmReassign = useCallback(
    async (newDirectorId: number, newDirectorName: string, reason: string) => {
      if (!tournamentToReassign || !profile?.id_auto) return;
      try {
        const { error: updateError } = await supabase
          .from("tournaments")
          .update({ director_id: newDirectorId })
          .eq("id", tournamentToReassign.id);
        if (updateError) throw updateError;

        await supabase.from("reassignment_logs").insert({
          entity_type: "tournament_director",
          entity_id: tournamentToReassign.id,
          entity_name: tournamentToReassign.name,
          previous_user_id: tournamentToReassign.director_id,
          previous_user_name: tournamentToReassign.director_name,
          new_user_id: newDirectorId,
          new_user_name: newDirectorName,
          reason,
          reassigned_by: profile.id_auto,
          reassigned_by_name: profile.name || null,
        });

        await supabase.from("venue_directors").upsert(
          { venue_id: tournamentToReassign.venue_id, director_id: newDirectorId, assigned_by: profile.id_auto },
          { onConflict: "venue_id,director_id" },
        );

        const { data: newDirProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id_auto", newDirectorId)
          .single();
        if (newDirProfile && newDirProfile.role === "basic_user") {
          await supabase.from("profiles").update({ role: "tournament_director" }).eq("id_auto", newDirectorId);
        }

        setReassignModalVisible(false);
        setTournamentToReassign(null);
        setDirectorResults([]);
        Alert.alert("Reassignment Complete", `"${tournamentToReassign.name}" has been reassigned to ${newDirectorName}.`);
        vm.onRefresh();
      } catch (error) {
        console.error("Error reassigning director:", error);
        Alert.alert("Error", "Failed to reassign director.");
      }
    },
    [tournamentToReassign, profile?.id_auto, profile?.name],
  );

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading tournaments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tournament Detail Modal */}
      <TournamentDetailModal
        id={detailId}
        visible={detailId !== null}
        onClose={() => setDetailId(null)}
      />

      {/* Delete Modal */}
      <DeleteModal
        visible={cancelModalVisible}
        tournamentName={tournamentToCancel?.name || ""}
        onCancel={() => { setCancelModalVisible(false); setTournamentToCancel(null); }}
        onConfirm={handleConfirmDelete}
      />

      {/* Reassign Director Modal */}
      <ReassignDirectorModal
        visible={reassignModalVisible}
        tournamentName={tournamentToReassign?.name || ""}
        currentDirector={tournamentToReassign?.director_name || ""}
        directors={directorResults}
        loadingDirectors={searchingDirectors}
        onSearch={handleSearchDirectors}
        onCancel={() => { setReassignModalVisible(false); setTournamentToReassign(null); setDirectorResults([]); }}
        onConfirm={handleConfirmReassign}
      />

      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text allowFontScaling={false} style={styles.headerTitle}>Tournament Manager</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>Managing tournaments at your venues</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text allowFontScaling={false} style={styles.searchIcon}>{"\uD83D\uDD0D"}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, game type, venue, or director..."
            placeholderTextColor={COLORS.textSecondary}
            value={vm.searchQuery}
            onChangeText={handleSearch}
          />
        </View>
      </View>

      {/* Status Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {[
            { key: "active" as const, label: "Active", count: vm.statusCounts.active },
            { key: "completed" as const, label: "Completed", count: vm.statusCounts.completed },
            { key: "cancelled" as const, label: "Cancelled", count: vm.statusCounts.cancelled },
            { key: "archived" as const, label: "Archived", count: vm.statusCounts.archived },
            { key: "all" as const, label: "All", count: vm.statusCounts.all },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, vm.statusFilter === tab.key && styles.tabActive]}
              onPress={() => handleStatusFilter(tab.key)}
            >
              <Text
                allowFontScaling={false}
                style={[styles.tabText, vm.statusFilter === tab.key && styles.tabTextActive]}
              >
                {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text allowFontScaling={false} style={styles.sortLabel}>Sort:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortOptions}>
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.sortPill, vm.sortOption === option.key && styles.sortPillActive]}
              onPress={() => handleSortOption(option.key)}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sortPillText, vm.sortOption === option.key && styles.sortPillTextActive]}
              >
                {vm.sortOption === option.key && option.key === "name"
                  ? (vm.sortDirection === "asc" ? "A-Z" : "Z-A")
                  : option.label}
                {vm.sortOption === option.key && option.key === "date"
                  ? (vm.sortDirection === "desc" ? " \u25BC" : " \u25B2")
                  : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Pagination */}
      <Pagination
        totalCount={pagination.totalCount}
        displayStart={pagination.displayRange.start}
        displayEnd={pagination.displayRange.end}
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        onPrevPage={pagination.prevPage}
        onNextPage={pagination.nextPage}
        canGoPrev={pagination.canGoPrev}
        canGoNext={pagination.canGoNext}
      />

      {/* Tournament List */}
      <FlatList
        ref={listRef}
        data={pagination.paginatedItems}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing} onRefresh={vm.onRefresh} tintColor={COLORS.primary} />
          )
        }
        renderItem={({ item }) => (
          <View>
            <TournamentCard
              tournament={item}
              onPress={() => setDetailId(String(item.id))}
              onEdit={() => handleEditTournament(item.id)}
              onArchive={() => handleArchiveTournament(item)}
              onCancel={() => handleDeleteTournament(item)}
              onRestore={() => handleRestoreTournament(item)}
              isProcessing={vm.processing === item.id}
              showActions={true}
            />
            <TouchableOpacity
              style={styles.reassignBtn}
              onPress={() => { setTournamentToReassign(item); setReassignModalVisible(true); }}
            >
              <Text allowFontScaling={false} style={styles.reassignBtnText}>
                {"\uD83D\uDD04"} Reassign Director
              </Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            message={
              vm.statusFilter === "active" ? "No active tournaments at your venues"
              : vm.statusFilter === "completed" ? "No completed tournaments"
              : vm.statusFilter === "cancelled" ? "No cancelled tournaments"
              : vm.statusFilter === "archived" ? "No archived tournaments"
              : "No tournaments found"
            }
            submessage="Try adjusting your search or filters"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: { paddingBottom: SPACING.xl },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: { paddingTop: SPACING.lg },
  backButton: { padding: SPACING.xs },
  backText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: { alignItems: "center" },
  headerTitle: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: wxSc(2),
  },
  placeholder: { width: wxSc(50) },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(8),
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: wxSc(40),
  },
  searchIcon: {
    fontSize: wxMs(14),
    marginRight: SPACING.sm,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    height: wxSc(40),
  },
  tabsContainer: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsContent: {
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    minHeight: wxSc(48),
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginRight: SPACING.xs,
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sortLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginRight: SPACING.sm,
  },
  sortOptions: {
    flexDirection: "row",
    gap: SPACING.xs,
  },
  sortPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: wxSc(16),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortPillActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  sortPillText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
  },
  sortPillTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  reassignBtn: {
    backgroundColor: "#FF980020",
    borderWidth: 1,
    borderColor: "#FF9800",
    borderRadius: wxSc(8),
    paddingVertical: SPACING.sm,
    alignItems: "center",
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.xs,
  },
  reassignBtnText: {
    color: "#FF9800",
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(12),
    padding: SPACING.lg,
    width: "100%",
    maxWidth: wxSc(400),
  },
  modalTitle: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  modalSubtitle: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  modalLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: wxSc(8),
    padding: SPACING.sm,
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: wxSc(80),
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: wxSc(8),
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtonCancelText: {
    color: COLORS.text,
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  modalButtonConfirm: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: wxSc(8),
    alignItems: "center",
    backgroundColor: COLORS.error,
  },
  modalButtonConfirmText: {
    color: "#FFFFFF",
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
});