import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { useRecommendVenue } from "../../../viewmodels/hooks/use.recommend.venue";
import { useScrollToTopOnFocus } from "../../../viewmodels/hooks/use.scroll.to.top";
import { useBilliards } from "../../../viewmodels/useBilliards";
import { usePagination } from "../../../viewmodels/usePagination";
import { BilliardsTournamentCard } from "../../components/billiards";
import { Dropdown } from "../../components/common/dropdown";
import { FilterModal } from "../../components/common/filter-modal";
import { Loading } from "../../components/common/loading";
import { Pagination } from "../../components/common/pagination";
import { RecommendVenueModal } from "../../components/common/RecommendVenueModal";
import { styles } from "./billiards.styles";

const ITEMS_PER_PAGE = 20;
const NUM_COLUMNS = 2;

export const BilliardsScreen = () => {
  const router = useRouter();
  const vm = useBilliards();
  const recommend = useRecommendVenue();
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

  const stateOptions = [{ label: "All States", value: "" }, ...US_STATES];
  const cityOptions =
    vm.cities.length > 0 ? vm.cities : [{ label: "City", value: "" }];
  const showRadiusBar = vm.zipCode.length > 0;

  // Get display name for a state abbreviation
  const getStateName = (abbrev: string) => {
    const found = US_STATES.find((s) => s.value === abbrev);
    return found ? found.label : abbrev;
  };

  // —— Render helpers ————————————————————————————————————————————————

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
      onPress={() =>
        router.push(
          `/(tabs)/tournament-detail?id=${item.id}&from=/(tabs)/billiards`,
        )
      }
      onToggleFavorite={() => vm.toggleFavorite(item.id)}
      getTournamentImageUrl={vm.getTournamentImageUrl}
    />
  );

  // —— Recommend Venue Card (reused in empty state + footer) ——————————

  const renderRecommendCard = () => {
    if (!vm.user) return null;

    return (
      <View
        style={{
          backgroundColor: COLORS.surface,
          borderRadius: 12,
          padding: SPACING.md,
          marginHorizontal: SPACING.xs,
          marginTop: SPACING.md,
          marginBottom: SPACING.md,
          borderWidth: 1,
          borderColor: COLORS.primary + "30",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 24, marginBottom: 8 }}>🎱</Text>
        <Text
          style={{
            fontSize: FONT_SIZES.md,
            fontWeight: "600",
            color: COLORS.text,
            textAlign: "center",
          }}
        >
          Know a spot that hosts pool tournaments?
        </Text>
        <Text
          style={{
            fontSize: FONT_SIZES.sm,
            color: COLORS.textSecondary,
            textAlign: "center",
            marginTop: 4,
            marginBottom: 12,
          }}
        >
          Help us grow the community — recommend a venue!
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: COLORS.primary,
            paddingHorizontal: 24,
            paddingVertical: 10,
            borderRadius: 8,
          }}
          onPress={recommend.open}
        >
          <Text
            style={{
              color: "#fff",
              fontWeight: "600",
              fontSize: FONT_SIZES.sm,
            }}
          >
            Recommend a Venue
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // —— Empty State ————————————————————————————————————————————————————

  const renderEmptyState = () => {
    // State is selected but has no tournaments — suggest search alert + recommend
    if (vm.isStateFilterEmpty && vm.selectedState) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎱</Text>
          <Text style={styles.emptyText}>
            No tournaments in {getStateName(vm.selectedState)} yet
          </Text>
          <Text style={styles.emptySubtext}>
            Get notified when tournaments are added here
          </Text>
          {vm.user ? (
            <TouchableOpacity
              style={{
                backgroundColor: COLORS.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
                marginTop: 16,
              }}
              onPress={() =>
                router.push(
                  `/search-alerts/create?state=${vm.selectedState}` as any,
                )
              }
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
                Create Search Alert
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={{
                backgroundColor: COLORS.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
                marginTop: 16,
              }}
              onPress={() => router.push("/auth/register")}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
                Sign Up for Alerts
              </Text>
            </TouchableOpacity>
          )}

          {/* Recommend Venue Card */}
          {renderRecommendCard()}
        </View>
      );
    }

    // Home state had no tournaments — showing all, with a note
    if (vm.isHomeStateEmpty) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎱</Text>
          <Text style={styles.emptyText}>No tournaments found</Text>
          <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
          {renderRecommendCard()}
        </View>
      );
    }

    // Generic empty
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🎱</Text>
        <Text style={styles.emptyText}>No tournaments found</Text>
        <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
        {renderRecommendCard()}
      </View>
    );
  };

  // —— Loading state ——————————————————————————————————————————————————

  if (vm.loading) {
    return <Loading fullScreen message="Loading tournaments..." />;
  }

  // —— Main render ————————————————————————————————————————————————————

  return (
    <Pressable style={styles.container} onPress={Keyboard.dismiss}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BILLIARDS TOURNAMENTS</Text>
        <Text style={styles.headerSubtitle}>
          Browse all billiards tournaments by game type and location
        </Text>
      </View>

      {/* Home state banner */}
      {vm.isHomeStateEmpty && (
        <View
          style={{
            backgroundColor: COLORS.primary + "15",
            paddingHorizontal: 16,
            paddingVertical: 10,
            marginHorizontal: 16,
            marginBottom: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: COLORS.primary + "30",
          }}
        >
          <Text
            style={{
              color: COLORS.text,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            No tournaments in your state yet — showing all tournaments
          </Text>
        </View>
      )}

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
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>
      </View>

      {/* State, City, Zip Row */}
      <View style={styles.filterRow}>
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>State</Text>
          <Dropdown
            placeholder="All States"
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
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
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
        renderEmptyState()
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
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={vm.refreshing}
              onRefresh={vm.onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListFooterComponent={
            <>
              {pagination.totalCount > 0 && renderPagination()}
              {vm.filteredTournaments.length < 15 && renderRecommendCard()}
            </>
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

      {/* Recommend Venue Modal */}
      <RecommendVenueModal vm={recommend} />
    </Pressable>
  );
};

export default BilliardsScreen;
