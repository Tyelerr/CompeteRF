import Slider from "@react-native-community/slider";

import { useRouter } from "expo-router";
import { useEffect } from "react";
import {
  FlatList,
  Keyboard,
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
import { useBilliards } from "../../src/viewmodels/useBilliards";
import { usePagination } from "../../src/viewmodels/usePagination";
import { BilliardsTournamentCard } from "../../src/views/components/billiards";
import { Dropdown } from "../../src/views/components/common/dropdown";
import { FilterModal } from "../../src/views/components/common/filter-modal";
import { Loading } from "../../src/views/components/common/loading";
import { Pagination } from "../../src/views/components/common/pagination";

const ITEMS_PER_PAGE = 20;
const NUM_COLUMNS = 2;

export default function BilliardsScreen() {
  const router = useRouter();
  const vm = useBilliards();

  const pagination = usePagination(vm.filteredTournaments as any, {
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
    vm.searchRadius,
    vm.filters,
  ]);

  const stateOptions = [{ label: "State", value: "" }, ...US_STATES];
  const cityOptions =
    vm.cities.length > 0 ? vm.cities : [{ label: "City", value: "" }];

  const showRadiusBar = vm.zipCode.length > 0;

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

  const renderTournament = ({ item }: { item: any }) => {
    const isFavorited = vm.favorites.includes(item.id);

    return (
      <BilliardsTournamentCard
        tournament={item as any}
        isFavorited={isFavorited}
        onPress={() => router.push(`/(tabs)/tournament-detail?id=${item.id}`)}
        onToggleFavorite={() => vm.toggleFavorite(item.id)}
        getTournamentImageUrl={vm.getTournamentImageUrl}
      />
    );
  };

  if (vm.loading) {
    return <Loading fullScreen message="Loading tournaments..." />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BILLIARDS TOURNAMENTS</Text>
        <Text style={styles.headerSubtitle}>
          Browse all billiards tournaments by game type and location
        </Text>
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
            placeholder="Zip"
            placeholderTextColor={COLORS.textMuted}
            value={vm.zipCode}
            onChangeText={vm.setZipCode}
            keyboardType="numeric"
            maxLength={5}
          />
        </View>
      </View>

      {/* Radius Slider — shows when zip has content */}
      {showRadiusBar && (
        <View style={styles.radiusContainer}>
          <View style={styles.radiusHeader}>
            <Text style={styles.radiusLabel}>Search Radius</Text>
            <Text style={styles.radiusValue}>
              {vm.searchRadius} mile{vm.searchRadius !== 1 ? "s" : ""}
            </Text>
          </View>
          <Slider
            style={styles.radiusSlider}
            minimumValue={0}
            maximumValue={100}
            step={5}
            value={vm.searchRadius}
            onValueChange={vm.setSearchRadius}
            onSlidingStart={() => Keyboard.dismiss()}
            minimumTrackTintColor={COLORS.primary}
            maximumTrackTintColor={COLORS.border}
            thumbTintColor={COLORS.primary}
          />
          <View style={styles.radiusLabels}>
            <Text style={styles.radiusMinMax}>0 mile</Text>
            <Text style={styles.radiusMinMax}>100 miles</Text>
          </View>
        </View>
      )}

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
          keyExtractor={(item: any) => item.id.toString()}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.row}
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
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
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
    marginBottom: SPACING.sm,
  },
  filterItem: {
    flex: 1,
  },
  filterLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  // ── Zip input ──────────────────────────────────────────────────────
  zipInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  // ── Radius slider ─────────────────────────────────────────────────
  radiusContainer: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  radiusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  radiusLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  radiusValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.primary,
  },
  radiusSlider: {
    width: "100%",
    height: 36,
  },
  radiusLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
  },
  radiusMinMax: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
  },
  // ── Filter buttons ────────────────────────────────────────────────
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
    padding: SPACING.sm,
  },
  row: {
    justifyContent: "space-between",
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
