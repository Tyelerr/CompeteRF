// src/views/screens/admin/giveaway-console/entry-wallet-console.styles.ts
// Entry Wallet (web desktop) — the few styles not already in giveaway-console.styles.
import { StyleSheet } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";

export const walletSt = StyleSheet.create({
  pad: { paddingHorizontal: SPACING.sm + SPACING.xs, paddingBottom: SPACING.sm + SPACING.xs },
  userRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  balance: {
    alignItems: "flex-end",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm + SPACING.xs,
    paddingVertical: SPACING.xs + 2,
    backgroundColor: COLORS.backgroundLight,
  },
  balanceLabel: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs - 1, fontWeight: "700", letterSpacing: 0.6 },
  balanceValue: { color: COLORS.text, fontSize: FONT_SIZES.xxl, fontWeight: "800" },
  field: { gap: SPACING.xs + 2 },
  label: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, fontWeight: "600" },
  input: {
    height: 38,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    paddingHorizontal: SPACING.sm + 2,
    outlineStyle: "none" as any,
  },
  textarea: { height: 84, paddingTop: SPACING.sm, textAlignVertical: "top" },
});
