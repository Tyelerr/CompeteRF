// src/views/screens/admin/giveaway-console/earning-rules.styles.ts
// Earning Rules (web desktop) — styles not already in giveaway-console.styles.
import { StyleSheet } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";

export const rulesSt = StyleSheet.create({
  pad: { paddingHorizontal: SPACING.sm + SPACING.xs, paddingBottom: SPACING.sm + SPACING.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm + SPACING.xs,
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm + SPACING.xs,
    paddingHorizontal: SPACING.sm + SPACING.xs,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  label: { color: COLORS.text, fontSize: FONT_SIZES.sm, fontWeight: "600" },
  help: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, lineHeight: 17, marginTop: 2 },
  error: { color: COLORS.error, fontSize: FONT_SIZES.xs, marginTop: 4 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.xs + 2 },
  input: {
    width: 72,
    height: 34,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    textAlign: "right",
    paddingHorizontal: SPACING.sm,
    outlineStyle: "none" as any,
  },
  inputError: { borderColor: COLORS.error },
  unit: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs },
  dim: { opacity: 0.5 },
  futureChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: 999,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
  },
  futureChipText: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs },
});
