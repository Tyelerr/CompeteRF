import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { useRecommendVenue } from "../../../viewmodels/hooks/use.recommend.venue";
import { useReport } from "../../../viewmodels/hooks/useReport";
import { useScrollToTopOnFocus } from "../../../viewmodels/hooks/use.scroll.to.top";
import { useBilliards } from "../../../viewmodels/useBilliards";
import { usePagination } from "../../../viewmodels/usePagination";
import { BilliardsTournamentCard } from "../../components/billiards";
import { Dropdown } from "../../components/common/dropdown";
import { FilterModal } from "../../components/common/filter-modal";
import { Loading } from "../../components/common/loading";
import { Pagination } from "../../components/common/pagination";
import { RecommendVenueModal } from "../../components/common/RecommendVenueModal";
import ReportModal from "../../components/common/ReportModal";
import { WebContainer } from "../../components/common/WebContainer";
import { TournamentDetailModal } from "../../components/tournament/TournamentDetailModal";
import { styles } from "./billiards.styles";
import { WebTournamentDetailOverlay } from "./WebTournamentDetailOverlay";
import { useAuth } from "../../../viewmodels/hooks/use.auth";

const isWeb = Platform.OS === "web";
const NUM_COLUMNS = isWeb ? 4 : 2;
const ITEMS_PER_PAGE = isWeb ? 40 : 20;

