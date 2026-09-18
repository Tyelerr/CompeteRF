import { getActiveFilterCount } from "../../../models/types/filter.types";
import { useIsFocused } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { computeMobileCardLayout } from "../../../utils/layout.utils";
import { moderateScale, scale } from "../../../utils/scaling";
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
import { SearchAlertsModal } from "../../components/profile/SearchAlertsModal";
import { styles, GRID_MAX_WIDTH, FILTER_MAX_WIDTH } from "./billiards.styles";
import { VenuesView } from "./venues.view";
import { WebTournamentDetailOverlay } from "./WebTournamentDetailOverlay";
import { useAuth } from "../../../viewmodels/hooks/use.auth";

// Top-level Billiards discovery views. Tournaments is the default; Venues is a
// separate content area beneath the shared header + segmented control.
type DiscoveryView = "tournaments" | "venues";

const isWeb = Platform.OS === "web";
const NUM_COLUMNS = isWeb ? 4 : 2;
const ITEMS_PER_PAGE = isWeb ? 40 : 20;
const SCROLL_UP_THRESHOLD = 50;

export const BilliardsScreen = () => {
  // Hide the native detail modal while this tab is unfocused (e.g. while the chip
  // live view is open) so it doesn't float above the pushed screen — it re-shows
  // on return, which is how Back lands back on the same modal.
  const isFocused = useIsFocused();
  const [webDetailId, setWebDetailId] = useState<string | null>(null);
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null);
  const [searchAlertsVisible, setSearchAlertsVisible] = useState(false);
  const { tournamentId: deepLinkId } = useLocalSearchParams<{ tournamentId?: string }>();
  const deepLinkHandled = useRef(false);
  const searchRef = useRef<TextInput>(null);

  // iOS keeps the search field as the first responder across navigation, so it
  // re-presents the keyboard when this tab returns — popping it up over the
  // tournament-detail modal. Blur + dismiss both when leaving AND when arriving
  // with the modal open (a couple of delayed passes beat the tab-transition
  // re-present, which fires after the animation completes).
  useEffect(() => {
    const kill = () => {
      searchRef.current?.blur();
      Keyboard.dismiss();
    };
    if (!isFocused) {
      kill();
      return;
    }
    if (mobileDetailId != null) {
      kill();
      // Arm a short-lived guard: any keyboard that tries to appear in the ~700ms
      // after the tab returns (the iOS first-responder re-present) is dismissed.
      // It self-disarms, so typing in the Report/Register sub-modals later works.
      const sub = Keyboard.addListener("keyboardDidShow", kill);
      const t = setTimeout(() => sub.remove(), 700);
      return () => {
        sub.remove();
        clearTimeout(t);
      };
    }
  }, [isFocused, mobileDetailId]);

  useEffect(() => {
    if (deepLinkId) {
      setMobileDetailId(String(deepLinkId));
      setTimeout(() => { router.replace("/(tabs)/billiards" as any); }, 500);
    }
  }, [deepLinkId]);

  const router = useRouter();
  const vm = useBilliards();
  // Tournaments | Venues switch (local UI only — does not touch tournament querying).
  const [discoveryView, setDiscoveryView] = useState<DiscoveryView>("tournaments");
  const recommend = useRecommendVenue();
  const scrollRef = useScrollToTopOnFocus();
  const { user } = useAuth();

  const { width: screenWidth } = useWindowDimensions();
  const { cardWidth, imageHeight } = computeMobileCardLayout(screenWidth);

  // ── Collapsing filter header (mobile only) ────────────────────────────────
  const filterAnim = useRef(new Animated.Value(0)).current;
  const filterHeightRef = useRef(0);
  const filterMeasured = useRef(false);
  const filterVisibleRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const scrollUpAccRef = useRef(0);
  const [filterReady, setFilterReady] = useState(false);

  // List geometry — used to avoid collapsing the header when the result set is
  // too short to scroll back up (which would trap the header off-screen).
  const listHeightRef = useRef(0);
  const contentHeightRef = useRef(0);

  // Prevents handleScroll from fighting the OS keyboard scroll when zip is focused
  const isZipFocusedRef = useRef(false);

  // onLayout is placed on an inner wrapper View so it always measures the
  // natural content height regardless of the Animated.View height constraint.
  const onFilterLayout = useCallback((e: any) => {
    if (isWeb) return;
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    if (!filterMeasured.current) {
      // First measurement — initialise the animation value
      filterMeasured.current = true;
      filterHeightRef.current = h;
      filterAnim.setValue(h);
      setFilterReady(true);
    } else if (filterVisibleRef.current && h !== filterHeightRef.current) {
      // Content height changed while filter is visible (e.g. radius slider
      // appeared/disappeared after zip entry) — snap to new height instantly
      // so the buttons are never clipped.
      filterHeightRef.current = h;
      filterAnim.setValue(h);
    }
  }, [filterAnim]);

  const handleScroll = useCallback((e: any) => {
    // Don't run collapse logic while the zip keyboard is open — the OS
    // scrolls the viewport to keep the input visible and that scroll event
    // would fight the animation, causing the visible jump.
    if (isWeb || Platform.OS === "android" || isZipFocusedRef.current) return;
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollYRef.current;
    lastScrollYRef.current = y;

    if (dy > 2) {
      scrollUpAccRef.current = 0;
      // Only collapse when the list overflows enough that the user can still
      // scroll back up past SCROLL_UP_THRESHOLD to re-expand it. Collapsing
      // frees the header's height, so without this guard a short result set
      // becomes unscrollable and the header is trapped off-screen.
      const overflow = contentHeightRef.current - listHeightRef.current;
      const canSafelyCollapse =
        overflow > filterHeightRef.current + SCROLL_UP_THRESHOLD;
      if (y > 40 && filterVisibleRef.current && canSafelyCollapse) {
        filterVisibleRef.current = false;
        Animated.timing(filterAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start();
      }
    } else if (dy < -2) {
      scrollUpAccRef.current += Math.abs(dy);
      if (!filterVisibleRef.current && scrollUpAccRef.current >= SCROLL_UP_THRESHOLD) {
        filterVisibleRef.current = true;
        scrollUpAccRef.current = 0;
        Animated.timing(filterAnim, { toValue: filterHeightRef.current, duration: 220, useNativeDriver: false }).start();
      }
    }
  }, [filterAnim]);

  // Re-open the collapsed filter header. Used to recover from a collapsed state
  // when the result set is too short to scroll up manually.
  const expandFilter = useCallback(() => {
    if (isWeb || filterVisibleRef.current) return;
    filterVisibleRef.current = true;
    scrollUpAccRef.current = 0;
    Animated.timing(filterAnim, { toValue: filterHeightRef.current, duration: 220, useNativeDriver: false }).start();
  }, [filterAnim]);
  // ─────────────────────────────────────────────────────────────────────────

  const {
    isModalVisible: isReportVisible, openReportModal, closeReportModal,
    reason: reportReason, setReason: setReportReason,
    details: reportDetails, setDetails: setReportDetails,
    handleSubmit: handleReportSubmit, isSubmitting: isReportSubmitting,
    contentType: reportContentType,
  } = useReport({ userId: user?.id });

  const pagination = usePagination(vm.filteredTournaments as any, { itemsPerPage: ITEMS_PER_PAGE });

  useEffect(() => {
    scrollRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [pagination.currentPage]);

  useEffect(() => {
    pagination.resetPage();
  }, [vm.searchQuery, vm.selectedState, vm.selectedCity, vm.zipCode, vm.searchRadius, vm.filters]);

  const stateOptions = [{ label: "All States", value: "" }, ...US_STATES];
  const activeFilterCount = getActiveFilterCount(vm.filters);
  const hasActiveFilters = activeFilterCount > 0;
  const cityOptions = vm.cities.length > 0 ? vm.cities : [{ label: "City", value: "" }];

  const handleSearchAlertsPress = () => {
    if (!user) {
      Alert.alert("Sign In Required", "Sign in or create a free account to set up search alerts and get notified when new tournaments match your criteria.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In / Sign Up", onPress: () => router.push("/(tabs)/profile" as any) },
      ]);
      return;
    }
    setSearchAlertsVisible(true);
  };

  const handleRecommendPress = () => {
    if (!user) {
      Alert.alert("Sign In Required", "Sign in or create a free account to recommend a venue to our community.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In / Sign Up", onPress: () => router.push("/(tabs)/profile" as any) },
      ]);
      return;
    }
    recommend.open();
  };

  const renderWebFilters = () => (
    <View style={webS.filterBar}>
      <View style={webS.searchWrap}>
        <Text allowFontScaling={false} style={webS.searchIcon}>{"\uD83D\uDD0D"}</Text>
        <TextInput allowFontScaling={false} style={webS.searchInput} placeholder="Search by name, venue, director..." placeholderTextColor={COLORS.textMuted} value={vm.searchQuery} onChangeText={vm.setSearchQuery} />
        {vm.searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => vm.setSearchQuery("")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={webS.clearBtn}>
            <Text allowFontScaling={false} style={webS.clearBtnText}>{"\u2715"}</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* Standard (non-compact) size for a larger, easier-to-read State/City on desktop —
          per-usage only; the shared compact style (profile/venues) is untouched. */}
      <View style={webS.dropWrap}><Dropdown placeholder="State" compact={false} options={stateOptions} value={vm.selectedState} onSelect={vm.setSelectedState} /></View>
      <View style={webS.dropWrap}><Dropdown placeholder="City" compact={false} options={cityOptions} value={vm.selectedCity} onSelect={vm.setSelectedCity} /></View>
      <TextInput allowFontScaling={false} style={webS.zipInput} placeholder="Zip" placeholderTextColor={COLORS.textMuted} value={vm.zipCode} onChangeText={vm.setZipCode} keyboardType="numeric" maxLength={5} />
      <TouchableOpacity style={webS.filterBtn} onPress={() => vm.setFilterModalVisible(true)}>
        <Text allowFontScaling={false} style={webS.filterBtnText}>{"\u2630 Filters"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={webS.resetBtn} onPress={vm.resetAllFilters}>
        <Text allowFontScaling={false} style={webS.resetBtnText}>Reset</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRadiusSlider = () => {
    if (!vm.zipCode.length) return null;
    return (
      <View style={styles.radiusContainer}>
        <View style={styles.radiusHeader}>
          <Text allowFontScaling={false} style={styles.radiusLabel}>Search Radius</Text>
          <Text allowFontScaling={false} style={styles.radiusValue}>{vm.searchRadius} mile{vm.searchRadius !== 1 ? "s" : ""}</Text>
        </View>
        {isWeb ? (
          <input type="range" min={0} max={100} step={5} value={vm.searchRadius} onChange={(e) => vm.setSearchRadius(Number(e.target.value))} style={{ width: "100%", height: 28, accentColor: COLORS.primary, cursor: "pointer" }} />
        ) : (
          (() => {
            const Slider = require("@react-native-community/slider").default;
            return <Slider style={styles.radiusSlider} minimumValue={0} maximumValue={100} step={5} value={vm.searchRadius} onValueChange={vm.setSearchRadius} onSlidingStart={() => Keyboard.dismiss()} minimumTrackTintColor={COLORS.primary} maximumTrackTintColor={COLORS.border} thumbTintColor={COLORS.primary} />;
          })()
        )}
        <View style={styles.radiusLabels}>
          <Text allowFontScaling={false} style={styles.radiusMinMax}>0 miles</Text>
          <Text allowFontScaling={false} style={styles.radiusMinMax}>100 miles</Text>
        </View>
      </View>
    );
  };

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
    if (!item) return <View style={{ flex: 1, margin: isWeb ? 6 : SPACING.xs, minHeight: 300 }} />;
    return (
      <BilliardsTournamentCard
        tournament={item as any}
        isFavorited={vm.favorites.includes(item.id)}
        onPress={() => { if (isWeb) { setWebDetailId(String(item.id)); } else { setMobileDetailId(String(item.id)); } }}
        onToggleFavorite={() => vm.toggleFavorite(item.id)}
        getTournamentImageUrl={vm.getTournamentImageUrl}
        cardWidth={isWeb ? undefined : cardWidth}
        imageHeight={isWeb ? undefined : imageHeight}
      />
    );
  };

  const renderRecommendCard = () => (
    <View style={{ backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), marginHorizontal: scale(SPACING.xs), marginTop: scale(SPACING.md), marginBottom: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.primary + "30", alignItems: "center" }}>
      <Text allowFontScaling={false} style={{ fontSize: moderateScale(24), marginBottom: scale(SPACING.sm) }}>{"\uD83C\uDFB1"}</Text>
      <Text allowFontScaling={false} style={{ fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, textAlign: "center" }}>Know a spot that hosts pool tournaments?</Text>
      <Text allowFontScaling={false} style={{ fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center", marginTop: scale(SPACING.xs), marginBottom: scale(SPACING.md) }}>Help us grow the community - recommend a venue!</Text>
      <TouchableOpacity style={{ backgroundColor: COLORS.primary, paddingHorizontal: scale(SPACING.lg), paddingVertical: scale(SPACING.sm), borderRadius: RADIUS.sm }} onPress={handleRecommendPress}>
        <Text allowFontScaling={false} style={{ color: COLORS.white, fontWeight: "600", fontSize: moderateScale(FONT_SIZES.sm) }}>Recommend a Venue</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.emptyContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text allowFontScaling={false} style={styles.emptyIcon}>{"\uD83C\uDFB1"}</Text>
      <Text allowFontScaling={false} style={styles.emptyText}>{vm.isStateFilterEmpty && vm.selectedState ? "No tournaments available in this area yet" : "No tournaments found"}</Text>
      <Text allowFontScaling={false} style={styles.emptySubtext}>Try adjusting your filters</Text>
      <TouchableOpacity style={styles.alertsButton} onPress={handleSearchAlertsPress}>
        <Text allowFontScaling={false} style={styles.alertsButtonText}>{"\uD83D\uDD14"} Create Search Alert</Text>
      </TouchableOpacity>
      {renderRecommendCard()}
    </ScrollView>
  );

  if (vm.loading) return <Loading fullScreen message="Loading tournaments..." />;

  const paddedData = pagination.paginatedItems.length % NUM_COLUMNS !== 0
    ? [...pagination.paginatedItems, ...Array(NUM_COLUMNS - (pagination.paginatedItems.length % NUM_COLUMNS)).fill(null)]
    : pagination.paginatedItems;

  return (
    <WebContainer>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={isWeb ? undefined : Keyboard.dismiss} accessible={false}>
          <View pointerEvents={isWeb ? "box-none" : "auto"}>
            <View style={styles.header}>
              <Text allowFontScaling={false} style={styles.headerTitle}>BILLIARDS</Text>
              <Text allowFontScaling={false} style={styles.headerSubtitle}>Find tournaments and venues near you</Text>
            </View>

            {/* Top-level view switch. Custom pill toggle so it matches the app.
               WEB: cap+center the bar to the same GRID_MAX_WIDTH box as the card grid /
               pagination so its edges align with them (segmentRow's own marginHorizontal:md
               then insets it within that box). Native renders the bar directly (full-width
               minus md), unchanged. */}
            {(() => {
              const segmentBar = (
                <View style={styles.segmentRow}>
                  {([
                    ["tournaments", "Tournaments"],
                    ["venues", "Venues"],
                  ] as [DiscoveryView, string][]).map(([key, label]) => {
                    const active = discoveryView === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.segment, active && styles.segmentActive]}
                        onPress={() => setDiscoveryView(key)}
                        activeOpacity={0.85}
                      >
                        <Text allowFontScaling={false} style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
              return isWeb ? <View style={webS.pageBarWeb}>{segmentBar}</View> : segmentBar;
            })()}

            {discoveryView === "tournaments" && (isWeb ? (
              <>
                {renderWebFilters()}
                {renderRadiusSlider()}
                <View style={webS.pageBarWeb}>{renderPagination()}</View>
              </>
            ) : (
              // Animated.View controls the visible height for the collapse animation.
              // The inner View carries onLayout so it always reports the natural
              // content height — not the constrained animated height. This means
              // onFilterLayout fires correctly when dynamic content (radius slider)
              // appears or disappears, preventing the clipping bug.
              <Animated.View style={filterReady ? { height: filterAnim, overflow: "hidden" } : undefined}>
                <View onLayout={onFilterLayout}>
                  <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                      <Text allowFontScaling={false} style={styles.searchIcon}>{"\uD83D\uDD0D"}</Text>
                      <TextInput ref={searchRef} allowFontScaling={false} style={styles.searchInput} placeholder="Search by name, venue, director..." placeholderTextColor={COLORS.textMuted} value={vm.searchQuery} onChangeText={vm.setSearchQuery} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} />
                      {vm.searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => vm.setSearchQuery("")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.clearBtn}>
                          <Text allowFontScaling={false} style={styles.clearBtnText}>{"\u2715"}</Text>
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
                        onFocus={() => { isZipFocusedRef.current = true; }}
                        onBlur={() => { isZipFocusedRef.current = false; }}
                      />
                    </View>
                  </View>
                  {renderRadiusSlider()}
                  <View style={styles.filterButtonsRow}>
                    <TouchableOpacity style={styles.filtersButton} onPress={() => vm.setFilterModalVisible(true)}>
                      <Text allowFontScaling={false} style={styles.filtersButtonText}>{hasActiveFilters ? "\u2713 Filters Applied" : "\u2630 Filters"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.resetButton} onPress={vm.resetAllFilters}>
                      <Text allowFontScaling={false} style={styles.resetButtonText}>{"\uD83D\uDDD1\uFE0F"} Reset Filters</Text>
                    </TouchableOpacity>
                  </View>
                  {renderPagination()}
                </View>
              </Animated.View>
            ))}
          </View>
        </TouchableWithoutFeedback>

        {discoveryView === "venues" ? (
          <VenuesView />
        ) : vm.error ? (
          <View style={styles.errorContainer}>
            <Text allowFontScaling={false} style={styles.errorText}>{vm.error}</Text>
          </View>
        ) : pagination.paginatedItems.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            ref={scrollRef}
            style={{ flex: 1 }}
            data={paddedData}
            renderItem={renderTournament}
            keyExtractor={(item: any, index: number) => item ? item.id.toString() : `placeholder-${index}`}
            numColumns={NUM_COLUMNS}
            key={`cols-${NUM_COLUMNS}`}
            contentContainerStyle={styles.list}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            // iOS pull-to-refresh needs the top overscroll, so allow bounce (was
            // disabled). The refresh gesture is a downward pull at offset 0 (dy < 0),
            // which only ever hits handleScroll's re-expand branch — never the collapse
            // branch — so it can't hide the filters. RefreshControl itself only fires at
            // the top, and vm.onRefresh refetches the CURRENT filter state (see the VM).
            bounces={!isWeb}
            refreshControl={
              isWeb ? undefined : (
                <RefreshControl
                  refreshing={vm.refreshing}
                  onRefresh={vm.onRefresh}
                  tintColor={COLORS.primary}
                  colors={[COLORS.primary]}
                />
              )
            }
            onLayout={(e) => { listHeightRef.current = e.nativeEvent.layout.height; }}
            onContentSizeChange={(_w, h) => {
              contentHeightRef.current = h;
              // If the results are too short to scroll, a collapsed header can't
              // be re-expanded by scrolling — force it back open.
              if (!isWeb && h <= listHeightRef.current + SCROLL_UP_THRESHOLD) {
                expandFilter();
              }
            }}
            ListFooterComponent={
              <>
                {pagination.totalCount > 0 && (isWeb ? <View style={webS.pageBarWeb}>{renderPagination()}</View> : renderPagination())}
                {vm.filteredTournaments.length < 15 && renderRecommendCard()}
              </>
            }
          />
        )}

        <FilterModal visible={vm.filterModalVisible} onClose={() => vm.setFilterModalVisible(false)} filters={vm.filters} onApply={vm.setFilters} />
        <RecommendVenueModal vm={recommend} />

        {isWeb && webDetailId && <WebTournamentDetailOverlay id={webDetailId} onClose={() => setWebDetailId(null)} />}

        <TournamentDetailModal id={mobileDetailId} visible={mobileDetailId !== null && isFocused} onClose={() => setMobileDetailId(null)} onReport={openReportModal} onRegistrationChanged={() => { void vm.onRefresh(); }} />

        <ReportModal visible={isReportVisible} onClose={closeReportModal} contentType={reportContentType} reason={reportReason} onReasonChange={setReportReason} details={reportDetails} onDetailsChange={setReportDetails} onSubmit={handleReportSubmit} isSubmitting={isReportSubmitting} />

        <SearchAlertsModal visible={searchAlertsVisible} onClose={() => setSearchAlertsVisible(false)} />
      </View>
    </WebContainer>
  );
};

const webS = StyleSheet.create({
  // Larger, easier-to-hit desktop controls (height 32 → 44, font xs → md/sm) WITHOUT widening
  // the page: the row is capped at maxWidth 1080 (well under the 1400 tournament grid, which
  // still defines the page footprint) and centered. Search uses flex:1 so it gets the most
  // width and the row shrinks gracefully at narrower desktop widths (stays one line). Gaps
  // trimmed so the bigger controls still fit the same footprint.
  // Pagination row: full-width parent (keeps side-margin scrolling) but capped + centered to
  // the SAME width as the card grid (GRID_MAX_WIDTH) so "Showing…" aligns to the first card's
  // left edge and the page controls to the last card's right edge — not the viewport edges.
  pageBarWeb: { width: "100%", maxWidth: GRID_MAX_WIDTH, alignSelf: "center" },
  filterBar: { flexDirection: "row", alignItems: "center", alignSelf: "center", width: "100%", maxWidth: FILTER_MAX_WIDTH, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8, marginBottom: SPACING.sm },
  searchWrap: { flex: 1, minWidth: 240, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingLeft: SPACING.md, paddingRight: 0, height: 44 },
  searchIcon: { fontSize: FONT_SIZES.sm, marginRight: SPACING.xs },
  searchInput: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, height: 44 },
  clearBtn: { height: 44, paddingLeft: SPACING.xs, paddingRight: SPACING.md, justifyContent: "center", alignItems: "center" },
  clearBtnText: { fontSize: FONT_SIZES.lg, color: COLORS.textMuted, fontWeight: "600", lineHeight: FONT_SIZES.lg + 4 },
  dropWrap: { width: 170 }, // non-compact Dropdown sets its own 44 height
  zipInput: { width: 96, height: 44, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.text },
  filterBtn: { height: 44, paddingHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  filterBtnText: { fontSize: FONT_SIZES.sm, color: COLORS.text },
  resetBtn: { height: 44, paddingHorizontal: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  resetBtnText: { fontSize: FONT_SIZES.sm, color: COLORS.white, fontWeight: "600" },
});

export default BilliardsScreen;