import { useRouter } from "expo-router";
import { useState } from "react";
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
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { usePagination } from "../../../src/viewmodels/hooks/use.pagination";
import {
  AdminTournamentWithStats,
  SortOption,
  TournamentStatusFilter,
  useAdminTournaments,
} from "../../../src/viewmodels/useAdminTournaments";
import { Pagination } from "../../../src/views/components/common/pagination";
import { EmptyState } from "../../../src/views/components/dashboard/empty-state";

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "name", label: "A-Z" },
];

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatTime = (timeString: string): string => {
  if (!timeString) return "";
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case "active":
      return COLORS.success;
    case "completed":
      return COLORS.primary;
    case "cancelled":
      return COLORS.error;
    case "archived":
      return COLORS.textSecondary;
    default:
      return COLORS.textSecondary;
  }
};

// Cancel Reason Modal Component
const CancelModal = ({
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
      Alert.alert("Required", "Please enter a cancellation reason.");
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
          <Text style={styles.modalTitle}>Cancel Tournament</Text>
          <Text style={styles.modalSubtitle}>"{tournamentName}"</Text>

          <Text style={styles.modalLabel}>Cancellation Reason *</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Enter reason for cancellation..."
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
                Cancel Tournament
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Tournament Card Component
const TournamentCard = ({
  tournament,
  onPress,
  onEdit,
  onArchive,
  onCancel,
  onRestore,
  isProcessing,
}: {
  tournament: AdminTournamentWithStats;
  onPress: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onCancel: () => void;
  onRestore: () => void;
  isProcessing: boolean;
}) => {
  const statusColor = getStatusColor(tournament.status);
  const isArchived = tournament.status === "archived";
  const isCancelled = tournament.status === "cancelled";
  const isActive = tournament.status === "active";
  const isCompleted = tournament.status === "completed";

  return (
    <TouchableOpacity
      style={[styles.card, isArchived && styles.cardArchived]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Header: Name and Status */}
      <View style={styles.cardHeader}>
        <Text
          style={[styles.tournamentName, isArchived && styles.textArchived]}
          numberOfLines={1}
        >
          {tournament.name}
        </Text>
        <View
          style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {tournament.status}
          </Text>
        </View>
      </View>

      {/* Game Type & Format */}
      <Text style={[styles.gameType, isArchived && styles.textArchived]}>
        {tournament.game_type} •{" "}
        {tournament.tournament_format.replace("_", " ")}
      </Text>

      {/* Date & Time */}
      <View style={styles.infoRow}>
        <Text style={styles.infoIcon}>📅</Text>
        <Text style={[styles.infoText, isArchived && styles.textArchived]}>
          {formatDate(tournament.tournament_date)}
          {tournament.start_time && ` at ${formatTime(tournament.start_time)}`}
        </Text>
      </View>

      {/* Venue */}
      <View style={styles.infoRow}>
        <Text style={styles.infoIcon}>📍</Text>
        <Text
          style={[styles.infoText, isArchived && styles.textArchived]}
          numberOfLines={1}
        >
          {tournament.venue_name}
        </Text>
      </View>

      {/* Director */}
      <View style={styles.infoRow}>
        <Text style={styles.infoIcon}>👤</Text>
        <Text style={[styles.infoText, isArchived && styles.textArchived]}>
          TD: {tournament.director_name}
        </Text>
      </View>

      {/* Cancellation Info */}
      {isCancelled && tournament.cancelled_at && (
        <View style={styles.statusInfoBox}>
          <Text style={styles.statusInfoTitle}>❌ Cancelled</Text>
          <Text style={styles.statusInfoText}>
            By: {tournament.cancelled_by_name || "Unknown"}
          </Text>
          <Text style={styles.statusInfoText}>
            On: {formatDateTime(tournament.cancelled_at)}
          </Text>
          {tournament.cancellation_reason && (
            <Text style={styles.statusInfoReason}>
              Reason: {tournament.cancellation_reason}
            </Text>
          )}
        </View>
      )}

      {/* Archived Info */}
      {isArchived && tournament.archived_at && (
        <View style={[styles.statusInfoBox, styles.statusInfoBoxArchived]}>
          <Text style={styles.statusInfoTitle}>📦 Archived</Text>
          <Text style={styles.statusInfoText}>
            By: {tournament.archived_by_name || "Unknown"}
          </Text>
          <Text style={styles.statusInfoText}>
            On: {formatDateTime(tournament.archived_at)}
          </Text>
        </View>
      )}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, isArchived && styles.textArchived]}>
            {tournament.views_count}
          </Text>
          <Text style={styles.statLabel}>Views</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, isArchived && styles.textArchived]}>
            {tournament.favorites_count}
          </Text>
          <Text style={styles.statLabel}>Favorites</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {/* Edit - always available */}
        <TouchableOpacity
          style={[styles.actionButton, styles.editButton]}
          onPress={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          disabled={isProcessing}
        >
          <Text style={styles.editButtonText}>✏️ Edit</Text>
        </TouchableOpacity>

        {/* Active tournaments: Cancel or Archive */}
        {isActive && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              disabled={isProcessing}
            >
              <Text style={styles.cancelButtonText}>
                {isProcessing ? "..." : "❌ Cancel"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.archiveButton]}
              onPress={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              disabled={isProcessing}
            >
              <Text style={styles.archiveButtonText}>
                {isProcessing ? "..." : "📦 Archive"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Completed tournaments: Archive */}
        {isCompleted && (
          <TouchableOpacity
            style={[styles.actionButton, styles.archiveButton]}
            onPress={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            disabled={isProcessing}
          >
            <Text style={styles.archiveButtonText}>
              {isProcessing ? "..." : "📦 Archive"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Cancelled or Archived: Restore */}
        {(isCancelled || isArchived) && (
          <TouchableOpacity
            style={[styles.actionButton, styles.restoreButton]}
            onPress={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            disabled={isProcessing}
          >
            <Text style={styles.restoreButtonText}>
              {isProcessing ? "..." : "♻️ Restore"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default function TournamentManagementScreen() {
  const router = useRouter();
  const vm = useAdminTournaments();

  // Cancel modal state
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [tournamentToCancel, setTournamentToCancel] =
    useState<AdminTournamentWithStats | null>(null);

  // Pagination
  const pagination = usePagination(vm.filteredTournaments, {
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

  const handleArchiveTournament = (tournament: AdminTournamentWithStats) => {
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

  const handleCancelTournament = (tournament: AdminTournamentWithStats) => {
    setTournamentToCancel(tournament);
    setCancelModalVisible(true);
  };

  const handleConfirmCancel = async (reason: string) => {
    if (!tournamentToCancel) return;

    const success = await vm.cancelTournament(tournamentToCancel.id, reason);
    setCancelModalVisible(false);
    setTournamentToCancel(null);

    if (success) {
      Alert.alert("Success", "Tournament cancelled successfully.");
    } else {
      Alert.alert("Error", "Failed to cancel tournament.");
    }
  };

  const handleRestoreTournament = (tournament: AdminTournamentWithStats) => {
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
      {/* Cancel Modal */}
      <CancelModal
        visible={cancelModalVisible}
        tournamentName={tournamentToCancel?.name || ""}
        onCancel={() => {
          setCancelModalVisible(false);
          setTournamentToCancel(null);
        }}
        onConfirm={handleConfirmCancel}
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
          <Text style={styles.headerTitle}>TOURNAMENT MANAGEMENT</Text>
          <Text style={styles.headerSubtitle}>
            {vm.totalCount} total tournaments
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

      {/* Status Tabs */}
      <View style={styles.tabsWrapper}>
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
            onCancel={() => handleCancelTournament(item)}
            onRestore={() => handleRestoreTournament(item)}
            isProcessing={vm.processing === item.id}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            message={
              vm.statusFilter === "active"
                ? "No active tournaments"
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
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
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
  tabsWrapper: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
    alignItems: "center",
    minHeight: 48,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
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
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardArchived: {
    opacity: 0.7,
    borderColor: COLORS.textSecondary,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  tournamentName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  textArchived: {
    color: COLORS.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  gameType: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    textTransform: "capitalize",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  infoIcon: {
    fontSize: FONT_SIZES.sm,
    marginRight: SPACING.xs,
    width: 20,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
  statusInfoBox: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.error,
  },
  statusInfoBoxArchived: {
    borderLeftColor: COLORS.textSecondary,
  },
  statusInfoTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
  },
  statusInfoText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  statusInfoReason: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    marginTop: 4,
    fontStyle: "italic",
  },
  statsRow: {
    flexDirection: "row",
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.lg,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.xs,
    flexWrap: "wrap",
  },
  actionButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    minWidth: 80,
  },
  editButton: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  editButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: COLORS.error + "20",
    borderColor: COLORS.error,
  },
  cancelButtonText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  archiveButton: {
    backgroundColor: COLORS.textSecondary + "20",
    borderColor: COLORS.textSecondary,
  },
  archiveButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  restoreButton: {
    backgroundColor: COLORS.success + "20",
    borderColor: COLORS.success,
  },
  restoreButtonText: {
    color: COLORS.success,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
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