export const BilliardsScreen = () => {
  const [webDetailId, setWebDetailId] = useState<string | null>(null);
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null);
  const router = useRouter();
  const vm = useBilliards();
  const recommend = useRecommendVenue();
  const scrollRef = useScrollToTopOnFocus();
  const { session } = useAuth();

  const {
    isModalVisible: isReportVisible,
    openReportModal,
    closeReportModal,
    reason: reportReason,
    setReason: setReportReason,
    details: reportDetails,
    setDetails: setReportDetails,
    handleSubmit: handleReportSubmit,
    isSubmitting: isReportSubmitting,
    contentType: reportContentType,
  } = useReport({ userId: session?.user?.id });

  const pagination = usePagination(vm.filteredTournaments as any, {
    itemsPerPage: ITEMS_PER_PAGE,
  });

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

  const getStateName = (abbrev: string) => {
    const found = US_STATES.find((s) => s.value === abbrev);
    return found ? found.label : abbrev;
  };

  // ── Web compact filter bar ─────────────────────────────────────────────────
  const renderWebFilters = () => (
    <View style={webS.filterBar}>
      <View style={webS.searchWrap}>
        <Text style={webS.searchIcon}>🔍</Text>
        <TextInput
          style={webS.searchInput}
          placeholder="Search tournaments..."
          placeholderTextColor={COLORS.textMuted}
          value={vm.searchQuery}
          onChangeText={vm.setSearchQuery}
        />
        {vm.searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => vm.setSearchQuery("")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={webS.clearBtn}
          >
            <Text style={webS.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={webS.dropWrap}>
        <Dropdown
          placeholder="State"
          compact={isWeb}
          options={stateOptions}
          value={vm.selectedState}
          onSelect={vm.setSelectedState}
        />
      </View>
      <View style={webS.dropWrap}>
        <Dropdown
          placeholder="City"
          compact={isWeb}
          options={cityOptions}
          value={vm.selectedCity}
          onSelect={vm.setSelectedCity}
        />
      </View>
      <TextInput
        style={webS.zipInput}
        placeholder="Zip"
        placeholderTextColor={COLORS.textMuted}
        value={vm.zipCode}
        onChangeText={vm.setZipCode}
        keyboardType="numeric"
        maxLength={5}
      />
      <TouchableOpacity
        style={webS.filterBtn}
        onPress={() => vm.setFilterModalVisible(true)}
      >
        <Text style={webS.filterBtnText}>☰ Filters</Text>
      </TouchableOpacity>
      <TouchableOpacity style={webS.resetBtn} onPress={vm.resetAllFilters}>
        <Text style={webS.resetBtnText}>Reset</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Radius slider ──────────────────────────────────────────────────────────
  const renderRadiusSlider = () => {
    if (!vm.zipCode.length) return null;
    return (
      <View style={styles.radiusContainer}>
        <View style={styles.radiusHeader}>
          <Text style={styles.radiusLabel}>Search Radius</Text>
          <Text style={styles.radiusValue}>
            {vm.searchRadius} mile{vm.searchRadius !== 1 ? "s" : ""}
          </Text>
        </View>
        {isWeb ? (
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={vm.searchRadius}
            onChange={(e) => vm.setSearchRadius(Number(e.target.value))}
            style={{ width: "100%", height: 28, accentColor: COLORS.primary, cursor: "pointer" }}
          />
        ) : (
          (() => {
            const Slider = require("@react-native-community/slider").default;
            return (
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
            );
          })()
        )}
        <View style={styles.radiusLabels}>
          <Text style={styles.radiusMinMax}>0 miles</Text>
          <Text style={styles.radiusMinMax}>100 miles</Text>
        </View>
      </View>
    );
  };

  // ── Pagination ─────────────────────────────────────────────────────────────
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

  // ── Tournament card ────────────────────────────────────────────────────────
  const renderTournament = ({ item }: { item: any }) => {
    if (!item)
      return <View style={{ flex: 1, margin: isWeb ? 6 : 0, minHeight: 300 }} />;
    return (
      <BilliardsTournamentCard
        tournament={item as any}
        isFavorited={vm.favorites.includes(item.id)}
        onPress={() => {
          if (isWeb) {
            setWebDetailId(String(item.id));
          } else {
            setMobileDetailId(String(item.id));
          }
        }}
        onToggleFavorite={() => vm.toggleFavorite(item.id)}
        getTournamentImageUrl={vm.getTournamentImageUrl}
      />
    );
  };

  // ── Recommend venue card ───────────────────────────────────────────────────
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
        <Text style={{ fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.text, textAlign: "center" }}>
          Know a spot that hosts pool tournaments?
        </Text>
        <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: "center", marginTop: 4, marginBottom: 12 }}>
          Help us grow the community — recommend a venue!
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 }}
          onPress={recommend.open}
        >
          <Text style={{ color: COLORS.white, fontWeight: "600", fontSize: FONT_SIZES.sm }}>
            Recommend a Venue
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🎱</Text>
      <Text style={styles.emptyText}>
        {vm.isStateFilterEmpty && vm.selectedState
          ? `No tournaments in ${getStateName(vm.selectedState)} yet`
          : "No tournaments found"}
      </Text>
      <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
      {vm.isStateFilterEmpty && vm.selectedState && vm.user && (
        <TouchableOpacity
          style={{ backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 16 }}
          onPress={() => router.push(`/search-alerts/create?state=${vm.selectedState}` as any)}
        >
          <Text style={{ color: COLORS.white, fontWeight: "600", fontSize: 15 }}>Create Search Alert</Text>
        </TouchableOpacity>
      )}
      {renderRecommendCard()}
    </View>
  );

  if (vm.loading) return <Loading fullScreen message="Loading tournaments..." />;

  const paddedData =
    pagination.paginatedItems.length % NUM_COLUMNS !== 0
      ? [
          ...pagination.paginatedItems,
          ...Array(NUM_COLUMNS - (pagination.paginatedItems.length % NUM_COLUMNS)).fill(null),
        ]
      : pagination.paginatedItems;

  return (
    <WebContainer>
      <View style={styles.container}>
        <TouchableWithoutFeedback
          onPress={isWeb ? undefined : Keyboard.dismiss}
          accessible={false}
        >
          <View pointerEvents={isWeb ? "box-none" : "auto"}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>BILLIARDS TOURNAMENTS</Text>
              <Text style={styles.headerSubtitle}>
                Browse all billiards tournaments by game type and location
              </Text>
            </View>

            {isWeb ? (
              <>
                {renderWebFilters()}
                {renderRadiusSlider()}
              </>
            ) : (
              <>
                {vm.isHomeStateEmpty && (
                  <View style={{ backgroundColor: COLORS.primary + "15", paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, marginBottom: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary + "30" }}>
                    <Text style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                      No tournaments in your state yet — showing all tournaments
                    </Text>
                  </View>
                )}
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
                    {vm.searchQuery.length > 0 && (
                      <TouchableOpacity
                        onPress={() => vm.setSearchQuery("")}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        style={styles.clearBtn}
                      >
                        <Text style={styles.clearBtnText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.filterRow}>
                  <View style={styles.filterItemState}>
                    <Text style={styles.filterLabel}>State</Text>
                    <Dropdown
                      placeholder="All States"
                      options={stateOptions}
                      value={vm.selectedState}
                      onSelect={vm.setSelectedState}
                    />
                  </View>
                  <View style={styles.filterItemCity}>
                    <Text style={styles.filterLabel}>City</Text>
                    <Dropdown
                      placeholder="City"
                      compact={isWeb}
                      options={cityOptions}
                      value={vm.selectedCity}
                      onSelect={vm.setSelectedCity}
                    />
                  </View>
                  <View style={styles.filterItemZip}>
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
                {renderRadiusSlider()}
                <View style={styles.filterButtonsRow}>
                  <TouchableOpacity
                    style={styles.filtersButton}
                    onPress={() => vm.setFilterModalVisible(true)}
                  >
                    <Text style={styles.filtersButtonText}>☰ Filters</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.resetButton} onPress={vm.resetAllFilters}>
                    <Text style={styles.resetButtonText}>🗑️ Reset Filters</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {renderPagination()}
          </View>
        </TouchableWithoutFeedback>

        {vm.error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{vm.error}</Text>
          </View>
        ) : pagination.paginatedItems.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            ref={scrollRef}
            style={{ flex: 1 }}
            data={paddedData}
            renderItem={renderTournament}
            keyExtractor={(item: any, index: number) =>
              item ? item.id.toString() : `placeholder-${index}`
            }
            numColumns={NUM_COLUMNS}
            key={`cols-${NUM_COLUMNS}`}
            contentContainerStyle={styles.list}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={
              !isWeb ? (
                <RefreshControl
                  refreshing={vm.refreshing}
                  onRefresh={vm.onRefresh}
                  tintColor={COLORS.primary}
                />
              ) : undefined
            }
            ListFooterComponent={
              <>
                {pagination.totalCount > 0 && renderPagination()}
                {vm.filteredTournaments.length < 15 && renderRecommendCard()}
              </>
            }
          />
        )}

        <FilterModal
          visible={vm.filterModalVisible}
          onClose={() => vm.setFilterModalVisible(false)}
          filters={vm.filters}
          onApply={vm.setFilters}
        />
        <RecommendVenueModal vm={recommend} />

        {isWeb && webDetailId && (
          <WebTournamentDetailOverlay
            id={webDetailId}
            onClose={() => setWebDetailId(null)}
          />
        )}

        <TournamentDetailModal
          id={mobileDetailId}
          visible={mobileDetailId !== null}
          onClose={() => setMobileDetailId(null)}
          onReport={openReportModal}
        />

        <ReportModal
          visible={isReportVisible}
          onClose={closeReportModal}
          contentType={reportContentType}
          reason={reportReason}
          onReasonChange={setReportReason}
          details={reportDetails}
          onDetailsChange={setReportDetails}
          onSubmit={handleReportSubmit}
          isSubmitting={isReportSubmitting}
        />
      </View>
    </WebContainer>
  );
};

