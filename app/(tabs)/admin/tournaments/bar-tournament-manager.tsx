import { useRouter } from "expo-router";
import React, { useState } from "react";
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
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { usePagination } from "../../../../src/viewmodels/hooks/use.pagination";
import {
  BarTournamentWithStats,
  SortOption,
  TournamentStatusFilter,
  useBarTournamentManager,
} from "../../../../src/viewmodels/useBarTournamentManager";
import { Pagination } from "../../../../src/views/components/common/pagination";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";
import { TournamentCard } from "../../../../src/views/components/tournament";

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "name", label: "A-Z" },
];

// Delete Reason Modal Component
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
          <Text style={styles.modalTitle}>Delete Tournament</Text>
          <Text style={styles.modalSubtitle}>"{tournamentName}"</Text>

          <Text style={styles.modalLabel}>Deletion Reason *</Text>
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
            <TouchableOpacity
              style={styles.modalButtonCancel}
              onPress={handleCancel}
            >
              <Text style={styles.modalButtonCancelText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalButtonConfirm}
              onPress={handleConfirm}
            >
              <Text style={styles.modalButtonConfirmText}>
                Delete Tournament
              </Text>
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

  // Cancel modal state
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [tournamentToCancel, setTournamentToCancel] =
    useState<BarTournamentWithStats | null>(null);

  // Pagination
  const pagination = usePagination(vm.tournaments, {
    itemsPerPage: 10,
  });

  const handleStatusFilter = (filter: TournamentStatusFilter) => {
    vm.setStatusFilter(filter);
    pagination.resetPage();
  };

  const handleSortOption = (sort: SortOption) => {
    vm.setSortOption(sort);
    pagination.resetPage();
  };

  const handleSearch = (query: string) => {
    vm.setSearchQuery(query);
    pagination.resetPage();
  };

  const handleTournamentPress = (tournamentId: number) => {
    router.push({
      pathname: "/(tabs)/admin/tournament-detail",
      params: { id: tournamentId.toString() },
    } as any);
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

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading tournaments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Delete Modal */}
      <DeleteModal
        visible={cancelModalVisible}
        tournamentName={tournamentToCancel?.name || ""}
        onCancel={() => {
          setCancelModalVisible(false);
          setTournamentToCancel(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Tournament Manager</Text>
          <Text style={styles.headerSubtitle}>
            Managing tournaments at your venues
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, game type, venue, or director..."
            placeholderTextColor={COLORS.textSecondary}
            value={vm.searchQuery}
            onChangeText={handleSearch}
          />
        </View>
      </View>

      {/* Status Tabs - Fixed positioning */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          <TouchableOpacity
            style={[
              styles.tab,
              vm.statusFilter === "active" && styles.tabActive,
            ]}
            onPress={() => handleStatusFilter("active")}
          >
            <Text
              style={[
                styles.tabText,
                vm.statusFilter === "active" && styles.tabTextActive,
              ]}
            >
              Active
              {vm.statusCounts.active > 0 ? ` (${vm.statusCounts.active})` : ""}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              vm.statusFilter === "completed" && styles.tabActive,
            ]}
            onPress={() => handleStatusFilter("completed")}
          >
            <Text
              style={[
                styles.tabText,
                vm.statusFilter === "completed" && styles.tabTextActive,
              ]}
            >
              Completed
              {vm.statusCounts.completed > 0
                ? ` (${vm.statusCounts.completed})`
                : ""}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              vm.statusFilter === "cancelled" && styles.tabActive,
            ]}
            onPress={() => handleStatusFilter("cancelled")}
          >
            <Text
              style={[
                styles.tabText,
                vm.statusFilter === "cancelled" && styles.tabTextActive,
              ]}
            >
              Cancelled
              {vm.statusCounts.cancelled > 0
                ? ` (${vm.statusCounts.cancelled})`
                : ""}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              vm.statusFilter === "archived" && styles.tabActive,
            ]}
            onPress={() => handleStatusFilter("archived")}
          >
            <Text
              style={[
                styles.tabText,
                vm.statusFilter === "archived" && styles.tabTextActive,
              ]}
            >
              Archived
              {vm.statusCounts.archived > 0
                ? ` (${vm.statusCounts.archived})`
                : ""}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, vm.statusFilter === "all" && styles.tabActive]}
            onPress={() => handleStatusFilter("all")}
          >
            <Text
              style={[
                styles.tabText,
                vm.statusFilter === "all" && styles.tabTextActive,
              ]}
            >
              All{vm.statusCounts.all > 0 ? ` (${vm.statusCounts.all})` : ""}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortOptions}
        >
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.sortPill,
                vm.sortOption === option.key && styles.sortPillActive,
              ]}
              onPress={() => handleSortOption(option.key)}
            >
              <Text
                style={[
                  styles.sortPillText,
                  vm.sortOption === option.key && styles.sortPillTextActive,
                ]}
              >
                {option.label}
                {vm.sortOption === option.key && " ▼"}
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
        data={pagination.paginatedItems}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        }
        renderItem={({ item }) => (
          <TournamentCard
            tournament={item}
            onPress={() => handleTournamentPress(item.id)}
            onEdit={() => handleEditTournament(item.id)}
            onArchive={() => handleArchiveTournament(item)}
            onCancel={() => handleDeleteTournament(item)}
            onRestore={() => handleRestoreTournament(item)}
            isProcessing={vm.processing === item.id}
            showActions={true}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            message={
              vm.statusFilter === "active"
                ? "No active tournaments at your venues"
                : vm.statusFilter === "completed"
                  ? "No completed tournaments"
                  : vm.statusFilter === "cancelled"
                    ? "No cancelled tournaments"
                    : vm.statusFilter === "archived"
                      ? "No archived tournaments"
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
  container: {
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
    fontSize: FONT_SIZES.md,
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
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: 2,
  },
  placeholder: {
    width: 50,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: SPACING.sm,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    height: 40,
  },

  // FIXED: Tabs container - proper positioning above search
  tabsContainer: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    // Removed any absolute positioning or negative margins
  },
  tabsContent: {
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginRight: SPACING.xs,
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.md,
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
    fontSize: FONT_SIZES.sm,
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
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortPillActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  sortPillText: {
    fontSize: FONT_SIZES.sm,
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

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  modalLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 80,
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
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtonCancelText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  modalButtonConfirm: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: COLORS.error,
  },
  modalButtonConfirmText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});
