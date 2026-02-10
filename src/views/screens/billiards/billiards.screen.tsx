import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import {
  FlatList,
  Keyboard,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { US_STATES } from "../../../utils/constants";
import { useScrollToTopOnFocus } from "../../../viewmodels/hooks/use.scroll.to.top";
import { useBilliards } from "../../../viewmodels/useBilliards";
import { usePagination } from "../../../viewmodels/usePagination";
import { BilliardsTournamentCard } from "../../components/billiards";
import { Dropdown } from "../../components/common/dropdown";
import { FilterModal } from "../../components/common/filter-modal";
import { Loading } from "../../components/common/loading";
import { Pagination } from "../../components/common/pagination";
import { styles } from "./billiards.styles";

const ITEMS_PER_PAGE = 20;
const NUM_COLUMNS = 2;

export const BilliardsScreen = () => {
  const router = useRouter();
  const vm = useBilliards();
  const scrollRef = useScrollToTopOnFocus();

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

  // ── Render helpers ─────────────────────────────────────────────────────

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

  const renderTournament = ({ item }: { item: any }) => (
    <BilliardsTournamentCard
      tournament={item as any}
      isFavorited={vm.favorites.includes(item.id)}
      onPress={() => router.push(`/(tabs)/tournament-detail?id=${item.id}&from=/(tabs)/billiards`)}
      onToggleFavorite={() => vm.toggleFavorite(item.id)}
      getTournamentImageUrl={vm.getTournamentImageUrl}
    />
  );

  // ── Loading state ──────────────────────────────────────────────────────

  if (vm.loading) {
    return <Loading fullScreen message="Loading tournaments..." />;
  }

  // ── Main render ────────────────────────────────────────────────────────

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

      {/* Radius Slider */}
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
          ref={scrollRef}
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
};

export default BilliardsScreen;
