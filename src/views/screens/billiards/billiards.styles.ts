import { Platform, StyleSheet } from "react-native";
import { scale, moderateScale } from "../../../utils/scaling";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

// Single source of truth for the web tournament-grid max width. The card grid AND the
// pagination row both use this so pagination aligns to the grid edges (never the viewport).
export const GRID_MAX_WIDTH = 1400;

// Single source of truth for the web FILTER-row max width. Narrower than the 1400 grid so
// the controls stay comfortably readable/reachable while sharing the page footprint. Used
// by the tournament web filter bar (screen `webS`) AND the venue web filter bar (`webFilters`)
// so both tabs cap/center their filters to the exact same width — never the viewport edges.
export const FILTER_MAX_WIDTH = 1080;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    padding: isWeb ? SPACING.sm : SPACING.md,
    paddingTop: isWeb ? SPACING.md : SPACING.xl + SPACING.lg,
    paddingBottom: isWeb ? 4 : SPACING.sm,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: isWeb ? 18 : FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: isWeb ? 11 : FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },

  // ── Tournaments / Venues segmented control ────────────────────────────────────
  // Custom pill toggle (not a platform SegmentedControl) so it matches the app: a
  // rounded track in the surface color with a blue-accent active segment.
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: SPACING.md,
    marginBottom: isWeb ? 6 : SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: isWeb ? 7 : SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  segmentActive: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.white,
  },

  // ── Venues discovery ──────────────────────────────────────────────────────────
  venueCount: {
    fontSize: isWeb ? FONT_SIZES.sm : FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.primary,
    // Web: no extra horizontal inset — it renders inside the grid's `list` contentContainer
    // (already padded by `list`), so 0 here lines "N venues" up with the first card's left
    // edge. Mobile keeps the md inset.
    paddingHorizontal: isWeb ? 0 : SPACING.md,
    paddingBottom: SPACING.sm,
  },
  venueRadiusRow: {
    flexDirection: "row",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  venueRadiusChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  venueRadiusChipOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  venueRadiusText: {
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  venueRadiusTextOn: { color: COLORS.white },

  // ── Search ──────────────────────────────────────────────────────────────────
  searchContainer: {
    paddingHorizontal: SPACING.md,
    marginBottom: isWeb ? 6 : SPACING.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: isWeb ? RADIUS.sm : RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: SPACING.sm,
    paddingRight: 0,
  },
  searchIcon: {
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.md,
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: isWeb ? 7 : SPACING.md,
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.md,
    color: COLORS.text,
  },
  clearBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: SPACING.xs,
    paddingRight: SPACING.md,
    alignSelf: "stretch",
  },
  clearBtnText: {
    fontSize: Math.round(FONT_SIZES.sm * 2 * 0.8),
    color: COLORS.textMuted,
    fontWeight: "600",
    lineHeight: Math.round(FONT_SIZES.sm * 2 * 0.8) + 4,
  },

  // ── Filter row ──────────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    gap: isWeb ? 6 : SPACING.sm,
    marginBottom: isWeb ? 6 : SPACING.sm,
  },
  filterItem: {
    flex: 1,
  },
  filterItemState: {
    flex: 1,
  },
  filterItemCity: {
    flex: 1,
  },
  filterItemZip: {
    width: 110,
  },
  filterLabel: {
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },

  // ── Zip input ────────────────────────────────────────────────────────────────
  zipInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 0,
    paddingHorizontal: scale(SPACING.md),
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.text,
    height: scale(44),
    marginTop: 0,
    textAlignVertical: "center",
    includeFontPadding: false,
  },

  // ── Radius slider ────────────────────────────────────────────────────────────
  radiusContainer: {
    paddingHorizontal: SPACING.md,
    marginBottom: isWeb ? 6 : SPACING.sm,
  },
  radiusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  radiusLabel: {
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  radiusValue: {
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.primary,
  },
  radiusSlider: {
    width: "100%",
    height: 28,
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

  // ── Filter buttons ───────────────────────────────────────────────────────────
  filterButtonsRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: isWeb ? 6 : SPACING.md,
    marginBottom: isWeb ? SPACING.sm : SPACING.sm,
  },
  filtersButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: isWeb ? RADIUS.sm : RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: isWeb ? 6 : SPACING.md,
    alignItems: "center",
  },
  filtersButtonText: {
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.md,
    color: COLORS.text,
  },
  resetButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: isWeb ? RADIUS.sm : RADIUS.md,
    paddingVertical: isWeb ? 6 : SPACING.md,
    alignItems: "center",
  },
  resetButtonText: {
    fontSize: isWeb ? FONT_SIZES.xs : FONT_SIZES.md,
    color: COLORS.white,
    fontWeight: "600",
  },

  // ── Pagination wrapper ───────────────────────────────────────────────────────
  paginationWrap: {
    marginVertical: isWeb ? SPACING.xs : 2,
  },

  // ── Search Alerts button (empty state only) ──────────────────────────────────
  alertsButton: {
    alignSelf: "stretch",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "60",
    backgroundColor: COLORS.surface,
    alignItems: "center",
  },
  alertsButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },

  // ── List ─────────────────────────────────────────────────────────────────────
  list: {
    padding: isWeb ? SPACING.xs : SPACING.sm,
    // Web: cap + center the grid INSIDE the now full-width scroller (WebContainer no longer
    // constrains width), so the wheel scrolls over the empty left/right margins too.
    ...(isWeb ? { maxWidth: GRID_MAX_WIDTH, alignSelf: "center" as const, width: "100%" as const } : null),
  },
  row: {
    justifyContent: "flex-start",
  },
  // Web venue grid: even gutters between the flex:1 cards in each row.
  venueGridRow: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  // ── States ───────────────────────────────────────────────────────────────────
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
    alignItems: "center",
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
});

// kept for legacy imports
export const webStyles = StyleSheet.create({
  header: {},
  headerTitle: {},
  list: {},
});

// Shared WEB filter-bar styles (larger, easier-to-hit desktop controls: height 44, font
// md/sm) capped + centered to FILTER_MAX_WIDTH so the row never stretches to the viewport
// edges. These mirror the tournament tab's in-screen `webS` filter styles 1:1 so the Venues
// tab gets the exact same design language. Native venue filters keep the shared mobile
// styles above — these are web-only.
export const webFilters = StyleSheet.create({
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: FILTER_MAX_WIDTH,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 8,
    marginBottom: SPACING.sm,
  },
  searchWrap: {
    flex: 1,
    minWidth: 240,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: SPACING.md,
    paddingRight: 0,
    height: 44,
  },
  searchIcon: { fontSize: FONT_SIZES.sm, marginRight: SPACING.xs },
  searchInput: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, height: 44 },
  clearBtn: { height: 44, paddingLeft: SPACING.xs, paddingRight: SPACING.md, justifyContent: "center", alignItems: "center" },
  clearBtnText: { fontSize: FONT_SIZES.lg, color: COLORS.textMuted, fontWeight: "600", lineHeight: FONT_SIZES.lg + 4 },
  dropWrap: { width: 170 }, // non-compact Dropdown sets its own 44 height
  zipInput: { width: 96, height: 44, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.text },
  // Rows that sit UNDER the filter bar (radius chips, reset) — same cap + centering so they
  // stay within the filter footprint instead of stretching to the viewport edges.
  extrasRow: {
    flexDirection: "row",
    alignSelf: "center",
    width: "100%",
    maxWidth: FILTER_MAX_WIDTH,
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
});










