// src/views/screens/admin/giveaway-console/earning-rules.styles.ts
// Earning Rules (web desktop). One panel treatment for every section and one fixed control column
// ([input][unit]) so every value, unit and switch lines up across the page.
import { StyleSheet } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";

const PAD_X = SPACING.md; // 16 — horizontal padding for headers and rows
const GAP = 20; // space between panels / columns
const INPUT_W = 64;
const INPUT_H = 34;
const UNIT_W = 64;
/** Width of the right-hand control column ([input][gap][unit]). */
export const CONTROL_W = INPUT_W + SPACING.sm + UNIT_W;

export const rulesSt = StyleSheet.create({
  // ── Stat strip: 6 equal cells, tight ───────────────────────────────────────────────────────
  statStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundLight,
    marginBottom: GAP,
    overflow: "hidden",
  },
  stat: { paddingVertical: SPACING.sm + 2, paddingHorizontal: PAD_X },
  statDivider: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  statRowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  statValue: { color: COLORS.text, fontSize: FONT_SIZES.xl, lineHeight: 26, fontWeight: "700" },
  statLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, lineHeight: 16 },

  // ── Grid: 2 columns on desktop, stacks below ~900px ────────────────────────────────────────
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, alignItems: "stretch" },
  col: { flexGrow: 1, flexShrink: 1, flexBasis: 440, minWidth: 0, gap: GAP },

  // ── Panel ──────────────────────────────────────────────────────────────────────────────────
  panel: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundLight,
    overflow: "hidden",
  },
  /** Left panel fills the column height so both columns end on the same line. */
  panelStretch: { flexGrow: 1 },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    height: 52,
    paddingHorizontal: PAD_X,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  panelTitle: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  badge: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 999,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
  },
  badgeText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs - 1, fontWeight: "600" },

  // ── Setting rows: [label + help] [control column] ──────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 64,
    paddingHorizontal: PAD_X,
    paddingVertical: SPACING.sm + 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rowText: { flex: 1, minWidth: 0 },
  label: { color: COLORS.text, fontSize: FONT_SIZES.sm, fontWeight: "600", lineHeight: 20 },
  help: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, lineHeight: 17, marginTop: 2 },
  error: { color: COLORS.error, fontSize: FONT_SIZES.xs, marginTop: 4 },
  control: { width: CONTROL_W, flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  /** Input with no unit (milestone threshold): just the input width. */
  controlBare: { width: INPUT_W },
  input: {
    width: INPUT_W,
    height: INPUT_H,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    textAlign: "right",
    paddingHorizontal: SPACING.sm + 2,
    outlineStyle: "none" as any,
  },
  inputError: { borderColor: COLORS.error },
  unit: { width: UNIT_W, color: COLORS.textSecondary, fontSize: FONT_SIZES.xs },
  dim: { opacity: 0.5 },

  // ── Milestone rows: [threshold] referrals → + [bonus] entries ……… [delete] ─────────────────
  milestoneRow: {
    paddingHorizontal: PAD_X,
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  milestoneCells: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, minHeight: INPUT_H },
  milestoneJoin: { width: 92, color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, textAlign: "center" },

  // ── Compact info rows / footnotes ──────────────────────────────────────────────────────────
  infoRow: { paddingHorizontal: PAD_X, paddingVertical: SPACING.sm + 4 },
  footnote: {
    paddingHorizontal: PAD_X,
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, paddingHorizontal: PAD_X, paddingVertical: SPACING.sm + 4 },
  futureChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: 999,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
  },
  futureChipText: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs },

  // ── Flagged referrals (full width, right under the grid) ───────────────────────────────────
  flaggedWrap: { marginTop: GAP },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: PAD_X,
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
