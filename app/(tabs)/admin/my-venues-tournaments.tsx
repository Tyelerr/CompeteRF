import { moderateScale, scale } from "../../../src/utils/scaling";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { usePagination } from "../../../src/viewmodels/hooks/use.pagination";
import {
  BarOwnerTournamentWithStats,
  SortOption,
  TournamentStatusFilter,
  useBarOwnerTournaments,
} from "../../../src/viewmodels/useBarOwnerTournaments";
import { Pagination } from "../../../src/views/components/common/pagination";
import { EmptyState } from "../../../src/views/components/dashboard/empty-state";

const isWeb = Platform.OS === "web";

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
    default:
      return COLORS.textSecondary;
  }
};

const TournamentCard = ({
  tournament,
  onPress,
}: {
  tournament: BarOwnerTournamentWithStats;
  onPress: () => void;
}) => {
  const statusColor = getStatusColor(tournament.status);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <Text allowFontScaling={false} style={styles.tournamentName} numberOfLines={1}>
          {tournament.name}
        </Text>
        <View
          style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}
        >
          <Text allowFontScaling={false} style={[styles.statusText, { color: statusColor }]}>
            {tournament.status}
          </Text>
        </View>
      </View>

      <Text allowFontScaling={false} style={styles.gameType}>
        {tournament.game_type} •{" "}
        {tournament.tournament_format.replace("_", " ")}
      </Text>

      <View style={styles.infoRow}>
        <Text allowFontScaling={false} style={styles.infoIcon}>📅</Text>
        <Text allowFontScaling={false} style={styles.infoText}>
          {formatDate(tournament.tournament_date)}
          {tournament.start_time && ` at ${formatTime(tournament.start_time)}`}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Text allowFontScaling={false} style={styles.infoIcon}>📍</Text>
        <Text allowFontScaling={false} style={styles.infoText} numberOfLines={1}>
          {tournament.venue_name}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Text allowFontScaling={false} style={styles.infoIcon}>👤</Text>
        <Text allowFontScaling={false} style={styles.infoText}>TD: {tournament.director_name}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text allowFontScaling={false} style={styles.statValue}>{tournament.views_count}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Views</Text>
        </View>
        <View style={styles.stat}>
          <Text allowFontScaling={false} style={styles.statValue}>{tournament.favorites_count}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Favorites</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function MyVenuesTournamentsScreen() {
  const router = useRouter();
  const vm = useBarOwnerTournaments();

  const pagination = usePagination(vm.filteredTournaments, {
    itemsPerPage: 10,
  });
  const listRef = useRef<any>(null);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [pagination.currentPage]);

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

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading tournaments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text allowFontScaling={false} style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>Tournament Manager</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, game type, venue, or director..."
          placeholderTextColor={COLORS.textSecondary}
          value={vm.searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        <TouchableOpacity
          style={[styles.tab, vm.statusFilter === "active" && styles.tabActive]}
          onPress={() => handleStatusFilter("active")}
        >
          <Text
            allowFontScaling={false}
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
            allowFontScaling={false}
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
          style={[styles.tab, vm.statusFilter === "all" && styles.tabActive]}
          onPress={() => handleStatusFilter("all")}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.tabText,
              vm.statusFilter === "all" && styles.tabTextActive,
            ]}
          >
            All{vm.statusCounts.all > 0 ? ` (${vm.statusCounts.all})` : ""}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.sortContainer}>
        <Text allowFontScaling={false} style={styles.sortLabel}>Sort:</Text>
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
                allowFontScaling={false}
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

      <FlatList
        ref={listRef}
        data={pagination.paginatedItems}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}/>
          )
        }
        renderItem={({ item }) => (
          <TournamentCard
            tournament={item}
            onPress={() => handleTournamentPress(item.id)}
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
                    : "No tournaments found"
            }
            submessage={
              vm.tournaments.length === 0
                ? "No tournaments have been created at your venues yet"
                : "Try adjusting your search or filters"
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
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
    fontSize: moderateScale(FONT_SIZES.md),
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
  headerWeb: {
    paddingTop: SPACING.lg,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
  },
  placeholder: {
    width: scale(50),
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingTop: SPACING.lg,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(8),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabsScroll: {
    maxHeight: scale(48),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: moderateScale(FONT_SIZES.md),
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
    fontSize: moderateScale(FONT_SIZES.sm),
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
    borderRadius: scale(16),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortPillActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  sortPillText: {
    fontSize: moderateScale(FONT_SIZES.sm),
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
    borderRadius: scale(12),
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  tournamentName: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(2),
    borderRadius: scale(12),
  },
  statusText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "600",
    textTransform: "capitalize",
  },
  gameType: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    textTransform: "capitalize",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: scale(4),
  },
  infoIcon: {
    fontSize: moderateScale(FONT_SIZES.sm),
    marginRight: SPACING.xs,
    width: scale(20),
  },
  infoText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    flex: 1,
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
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
});
