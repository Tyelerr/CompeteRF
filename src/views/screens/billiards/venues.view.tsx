// src/views/screens/billiards/venues.view.tsx
// Public venue discovery view — rendered inside the Billiards screen when the "Venues"
// segment is selected. Read-only. Reuses the tournament-discovery scaffolding: shared
// billiards styles, Dropdown / Pagination / Loading primitives, usePagination, and the
// same client-side filtering approach (name / state / city / zip radius). Venue data +
// batched equipment summaries come from useVenueDiscovery; cards open a read-only detail
// modal. No livestreams, claims, reviews, or marketing fields.

import { useEffect, useState } from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { US_STATES } from "../../../utils/constants";
import { usePagination } from "../../../viewmodels/usePagination";
import { useVenueDiscovery } from "../../../viewmodels/useVenueDiscovery";
import { Venue } from "../../../models/types/venue.types";
import { Dropdown } from "../../components/common/dropdown";
import { Loading } from "../../components/common/loading";
import { Pagination } from "../../components/common/pagination";
import { PublicVenueCard } from "../../components/venues/PublicVenueCard";
import { VenueDetailModal } from "../../components/venues/VenueDetailModal";
import { styles } from "./billiards.styles";

const isWeb = Platform.OS === "web";
// Mobile: single-column horizontal list cards. Web: responsive multi-column grid.
const NUM_COLUMNS = isWeb ? 3 : 1;
const ITEMS_PER_PAGE = isWeb ? 30 : 20;
const RADII: { label: string; value: number }[] = [
  { label: "Exact", value: 0 },
  { label: "10 mi", value: 10 },
  { label: "25 mi", value: 25 },
  { label: "50 mi", value: 50 },
];

export const VenuesView = () => {
  const vm = useVenueDiscovery();
  const pagination = usePagination(vm.filteredVenues, { itemsPerPage: ITEMS_PER_PAGE });
  const [detailVenue, setDetailVenue] = useState<Venue | null>(null);

  const stateOptions = [{ label: "All States", value: "" }, ...US_STATES];
  const cityOptions = vm.cities.length > 0 ? vm.cities : [{ label: "City", value: "" }];

  // Reset to page 1 whenever the filter criteria change so the count/page stay coherent.
  useEffect(() => {
    pagination.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm.searchQuery, vm.selectedState, vm.selectedCity, vm.zipCode, vm.searchRadius]);

  // Only pad the last row on the multi-column web grid (so flex:1 cards keep their width);
  // the mobile single-column list needs no placeholders.
  const paddedData =
    NUM_COLUMNS > 1 && pagination.paginatedItems.length % NUM_COLUMNS !== 0
      ? [
          ...pagination.paginatedItems,
          ...Array(NUM_COLUMNS - (pagination.paginatedItems.length % NUM_COLUMNS)).fill(null),
        ]
      : pagination.paginatedItems;

  const renderVenue = ({ item }: { item: Venue | null }) => {
    if (!item) return <View style={{ flex: 1 }} />; // grid spacer
    return (
      <PublicVenueCard
        venue={item}
        summary={vm.tableSummaries[item.id]}
        next={vm.nextByVenue[item.id]}
        onPress={() => setDetailVenue(item)}
      />
    );
  };

  const filters = (
    <View>
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text allowFontScaling={false} style={styles.searchIcon}>{"🔍"}</Text>
          <TextInput
            allowFontScaling={false}
            style={styles.searchInput}
            placeholder="Search venues by name or city..."
            placeholderTextColor={COLORS.textMuted}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          {vm.searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => vm.setSearchQuery("")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.clearBtn}>
              <Text allowFontScaling={false} style={styles.clearBtnText}>{"✕"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.filterRow}>
        <View style={styles.filterItemState}><Dropdown placeholder="All States" options={stateOptions} value={vm.selectedState} onSelect={vm.setSelectedState} /></View>
        <View style={styles.filterItemCity}><Dropdown placeholder="City" compact={isWeb} options={cityOptions} value={vm.selectedCity} onSelect={vm.setSelectedCity} /></View>
        <View style={styles.filterItemZip}>
          <TextInput
            allowFontScaling={false}
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
      {vm.zipCode.length === 5 && (
        <View style={styles.venueRadiusRow}>
          {RADII.map((r) => {
            const active = vm.searchRadius === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                style={[styles.venueRadiusChip, active && styles.venueRadiusChipOn]}
                onPress={() => vm.setSearchRadius(r.value)}
              >
                <Text allowFontScaling={false} style={[styles.venueRadiusText, active && styles.venueRadiusTextOn]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {vm.hasActiveFilters && (
        <View style={styles.filterButtonsRow}>
          <TouchableOpacity style={[styles.resetButton, { flex: 1 }]} onPress={vm.resetFilters}>
            <Text allowFontScaling={false} style={styles.resetButtonText}>{"🗑️"} Reset Filters</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (vm.loading) return <Loading fullScreen message="Loading venues..." />;

  return (
    <View style={{ flex: 1 }}>
      {filters}
      {vm.error ? (
        <View style={styles.errorContainer}>
          <Text allowFontScaling={false} style={styles.errorText}>{vm.error}</Text>
        </View>
      ) : (
        <FlatList
          data={paddedData}
          renderItem={renderVenue}
          keyExtractor={(item, index) => (item ? String(item.id) : `ph-${index}`)}
          numColumns={NUM_COLUMNS}
          key={`vcols-${NUM_COLUMNS}`}
          contentContainerStyle={styles.list}
          columnWrapperStyle={NUM_COLUMNS > 1 ? styles.venueGridRow : undefined}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          bounces={!isWeb}
          refreshControl={
            isWeb ? undefined : (
              <RefreshControl refreshing={vm.refreshing} onRefresh={vm.onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
            )
          }
          ListHeaderComponent={
            <Text allowFontScaling={false} style={styles.venueCount}>
              {pagination.totalCount} {pagination.totalCount === 1 ? "venue" : "venues"}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.errorContainer}>
              <Text allowFontScaling={false} style={styles.errorText}>No venues match your filters.</Text>
            </View>
          }
          ListFooterComponent={
            pagination.totalCount > 0 ? (
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
                noun="venue"
              />
            ) : null
          }
        />
      )}

      <VenueDetailModal venue={detailVenue} visible={detailVenue !== null} onClose={() => setDetailVenue(null)} />
    </View>
  );
};

export default VenuesView;
