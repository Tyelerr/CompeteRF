import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import {
  TournamentFilter,
  useMyTournaments,
} from "../../src/viewmodels/useMyTournaments";
import { usePagination } from "../../src/viewmodels/usePagination";
import { Dropdown } from "../../src/views/components/common/dropdown";
import { Pagination } from "../../src/views/components/common/pagination";
import {
  EmptyState,
  TournamentCard,
} from "../../src/views/components/dashboard";

const FILTER_OPTIONS: { label: string; value: TournamentFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const SORT_OPTIONS = [
  { label: "Date (Newest)", value: "date_desc" },
  { label: "Date (Oldest)", value: "date_asc" },
  { label: "Name (A-Z)", value: "name_asc" },
  { label: "Name (Z-A)", value: "name_desc" },
  { label: "Most Views", value: "views" },
  { label: "Most Favorites", value: "favorites" },
];

const ITEMS_PER_PAGE = 10;

export default function MyTournamentsScreen() {
  const router = useRouter();
  const { filter: initialFilter } = useLocalSearchParams<{ filter?: string }>();
  const vm = useMyTournaments(initialFilter);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");

  // Filter and sort tournaments
  const filteredTournaments = vm.tournaments
    .filter((t) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(query) ||
        t.venue_name.toLowerCase().includes(query) ||
        t.game_type.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return a.tournament_date.localeCompare(b.tournament_date);
        case "date_desc":
          return b.tournament_date.localeCompare(a.tournament_date);
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "views":
          return b.views_count - a.views_count;
        case "favorites":
          return b.favorites_count - a.favorites_count;
        default:
          return 0;
      }
    });

  // Use pagination hook
  const pagination = usePagination(filteredTournaments, {
    itemsPerPage: ITEMS_PER_PAGE,
  });

  // Reset to page 1 when filter/search/sort changes
  useEffect(() => {
    pagination.resetPage();
  }, [vm.filter, searchQuery, sortBy]);

  const handleFilterChange = (filter: TournamentFilter) => {
    vm.setFilter(filter);
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
  };

  const handleCardPress = (tournamentId: number) => {
    router.push(`/tournament-detail?id=${tournamentId}`);
  };

  const handleEditPress = (tournamentId: number) => {
    router.push({
      pathname: "/admin/edit-tournament/[id]",
      params: { id: tournamentId.toString() },
    });
  };

  const handleDeletePress = (tournamentId: number, tournamentName: string) => {
    Alert.alert(
      "Delete Tournament",
      `Are you sure you want to delete "${tournamentName}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => vm.onCancelTournament(tournamentId),
        },
      ],
    );
  };

  // Pagination component for top and bottom
  const renderPagination = () => (
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
  );

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading tournaments...</Text>
      </View>
    );
  }

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
        <Text style={styles.headerTitle}>My Tournaments</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push("/(tabs)/submit")}
        >
          <Text style={styles.addText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Controls Section */}
      <View style={styles.controlsSection}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search tournaments..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => handleSearchChange("")}
            >
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          {FILTER_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.filterTab,
                vm.filter === option.value && styles.filterTabActive,
              ]}
              onPress={() => handleFilterChange(option.value)}
            >
              <Text
                style={[
                  styles.filterText,
                  vm.filter === option.value && styles.filterTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort Dropdown */}
        <View style={styles.sortContainer}>
          <Dropdown
            options={SORT_OPTIONS}
            value={sortBy}
            onSelect={handleSortChange}
            placeholder="Sort by"
          />
        </View>
      </View>

      {/* Top Pagination */}
      {renderPagination()}

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
            onPress={() => handleCardPress(item.id)}
            onEdit={() => handleEditPress(item.id)}
            onDelete={() => handleDeletePress(item.id, item.name)}
            showActions={true}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            message={
              searchQuery
                ? "No tournaments match your search"
                : `No ${vm.filter === "all" ? "" : vm.filter} tournaments`
            }
            submessage={
              searchQuery
                ? "Try adjusting your search terms"
                : vm.filter === "all"
                  ? "Create your first tournament to get started"
                  : `You don't have any ${vm.filter} tournaments`
            }
            buttonTitle={
              !searchQuery && vm.filter === "all"
                ? "Create Tournament"
                : undefined
            }
            onButtonPress={
              !searchQuery && vm.filter === "all"
                ? () => router.push("/(tabs)/submit")
                : undefined
            }
          />
        }
        ListFooterComponent={
          pagination.totalCount > 0 ? renderPagination() : null
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
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
    minWidth: 70,
  },
  backText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  addButton: {
    padding: SPACING.xs,
    minWidth: 70,
    alignItems: "flex-end",
  },
  addText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  controlsSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  clearButton: {
    padding: SPACING.sm,
    paddingRight: SPACING.md,
  },
  clearText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
  },
  filterContainer: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  filterTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  filterTextActive: {
    color: COLORS.white,
    fontWeight: "600",
  },
  sortContainer: {
    maxWidth: 180,
  },
  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xl * 2,
  },
});
