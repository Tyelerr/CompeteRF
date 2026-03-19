import { Platform, StyleSheet } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Header ──────────────────────────────────────────────────────────────
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

  // ── Search ───────────────────────────────────────────────────────────────
  searchContainer: {
    paddingHorizontal: SPACING.md,
    marginBottom: isWeb ? 6 : SPACING.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: isWeb ? RADIUS.sm : RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
  },
  searchIcon: {
    fontSize: isWeb ? 12 : FONT_SIZES.md,
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: isWeb ? 7 : SPACING.md,
    fontSize: isWeb ? 12 : FONT_SIZES.md,
    color: COLORS.text,
  },

  // ── Filter row ───────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: isWeb ? 6 : SPACING.sm,
    marginBottom: isWeb ? 6 : SPACING.sm,
  },
  filterItem: {
    flex: 1,
  },
  filterItemState: {
    flex: 2,
  },
  filterItemCity: {
    flex: 2,
  },
  filterItemZip: {
    width: 80,
  },
  filterLabel: {
    fontSize: isWeb ? 10 : FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },

  // ── Zip input ────────────────────────────────────────────────────────────
  zipInput: {
    backgroundColor: COLORS.surface,
    borderRadius: isWeb ? RADIUS.sm : RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: isWeb ? 6 : SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: isWeb ? 12 : FONT_SIZES.md,
    color: COLORS.text,
    marginTop: isWeb ? 2 : SPACING.xs,
  },

  // ── Radius slider ────────────────────────────────────────────────────────
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
    fontSize: isWeb ? 10 : FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  radiusValue: {
    fontSize: isWeb ? 10 : FONT_SIZES.sm,
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

  // ── Filter buttons ───────────────────────────────────────────────────────
  filterButtonsRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: isWeb ? 6 : SPACING.md,
    marginBottom: isWeb ? 8 : SPACING.md,
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
    fontSize: isWeb ? 11 : FONT_SIZES.md,
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
    fontSize: isWeb ? 11 : FONT_SIZES.md,
    color: COLORS.white,
    fontWeight: "600",
  },

  // ── List ─────────────────────────────────────────────────────────────────
  list: {
    padding: isWeb ? SPACING.xs : SPACING.sm,
  },
  row: {
    justifyContent: "flex-start",
  },

  // ── States ───────────────────────────────────────────────────────────────
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

// kept for legacy imports
export const webStyles = StyleSheet.create({
  header: {},
  headerTitle: {},
  list: {},
});
