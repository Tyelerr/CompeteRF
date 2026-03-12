import { Platform, StyleSheet } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

const W = {
  labelGap: 5, fieldGap: 16, sectionPad: 16,
  inputHeight: 38, inputFontSize: 13,
  inputPadH: 10, labelSize: 11, sectionTitleSize: 13,
  toggleRowHeight: 36, radius: 6,
};

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listContent: { flexGrow: 1, paddingBottom: 50 },
  centerContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center", padding: SPACING.lg },
  emoji: { fontSize: 60, marginBottom: SPACING.md },
  title: { fontSize: FONT_SIZES.xl, fontWeight: "700", color: COLORS.text, marginBottom: SPACING.sm, textAlign: "center" },
  subtitle: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, textAlign: "center", marginBottom: SPACING.lg },

  header: {
    paddingHorizontal: isWeb ? W.sectionPad : SPACING.lg,
    paddingTop: isWeb ? 20 : SPACING.xl + SPACING.lg,
    paddingBottom: isWeb ? 12 : SPACING.md,
    alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: isWeb ? 16 : FONT_SIZES.xl, fontWeight: "700", color: COLORS.text, letterSpacing: 1 },
  headerSubtitle: { fontSize: isWeb ? 11 : FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: isWeb ? 3 : SPACING.xs, textAlign: "center" },

  section: {
    paddingHorizontal: isWeb ? W.sectionPad : SPACING.lg,
    paddingTop: isWeb ? 14 : SPACING.lg,
    paddingBottom: isWeb ? 14 : SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  sectionDisabled: { opacity: 0.45 },
  sectionTitle: {
    fontSize: isWeb ? W.sectionTitleSize : FONT_SIZES.lg,
    fontWeight: "700", color: COLORS.text,
    marginBottom: isWeb ? 10 : SPACING.sm,
    textTransform: isWeb ? "uppercase" as const : "none" as const,
    letterSpacing: isWeb ? 0.5 : 0,
  },

  label: {
    fontSize: isWeb ? W.labelSize : FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: isWeb ? W.labelGap : SPACING.xs,
    marginTop: isWeb ? W.fieldGap : SPACING.lg,
    fontWeight: isWeb ? "500" : "400",
    textTransform: isWeb ? "uppercase" as const : "none" as const,
    letterSpacing: isWeb ? 0.4 : 0,
  },
  labelDisabled: { color: COLORS.textMuted, opacity: 0.6 },

  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: isWeb ? W.radius : RADIUS.md,
    height: isWeb ? W.inputHeight : undefined,
    paddingVertical: isWeb ? 0 : SPACING.md,
    paddingHorizontal: isWeb ? W.inputPadH : SPACING.md,
    fontSize: isWeb ? W.inputFontSize : FONT_SIZES.md,
    color: COLORS.text,
    marginHorizontal: 0,
  },
  textArea: {
    height: isWeb ? 72 : undefined,
    minHeight: isWeb ? 72 : 100,
    textAlignVertical: "top",
    paddingTop: isWeb ? 8 : SPACING.md,
  },
  inputDisabled: { backgroundColor: COLORS.border, opacity: 0.5 },

  readOnlyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: isWeb ? W.radius : RADIUS.md,
    padding: isWeb ? 10 : SPACING.md,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  directorName: { fontSize: isWeb ? W.inputFontSize : FONT_SIZES.md, fontWeight: "600", color: COLORS.text },
  directorId: { fontSize: isWeb ? 11 : FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },

  hintWarning: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.warning, marginTop: 4 },
  hint: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4 },
  recurringHint: { fontSize: isWeb ? 10 : FONT_SIZES.xs, marginTop: 4, fontStyle: "italic" },

  // NO overflow:hidden here — critical for date picker and dropdown popover
  staticWrapper: {
    backgroundColor: COLORS.surface,
    borderRadius: isWeb ? W.radius : RADIUS.md,
    position: "relative",
    zIndex: 10,
  },
  dropdownContainer: { position: "relative", zIndex: 10, height: isWeb ? 38 : undefined },

  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    height: isWeb ? W.toggleRowHeight : undefined,
    paddingVertical: isWeb ? 0 : SPACING.sm,
    marginTop: isWeb ? W.fieldGap : 0,
    borderBottomWidth: isWeb ? 1 : 0,
    borderBottomColor: COLORS.border + "60",
  },
  toggleLabel: { fontSize: isWeb ? W.inputFontSize : FONT_SIZES.md, color: COLORS.text, flex: 1 },

  sidePotHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: isWeb ? W.fieldGap : SPACING.lg },
  addButton: { backgroundColor: COLORS.primary, paddingVertical: isWeb ? 4 : SPACING.sm, paddingHorizontal: isWeb ? 10 : SPACING.md, borderRadius: isWeb ? W.radius : RADIUS.sm },
  addButtonText: { color: COLORS.white, fontSize: isWeb ? 11 : FONT_SIZES.sm, fontWeight: "600" },
  sidePotRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: isWeb ? 8 : SPACING.md },
  sidePotName: { flex: 2 },
  sidePotAmount: { flex: 1 },
  removeButtonContainer: { padding: isWeb ? 4 : SPACING.sm },
  removeButton: { color: COLORS.error, fontSize: isWeb ? 14 : FONT_SIZES.lg, fontWeight: "bold" },

  venueCard: { backgroundColor: COLORS.surface, borderRadius: isWeb ? W.radius : RADIUS.md, padding: isWeb ? 10 : SPACING.md, marginTop: isWeb ? 8 : SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  venueName: { fontSize: isWeb ? W.inputFontSize : FONT_SIZES.md, fontWeight: "600", color: COLORS.text },
  venueAddress: { fontSize: isWeb ? 11 : FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },

  noTablesWarning: { backgroundColor: COLORS.error + "15", borderRadius: isWeb ? W.radius : RADIUS.md, padding: isWeb ? 10 : SPACING.md, marginTop: isWeb ? 8 : SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.error },
  noTablesText: { fontSize: isWeb ? 11 : FONT_SIZES.sm, color: COLORS.error, fontWeight: "500" },
  noTablesSubtext: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },

  venueTablesInfo: { backgroundColor: COLORS.primary + "10", borderRadius: isWeb ? W.radius : RADIUS.md, padding: isWeb ? 8 : SPACING.md, marginTop: isWeb ? 6 : SPACING.sm },
  venueTablesLabel: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.primary, fontWeight: "600", marginBottom: 3 },
  venueTableRow: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textSecondary, marginBottom: 2 },

  thumbnailGrid: { flexDirection: "row", flexWrap: "wrap", gap: isWeb ? 8 : SPACING.sm, marginTop: isWeb ? 12 : SPACING.md },
  thumbnailOption: { width: isWeb ? "13%" : "31%", aspectRatio: 1, borderRadius: isWeb ? W.radius : RADIUS.md, borderWidth: 2, borderColor: COLORS.border, overflow: "hidden" },
  thumbnailSelected: { borderColor: COLORS.primary, borderWidth: 3 },
  thumbnailUploading: { opacity: 0.6 },
  thumbnailPlaceholder: { flex: 1, backgroundColor: COLORS.surface, justifyContent: "center", alignItems: "center", padding: isWeb ? 4 : SPACING.xs },
  thumbnailImage: { width: "100%", height: "70%", borderRadius: isWeb ? 4 : RADIUS.sm },
  thumbnailEmoji: { fontSize: isWeb ? 18 : 32 },
  thumbnailText: { color: COLORS.textMuted, fontSize: isWeb ? 8 : FONT_SIZES.xs, textAlign: "center", marginTop: 2 },
  uploadText: { color: COLORS.primary, fontWeight: "600" },
  uploadingText: { fontSize: isWeb ? 13 : FONT_SIZES.lg, color: COLORS.textMuted, fontWeight: "bold" },

  schedulePreview: { backgroundColor: COLORS.primary + "10", borderRadius: isWeb ? W.radius : RADIUS.md, padding: isWeb ? 10 : SPACING.md, marginTop: isWeb ? 10 : SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  previewTitle: { fontSize: isWeb ? 11 : FONT_SIZES.sm, fontWeight: "600", color: COLORS.text, marginBottom: 4 },
  previewStarting: { fontSize: isWeb ? 11 : FONT_SIZES.sm, color: COLORS.text, fontWeight: "500", marginBottom: 3 },
  previewPattern: { fontSize: isWeb ? 11 : FONT_SIZES.sm, color: COLORS.primary, fontWeight: "500", marginBottom: 3 },
  previewNote: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textMuted, fontStyle: "italic" },

  submitSection: { padding: isWeb ? 20 : SPACING.lg, paddingTop: isWeb ? 20 : SPACING.xl },
  submitHint: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textMuted, textAlign: "center", marginTop: 6 },

  chipSection: { backgroundColor: COLORS.surface, borderRadius: isWeb ? W.radius : RADIUS.md, padding: isWeb ? 12 : SPACING.md, marginTop: isWeb ? 12 : SPACING.lg, borderWidth: 1, borderColor: COLORS.primary + "40" },
  chipHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  chipTitle: { fontSize: isWeb ? W.inputFontSize : FONT_SIZES.md, fontWeight: "700", color: COLORS.text },
  chipResetButton: { paddingVertical: isWeb ? 3 : SPACING.xs, paddingHorizontal: isWeb ? 8 : SPACING.sm, borderRadius: isWeb ? 4 : RADIUS.sm, borderWidth: 1, borderColor: COLORS.textMuted },
  chipResetText: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: "500" },
  chipDescription: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textSecondary, marginBottom: isWeb ? 10 : SPACING.md, lineHeight: 16 },
  chipRowHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: 4, paddingHorizontal: SPACING.xs },
  chipColumnLabel: { fontSize: isWeb ? 9 : FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: isWeb ? 6 : SPACING.sm },
  chipInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: isWeb ? 4 : RADIUS.sm, paddingVertical: isWeb ? 4 : SPACING.sm, paddingHorizontal: isWeb ? 6 : SPACING.sm, fontSize: isWeb ? 11 : FONT_SIZES.sm, color: COLORS.text, textAlign: "center" },
  chipLabelInput: { textAlign: "left" },
  chipRemoveButton: { width: 36, alignItems: "center", justifyContent: "center" },
  chipAddButton: { backgroundColor: COLORS.primary, paddingVertical: isWeb ? 4 : SPACING.sm, paddingHorizontal: isWeb ? 10 : SPACING.md, borderRadius: isWeb ? 4 : RADIUS.sm, alignSelf: "flex-start", marginTop: 4 },
  chipAddButtonText: { color: COLORS.white, fontSize: isWeb ? 11 : FONT_SIZES.sm, fontWeight: "600" },
  chipPreview: { backgroundColor: COLORS.primary + "10", borderRadius: isWeb ? 4 : RADIUS.sm, padding: isWeb ? 10 : SPACING.md, marginTop: isWeb ? 8 : SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  chipPreviewTitle: { fontSize: isWeb ? 11 : FONT_SIZES.sm, fontWeight: "600", color: COLORS.text, marginBottom: 3 },
  chipPreviewRow: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textSecondary, marginBottom: 2 },
  disabledFieldWrapper: { opacity: 0.45 },
  chipDisabledHint: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 3, fontStyle: "italic" },
  chipDisabledBanner: { backgroundColor: COLORS.primary + "15", borderRadius: isWeb ? 4 : RADIUS.sm, paddingVertical: isWeb ? 5 : SPACING.sm, paddingHorizontal: isWeb ? 10 : SPACING.md, marginBottom: isWeb ? 8 : SPACING.sm },
  chipDisabledBannerText: { fontSize: isWeb ? 10 : FONT_SIZES.xs, color: COLORS.primary, fontWeight: "500" },
});
