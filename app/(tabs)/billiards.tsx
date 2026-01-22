import { useRouter } from "expo-router";
import { useEffect } from "react";
import {
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
import { US_STATES } from "../../src/utils/constants";
import {
  formatCurrency,
  formatDate,
  formatTime,
} from "../../src/utils/formatters";
import { Tournament, useBilliards } from "../../src/viewmodels/useBilliards";
import { usePagination } from "../../src/viewmodels/usePagination";
import { Dropdown } from "../../src/views/components/common/dropdown";
import { FilterModal } from "../../src/views/components/common/filter-modal";
import { Loading } from "../../src/views/components/common/loading";
import { Pagination } from "../../src/views/components/common/pagination";

const ITEMS_PER_PAGE = 20;

export default function BilliardsScreen() {
  const router = useRouter();
  const vm = useBilliards();

  const pagination = usePagination(vm.filteredTournaments, {
    itemsPerPage: ITEMS_PER_PAGE,
  });

  // Reset pagination when filters change
  useEffect(() => {
    pagination.resetPage();
  }, [
    vm.searchQuery,
    vm.selectedState,
    vm.selectedCity,
    vm.zipCode,
    vm.filters,
  ]);

  const stateOptions = [{ label: "State", value: "" }, ...US_STATES];
  const cityOptions =
    vm.cities.length > 0 ? vm.cities : [{ label: "City", value: "" }];

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

  const renderTournament = ({ item }: { item: Tournament }) => {
    const isFavorited = vm.favorites.includes(item.id);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/(tabs)/tournament-detail?id=${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.badgesRow}>
            <View style={styles.gameTypeBadge}>
              <Text style={styles.gameTypeText}>{item.game_type}</Text>
            </View>
            {item.is_recurring && (
              <View style={styles.recurringBadge}>
                <Text style={styles.recurringText}>🔄 Weekly</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              vm.toggleFavorite(item.id);
            }}
            style={styles.heartButton}
          >
            <Text style={[styles.heartIcon, isFavorited && styles.heartFilled]}>
              {isFavorited ? "♥" : "♡"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tournamentName}>{item.name}</Text>

        <Text style={styles.venue}>
          📍 {item.venues?.venue} - {item.venues?.city}, {item.venues?.state}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.dateTime}>
            <Text style={styles.date}>
              📅 {formatDate(item.tournament_date)}
            </Text>
            <Text style={styles.time}>🕐 {formatTime(item.start_time)}</Text>
          </View>

          <View style={styles.fees}>
            <Text style={styles.entryFee}>
              {formatCurrency(item.entry_fee)}
            </Text>
            {item.added_money > 0 && (
              <Text style={styles.addedMoney}>+${item.added_money} added</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (vm.loading) {
    return <Loading fullScreen message="Loading tournaments..." />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BILLIARDS</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search tournaments..."
            placeholderTextColor={COLORS.textMuted}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
          />
        </View>
      </View>

      {/* State, City, Zip Row */}
      <View style={styles.filterRow}>
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>State</Text>
          <Dropdown
            placeholder="State"
            options={stateOptions}
            value={vm.selectedState}
            onSelect={vm.setSelectedState}
          />
        </View>
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>City</Text>
          <Dropdown
            placeholder="City"
            options={cityOptions}
            value={vm.selectedCity}
            onSelect={vm.setSelectedCity}
          />
        </View>
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>Zip Code</Text>
          <TextInput
            style={styles.zipInput}
            placeholder="Enter zip code"
            placeholderTextColor={COLORS.textMuted}
            value={vm.zipCode}
            onChangeText={vm.setZipCode}
            keyboardType="numeric"
            maxLength={5}
          />
        </View>
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterButtonsRow}>
        <TouchableOpacity
          style={styles.filtersButton}
          onPress={() => vm.setFilterModalVisible(true)}
        >
          <Text style={styles.filtersButtonText}>☰ Filters</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={vm.resetAllFilters}
        >
          <Text style={styles.resetButtonText}>🗑️ Reset Filters</Text>
        </TouchableOpacity>
      </View>

      {/* Top Pagination */}
      {renderPagination()}

      {/* Content */}
      {vm.error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{vm.error}</Text>
        </View>
      ) : pagination.paginatedItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎱</Text>
          <Text style={styles.emptyText}>No tournaments found</Text>
          <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
        </View>
      ) : (
        <FlatList
          data={pagination.paginatedItems}
          renderItem={renderTournament}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={vm.refreshing}
              onRefresh={vm.onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListFooterComponent={
            pagination.totalCount > 0 ? renderPagination() : null
          }
        />
      )}

      {/* Filter Modal */}
      <FilterModal
        visible={vm.filterModalVisible}
        onClose={() => vm.setFilterModalVisible(false)}
        filters={vm.filters}
        onApply={vm.setFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  searchIcon: {
    fontSize: FONT_SIZES.md,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  filterItem: {
    flex: 1,
  },
  filterLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  zipInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  filterButtonsRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  filtersButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  filtersButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  resetButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  resetButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    fontWeight: "600",
  },
  list: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  badgesRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    flex: 1,
  },
  gameTypeBadge: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  gameTypeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  recurringBadge: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  recurringText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
  },
  heartButton: {
    padding: SPACING.xs,
  },
  heartIcon: {
    fontSize: 32,
    color: COLORS.primary,
  },
  heartFilled: {
    color: COLORS.primary,
  },
  tournamentName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  venue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  dateTime: {
    gap: 2,
  },
  date: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  time: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  fees: {
    alignItems: "flex-end",
  },
  entryFee: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.primary,
  },
  addedMoney: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.md,
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
});
