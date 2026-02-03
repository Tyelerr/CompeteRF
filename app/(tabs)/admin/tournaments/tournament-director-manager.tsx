import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useTournamentDirectorManager } from "../../../../src/viewmodels/useTournamentDirectorManager";
import { EmptyState } from "../../../../src/views/components/dashboard";
import { TournamentCard } from "../../../../src/views/components/tournament";

const PAGE_SIZE = 10; // 10 tournaments per page

const StatusTab = ({
  label,
  count,
  isActive,
  onPress,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    style={[styles.statusTab, isActive && styles.statusTabActive]}
    onPress={onPress}
  >
    <Text
      style={[styles.statusTabText, isActive && styles.statusTabTextActive]}
    >
      {label}
    </Text>
    <Text
      style={[styles.statusTabCount, isActive && styles.statusTabCountActive]}
    >
      {count}
    </Text>
  </TouchableOpacity>
);

export default function TDTournamentsScreen() {
  const router = useRouter();
  const vm = useTournamentDirectorManager();

  // Page-based pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [paginatedTournaments, setPaginatedTournaments] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [processingTournamentId, setProcessingTournamentId] = useState<
    number | null
  >(null);

  // Update pagination when tournaments change
  useEffect(() => {
    // Reset to page 1 when filters change
    const newCurrentPage = 1;
    setCurrentPage(newCurrentPage);

    // Calculate total pages
    const newTotalPages = Math.ceil(vm.tournaments.length / PAGE_SIZE);
    setTotalPages(newTotalPages);

    // Get current page data
    const startIndex = (newCurrentPage - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pageData = vm.tournaments.slice(startIndex, endIndex);

    setPaginatedTournaments(pageData);
  }, [
    vm.tournaments,
    vm.statusFilter,
    vm.searchQuery,
    vm.sortOption,
    vm.sortDirection,
  ]);

  // Handle page navigation
  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;

    setCurrentPage(page);
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pageData = vm.tournaments.slice(startIndex, endIndex);
    setPaginatedTournaments(pageData);
  };

  const goToNextPage = () => goToPage(currentPage + 1);
  const goToPreviousPage = () => goToPage(currentPage - 1);

  // Enhanced action handlers
  const handleEdit = (tournament: any) => {
    router.push(`/(tabs)/admin/edit-tournament/${tournament.id}` as any);
  };

  const handleCancel = async (tournament: any) => {
    Alert.alert(
      "Cancel Tournament",
      `Are you sure you want to cancel "${tournament.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Cancel",
          style: "destructive",
          onPress: async () => {
            setProcessingTournamentId(tournament.id);
            try {
              const success = await vm.cancelTournament(
                tournament.id,
                "Cancelled by director",
              );
              if (success) {
                Alert.alert("Success", "Tournament cancelled.");
              } else {
                Alert.alert("Error", "Failed to cancel tournament.");
              }
            } finally {
              setProcessingTournamentId(null);
            }
          },
        },
      ],
    );
  };

  const handleArchive = async (tournament: any) => {
    Alert.alert("Archive Tournament", `Archive "${tournament.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        onPress: async () => {
          setProcessingTournamentId(tournament.id);
          try {
            const success = await vm.archiveTournament(tournament.id);
            if (success) {
              Alert.alert("Success", "Tournament archived.");
            } else {
              Alert.alert("Error", "Failed to archive tournament.");
            }
          } finally {
            setProcessingTournamentId(null);
          }
        },
      },
    ]);
  };

  const handleRestore = async (tournament: any) => {
    setProcessingTournamentId(tournament.id);
    try {
      const success = await vm.restoreTournament(tournament.id);
      if (success) {
        Alert.alert("Success", "Tournament restored.");
      } else {
        Alert.alert("Error", "Failed to restore tournament.");
      }
    } finally {
      setProcessingTournamentId(null);
    }
  };

  // Handle tournament card tap - show full tournament details
  const handleTournamentPress = (tournament: any) => {
    // Show alert with full tournament info (like billiards page detail view)
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    const formatTime = (timeStr: string) => {
      if (!timeStr) return "Time TBD";
      const [hours, minutes] = timeStr.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    };

    const getStatusEmoji = (status: string) => {
      switch (status) {
        case "active":
          return "▶️";
        case "completed":
          return "✅";
        case "cancelled":
          return "❌";
        case "archived":
          return "📁";
        default:
          return "🏆";
      }
    };

    Alert.alert(
      `${getStatusEmoji(tournament.status)} ${tournament.name}`,
      `ID: ${tournament.id}

📅 Date: ${formatDate(tournament.tournament_date)}
🕐 Time: ${formatTime(tournament.start_time)}
🎱 Game: ${tournament.game_type}
🏆 Format: ${tournament.tournament_format}
🏢 Venue: ${tournament.venue_name}
👤 Director: ${tournament.director_name}

📊 Stats:
• Views: ${tournament.views_count}
• Favorites: ${tournament.favorites_count}
• Status: ${tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}

${tournament.description || "No additional details available."}`,
      [
        { text: "Close", style: "cancel" },
        {
          text: "Edit",
          onPress: () => handleEdit(tournament),
        },
      ],
    );
  };

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading tournaments...</Text>
      </View>
    );
  }

  const renderTournament = ({ item }: { item: any }) => (
    <View style={styles.cardContainer}>
      <TournamentCard
        tournament={item}
        onPress={() => handleTournamentPress(item)}
        onEdit={() => handleEdit(item)}
        onCancel={() => handleCancel(item)}
        onArchive={() => handleArchive(item)}
        onRestore={() => handleRestore(item)}
        isProcessing={processingTournamentId === item.id}
        showActions={true}
      />
    </View>
  );

  const getEmptyStateMessage = () => {
    if (vm.searchQuery) {
      return {
        message: "No tournaments match your search",
        submessage: `Try adjusting your search terms.`,
      };
    }

    switch (vm.statusFilter) {
      case "active":
        return {
          message: "No active tournaments",
          submessage: "Your active tournaments will appear here.",
        };
      case "completed":
        return {
          message: "No completed tournaments",
          submessage: "Finished tournaments will appear here.",
        };
      case "archived":
        return {
          message: "No archived tournaments",
          submessage: "Archived tournaments will appear here.",
        };
      default:
        return {
          message: "No tournaments found",
          submessage: "Your tournaments will appear here.",
        };
    }
  };

  const emptyState = getEmptyStateMessage();

  // Calculate display range
  const startIndex = (currentPage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(currentPage * PAGE_SIZE, vm.tournaments.length);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Tournaments</Text>
          <Text style={styles.headerSubtitle}>Tap cards for full details</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search tournaments..."
            placeholderTextColor={COLORS.textMuted}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
          />
          {vm.searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchButton}
              onPress={() => vm.setSearchQuery("")}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters Row */}
      <View style={styles.filtersRow}>
        {/* Status Tabs */}
        <View style={styles.statusTabs}>
          <StatusTab
            label="Active"
            count={vm.statusCounts.active}
            isActive={vm.statusFilter === "active"}
            onPress={() => vm.setStatusFilter("active")}
          />
          <StatusTab
            label="Done"
            count={vm.statusCounts.completed}
            isActive={vm.statusFilter === "completed"}
            onPress={() => vm.setStatusFilter("completed")}
          />
          <StatusTab
            label="Archived"
            count={vm.statusCounts.archived}
            isActive={vm.statusFilter === "archived"}
            onPress={() => vm.setStatusFilter("archived")}
          />
          <StatusTab
            label="All"
            count={vm.statusCounts.all}
            isActive={vm.statusFilter === "all"}
            onPress={() => vm.setStatusFilter("all")}
          />
        </View>

        {/* Toggle Sort Options */}
        <View style={styles.sortContainer}>
          <TouchableOpacity
            style={[
              styles.sortButton,
              vm.sortOption === "date" && styles.sortButtonActive,
            ]}
            onPress={() => vm.handleSortOptionChange("date")}
          >
            <Text
              style={[
                styles.sortButtonText,
                vm.sortOption === "date" && styles.sortButtonTextActive,
              ]}
            >
              {vm.getSortLabel("date")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sortButton,
              vm.sortOption === "name" && styles.sortButtonActive,
            ]}
            onPress={() => vm.handleSortOptionChange("name")}
          >
            <Text
              style={[
                styles.sortButtonText,
                vm.sortOption === "name" && styles.sortButtonTextActive,
              ]}
            >
              {vm.getSortLabel("name")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Pagination Info - Like Billiards Page */}
      {vm.tournaments.length > 0 && (
        <View style={styles.paginationInfo}>
          <Text style={styles.paginationInfoText}>
            Total count: {vm.tournaments.length} Displaying {startIndex}-
            {endIndex}
          </Text>
          <View style={styles.paginationControls}>
            <TouchableOpacity
              style={[
                styles.paginationButton,
                currentPage === 1 && styles.paginationButtonDisabled,
              ]}
              onPress={goToPreviousPage}
              disabled={currentPage === 1}
            >
              <Text
                style={[
                  styles.paginationButtonText,
                  currentPage === 1 && styles.paginationButtonTextDisabled,
                ]}
              >
                &lt;
              </Text>
            </TouchableOpacity>
            <Text style={styles.paginationPageText}>
              Page {currentPage} / {totalPages}
            </Text>
            <TouchableOpacity
              style={[
                styles.paginationButton,
                currentPage === totalPages && styles.paginationButtonDisabled,
              ]}
              onPress={goToNextPage}
              disabled={currentPage === totalPages}
            >
              <Text
                style={[
                  styles.paginationButtonText,
                  currentPage === totalPages &&
                    styles.paginationButtonTextDisabled,
                ]}
              >
                &gt;
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tournaments List */}
      <FlatList
        data={paginatedTournaments}
        renderItem={renderTournament}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            message={emptyState.message}
            submessage={emptyState.submessage}
          />
        }
        showsVerticalScrollIndicator={false}
        scrollEnabled={paginatedTournaments.length > 0}
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
    marginTop: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  backButton: {
    padding: SPACING.xs,
    borderRadius: 6,
    backgroundColor: COLORS.background,
  },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  placeholder: {
    width: 50,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
  },
  searchIcon: {
    fontSize: FONT_SIZES.sm,
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  clearSearchButton: {
    padding: SPACING.xs,
  },
  clearSearchText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  filtersRow: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  statusTabs: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.xs,
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  statusTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: 6,
    alignItems: "center",
  },
  statusTabActive: {
    backgroundColor: COLORS.primary,
  },
  statusTabText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  statusTabTextActive: {
    color: COLORS.white,
  },
  statusTabCount: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  statusTabCountActive: {
    color: COLORS.white,
    opacity: 0.9,
  },
  sortContainer: {
    flexDirection: "row",
    gap: SPACING.sm,
    justifyContent: "center",
  },
  sortButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sortButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  sortButtonTextActive: {
    color: COLORS.white,
  },
  paginationInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  paginationInfoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  paginationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  paginationButton: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  paginationButtonTextDisabled: {
    color: COLORS.textMuted,
  },
  paginationPageText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  cardContainer: {
    marginBottom: SPACING.sm,
  },
});
