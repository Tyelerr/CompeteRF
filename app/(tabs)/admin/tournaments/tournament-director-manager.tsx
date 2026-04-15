import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
  Platform,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { moderateScale, scale } from "../../../../src/utils/scaling";
import { useTournamentDirectorManager } from "../../../../src/viewmodels/useTournamentDirectorManager";
import { EmptyState } from "../../../../src/views/components/dashboard";
import { TournamentCard } from "../../../../src/views/components/tournament";
import { TournamentDetailModal } from "../../../../src/views/components/tournament/TournamentDetailModal";

const isWeb = Platform.OS === "web";

const PAGE_SIZE = 10;

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
    <Text allowFontScaling={false} style={[styles.statusTabText, isActive && styles.statusTabTextActive]}>
      {label}
    </Text>
    <Text allowFontScaling={false} style={[styles.statusTabCount, isActive && styles.statusTabCountActive]}>
      {count}
    </Text>
  </TouchableOpacity>
);

export default function TDTournamentsScreen() {
  const router = useRouter();
  const vm = useTournamentDirectorManager();

  const [currentPage, setCurrentPage] = useState(1);
  const [paginatedTournaments, setPaginatedTournaments] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [processingTournamentId, setProcessingTournamentId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const newCurrentPage = 1;
    setCurrentPage(newCurrentPage);
    const newTotalPages = Math.ceil(vm.tournaments.length / PAGE_SIZE);
    setTotalPages(newTotalPages);
    const startIndex = (newCurrentPage - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    setPaginatedTournaments(vm.tournaments.slice(startIndex, endIndex));
  }, [vm.tournaments, vm.statusFilter, vm.searchQuery, vm.sortOption, vm.sortDirection]);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    setPaginatedTournaments(vm.tournaments.slice(startIndex, endIndex));
  };

  const goToNextPage = () => goToPage(currentPage + 1);
  const goToPreviousPage = () => goToPage(currentPage - 1);

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
              const success = await vm.cancelTournament(tournament.id, "Cancelled by director");
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

  const handleTournamentPress = (tournament: any) => {
    setDetailId(String(tournament.id));
  };

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text allowFontScaling={false} style={styles.loadingText}>Loading tournaments...</Text>
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
      return { message: "No tournaments match your search", submessage: "Try adjusting your search terms." };
    }
    switch (vm.statusFilter) {
      case "active": return { message: "No active tournaments", submessage: "Your active tournaments will appear here." };
      case "completed": return { message: "No completed tournaments", submessage: "Finished tournaments will appear here." };
      case "archived": return { message: "No archived tournaments", submessage: "Archived tournaments will appear here." };
      default: return { message: "No tournaments found", submessage: "Your tournaments will appear here." };
    }
  };

  const emptyState = getEmptyStateMessage();
  const startIndex = (currentPage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(currentPage * PAGE_SIZE, vm.tournaments.length);

  return (
    <View style={styles.container}>
      <TournamentDetailModal
        id={detailId}
        visible={detailId !== null}
        onClose={() => setDetailId(null)}
      />
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text allowFontScaling={false} style={styles.headerTitle}>My Tournaments</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>Tap cards for full details</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text allowFontScaling={false} style={styles.searchIcon}>{"\uD83D\uDD0D"}</Text>
          <TextInput
            allowFontScaling={false}
            style={styles.searchInput}
            placeholder="Search tournaments..."
            placeholderTextColor={COLORS.textMuted}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
          />
          {vm.searchQuery.length > 0 && (
            <TouchableOpacity style={styles.clearSearchButton} onPress={() => vm.setSearchQuery("")}>
              <Text allowFontScaling={false} style={styles.clearSearchText}>{"\u2715"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filtersRow}>
        <View style={styles.statusTabs}>
          <StatusTab label="Active" count={vm.statusCounts.active} isActive={vm.statusFilter === "active"} onPress={() => vm.setStatusFilter("active")} />
          <StatusTab label="Done" count={vm.statusCounts.completed} isActive={vm.statusFilter === "completed"} onPress={() => vm.setStatusFilter("completed")} />
          <StatusTab label="Archived" count={vm.statusCounts.archived} isActive={vm.statusFilter === "archived"} onPress={() => vm.setStatusFilter("archived")} />
          <StatusTab label="All" count={vm.statusCounts.all} isActive={vm.statusFilter === "all"} onPress={() => vm.setStatusFilter("all")} />
        </View>
        <View style={styles.sortContainer}>
          <TouchableOpacity
            style={[styles.sortButton, vm.sortOption === "date" && styles.sortButtonActive]}
            onPress={() => vm.handleSortOptionChange("date")}
          >
            <Text allowFontScaling={false} style={[styles.sortButtonText, vm.sortOption === "date" && styles.sortButtonTextActive]}>
              {vm.getSortLabel("date")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, vm.sortOption === "name" && styles.sortButtonActive]}
            onPress={() => vm.handleSortOptionChange("name")}
          >
            <Text allowFontScaling={false} style={[styles.sortButtonText, vm.sortOption === "name" && styles.sortButtonTextActive]}>
              {vm.getSortLabel("name")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {vm.tournaments.length > 0 && (
        <View style={styles.paginationInfo}>
          <Text allowFontScaling={false} style={styles.paginationInfoText}>
            Total count: {vm.tournaments.length} Displaying {startIndex}-{endIndex}
          </Text>
          <View style={styles.paginationControls}>
            <TouchableOpacity
              style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
              onPress={goToPreviousPage}
              disabled={currentPage === 1}
            >
              <Text allowFontScaling={false} style={[styles.paginationButtonText, currentPage === 1 && styles.paginationButtonTextDisabled]}>
                {"<"}
              </Text>
            </TouchableOpacity>
            <Text allowFontScaling={false} style={styles.paginationPageText}>
              Page {currentPage} / {totalPages}
            </Text>
            <TouchableOpacity
              style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
              onPress={goToNextPage}
              disabled={currentPage === totalPages}
            >
              <Text allowFontScaling={false} style={[styles.paginationButtonText, currentPage === totalPages && styles.paginationButtonTextDisabled]}>
                {">"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={paginatedTournaments}
        renderItem={renderTournament}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing} onRefresh={vm.onRefresh} tintColor={COLORS.primary} />
          )
        }
        ListEmptyComponent={<EmptyState message={emptyState.message} submessage={emptyState.submessage} />}
        showsVerticalScrollIndicator={false}
        scrollEnabled={paginatedTournaments.length > 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: { alignItems: "center", paddingBottom: scale(SPACING.xl) },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginTop: scale(SPACING.md) },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.xl + SPACING.lg),
    paddingBottom: scale(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerWeb: { paddingTop: scale(SPACING.lg) },
  backButton: { padding: scale(SPACING.xs), borderRadius: scale(6), backgroundColor: COLORS.background },
  backText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  headerCenter: { alignItems: "center" },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text },
  headerSubtitle: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: scale(2) },
  placeholder: { width: scale(50) },
  searchContainer: { paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), backgroundColor: COLORS.background },
  searchInputContainer: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: scale(8), paddingHorizontal: scale(SPACING.sm) },
  searchIcon: { fontSize: moderateScale(FONT_SIZES.sm), marginRight: scale(SPACING.xs) },
  searchInput: { flex: 1, paddingVertical: scale(SPACING.xs), fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text },
  clearSearchButton: { padding: scale(SPACING.xs) },
  clearSearchText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted },
  filtersRow: { paddingHorizontal: scale(SPACING.md), paddingBottom: scale(SPACING.sm) },
  statusTabs: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: scale(8),
    padding: scale(SPACING.xs),
    marginBottom: scale(SPACING.sm),
    gap: scale(SPACING.xs),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  statusTab: { flex: 1, paddingVertical: scale(SPACING.sm), paddingHorizontal: scale(SPACING.xs), borderRadius: scale(6), alignItems: "center" },
  statusTabActive: { backgroundColor: COLORS.primary },
  statusTabText: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.textSecondary },
  statusTabTextActive: { color: COLORS.white },
  statusTabCount: { fontSize: moderateScale(10), color: COLORS.textMuted, marginTop: scale(1) },
  statusTabCountActive: { color: COLORS.white, opacity: 0.9 },
  sortContainer: { flexDirection: "row", gap: scale(SPACING.sm), justifyContent: "center" },
  sortButton: { paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), borderRadius: scale(6), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  sortButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sortButtonText: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.textSecondary },
  sortButtonTextActive: { color: COLORS.white },
  paginationInfo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), backgroundColor: COLORS.background },
  paginationInfoText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "500" },
  paginationControls: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.sm) },
  paginationButton: { width: scale(32), height: scale(32), borderRadius: scale(4), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, justifyContent: "center", alignItems: "center" },
  paginationButtonDisabled: { opacity: 0.5 },
  paginationButtonText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text },
  paginationButtonTextDisabled: { color: COLORS.textMuted },
  paginationPageText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, fontWeight: "500" },
  listContent: { paddingHorizontal: scale(SPACING.md), paddingBottom: scale(SPACING.xl) },
  cardContainer: { marginBottom: scale(SPACING.sm) },
});
