import { Platform, StyleSheet } from "react-native";
import { scale, moderateScale } from "../../../utils/scaling";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

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
  },
  row: {
    justifyContent: "flex-start",
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










