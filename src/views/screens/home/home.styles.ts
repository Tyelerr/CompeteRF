import { Platform, StyleSheet } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

export const styles = StyleSheet.create({
  // ----- Layout -----
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },

  // ----- Web Hero -----
  heroWeb: {
    alignItems: "center",
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.sm,
    maxWidth: 860,
    alignSelf: "center",
    width: "100%",
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 1,
  },
  heroTagline: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: "center",
  },

  // ----- Content -----
  content: {
    flex: 1,
    paddingHorizontal: Platform.OS === "web" ? SPACING.md : SPACING.lg,
  },
  contentContainerWeb: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    maxWidth: 860,
    alignSelf: "center",
    width: "100%",
  },
  loadingContainer: {
    padding: SPACING.xl,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
  },

  // ----- Language Toggle -----
  languageToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  langButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  langButtonActive: {
    backgroundColor: COLORS.primary,
  },
  langText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
  },
  langTextActive: {
    color: COLORS.white,
  },

  // ----- Welcome -----
  welcome: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },

  // ----- Quick Actions -----
  quickActionsWrapper: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButton: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    width: "30%",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  actionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    textAlign: "center",
  },
  placeholder: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
  },

  // ----- Tab Bar -----
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: Platform.OS === "web" ? SPACING.md : SPACING.lg,
    marginBottom: SPACING.sm,
    ...(Platform.OS === "web"
      ? { maxWidth: 860, alignSelf: "center", width: "100%", paddingTop: SPACING.lg }
      : {}),
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Platform.OS === "web" ? SPACING.sm : SPACING.md,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.backgroundCard,
    marginHorizontal: SPACING.xs,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 44,
    justifyContent: "center",
  },
  activeTab: {
    backgroundColor: COLORS.primary,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: SPACING.xs,
  },
  activeTabIcon: {},
  tabText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    textAlign: "center",
  },
  activeTabText: {
    color: COLORS.white,
  },

  // ----- News Grid (web only) -----
  newsGrid: {
    width: "100%",
  },
  newsGridRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  newsGridItem: {
    flex: 1,
  },

  // ----- News Card -----
  newsCard: {
    backgroundColor: "#000000",
    borderRadius: 12,
    marginBottom: Platform.OS === "web" ? 0 : SPACING.md,
    borderWidth: 1,
    borderColor: "#333333",
    overflow: "hidden",
    flex: 1,
  },
  newsAccentBar: {
    height: 3,
    backgroundColor: COLORS.primary,
    width: "100%",
  },
  newsCardInner: {
    padding: SPACING.md,
    flex: 1,
  },
  newsPill: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primary + "20",
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  newsPillText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  newsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: SPACING.sm,
  },
  newsDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
    flex: 1,
  },
  newsFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: "#333333",
  },
  newsInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  newsAuthor: {
    fontSize: FONT_SIZES.sm,
    color: "#ff8c00",
    fontWeight: "500",
  },
  newsDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  newsReadMore: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: COLORS.primary + "15",
    borderRadius: 6,
  },
  newsReadMoreText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },
  externalIcon: {
    fontSize: 16,
    color: COLORS.success,
  },
  starIcon: {
    fontSize: 18,
    marginRight: SPACING.sm,
    color: COLORS.warning,
    marginTop: 2,
  },
  newsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },

  // ----- Featured Content (Shared) -----
  featuredContainer: {
    flex: 1,
  },
  imageOverlapSpacer: {
    height: 10,
  },
  featuredHeader: {
    backgroundColor: COLORS.backgroundCard,
    alignItems: "center",
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: SPACING.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  descriptionContainer: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    letterSpacing: 1,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    lineHeight: 22,
    fontStyle: "italic",
  },
  highlightsContainer: {
    marginBottom: SPACING.lg,
  },
  highlightsTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  highlightItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  highlightIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
    width: 24,
  },
  highlightText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 20,
  },

  // ----- Circular Image -----
  circularImageWrapper: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  circularImageGlow: {
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  circularImageBorder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  circularImageInner: {
    backgroundColor: COLORS.backgroundCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  circularImage: {},
  circularImageFallback: {
    color: COLORS.textSecondary,
  },

  // ----- Player-Specific -----
  playerName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  playerTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  playerLocation: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  statsContainer: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.backgroundCard,
    padding: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statNumber: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  // ----- Bar-Specific -----
  barName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  barLocation: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  barInfoContainer: {
    backgroundColor: COLORS.backgroundCard,
    padding: SPACING.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
    width: 24,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
  infoLink: {
    color: "#3B82F6",
    textDecorationLine: "underline",
  },
});