const webS = StyleSheet.create({
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    gap: 6,
    marginBottom: 8,
  },
  searchWrap: {
    width: 220,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 8,
    paddingRight: 0,
    height: 32,
  },
  searchIcon: { fontSize: 12, marginRight: 4 },
  searchInput: { flex: 1, fontSize: 12, color: COLORS.text, height: 32 },
  // ── Clear button (web) ────────────────────────────────────────────────────
  // paddingRight increased → X moves left toward typed text
  // fontSize 22 * 0.8 = ~18 (doubled original 11, then -20%)
  clearBtn: {
    height: 32,
    paddingLeft: 4,
    paddingRight: 12,  // increased from 4 → shifts X left
    justifyContent: "center",
    alignItems: "center",
  },
  clearBtnText: {
    fontSize: 18,       // was 22, -20% ≈ 18
    color: COLORS.textMuted,
    fontWeight: "600",
    lineHeight: 22,
  },
  dropWrap: { width: 150, height: 32 },
  zipInput: {
    width: 100,
    height: 32,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    fontSize: 12,
    color: COLORS.text,
  },
  filterBtn: {
    height: 32,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnText: { fontSize: 11, color: COLORS.text },
  resetBtn: {
    height: 32,
    paddingHorizontal: 12,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  resetBtnText: { fontSize: 11, color: COLORS.white, fontWeight: "600" },
});

export default BilliardsScreen;
