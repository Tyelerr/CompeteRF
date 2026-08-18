// src/views/components/tournament/TournamentEntrySection.tsx
// Shared "Tournament Entry" block for elimination + chip. Every line is one tappable
// row: [checkbox] Label ............ Status — matching the elimination card's visual
// language. TWO independent concepts, never conflated:
//
//   Entry Fee   checkbox = COLLECTED. Checked → "Paid", unchecked → "Unpaid".
//               The tournament REQUIRING a fee does not mean it has been paid, so the
//               box is NOT force-checked; it defaults Unpaid until the TD collects.
//               Source of truth: chip_entries.paid / tournament_players.paid_entry.
//   Side Pot    checkbox = ENTERED (membership). Checked → "Entered", else "Not
//               Entered". Source: paid_side_pots (a text[] of pot NAMES).
//
// variant "select"  (Add Player): same rows + a live "Total Selected" = the amount
//                    owed/entered (entry fee is always part of the entry + entered
//                    pots). Payment state does NOT change the total — it's what's owed.
// variant "display" (roster card): the same rows, no total.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { SidePotDef, formatMoney, selectedEntryTotal } from "../../../utils/side-pots";

export interface TournamentEntrySectionProps {
  variant: "select" | "display";
  entryFee?: number | null;
  sidePots: SidePotDef[];
  enteredPots: string[]; // paid_side_pots names (membership)
  // Entry-fee COLLECTED flag + toggle. checked = Paid, unchecked = Unpaid.
  paidEntry?: boolean;
  onTogglePaidEntry?: () => void;
  // Toggle a side pot's ENTERED state.
  onToggleSidePot?: (name: string, entered: boolean) => void;
  readOnly?: boolean;
}

export const TournamentEntrySection = ({
  variant,
  entryFee,
  sidePots,
  enteredPots,
  paidEntry,
  onTogglePaidEntry,
  onToggleSidePot,
  readOnly,
}: TournamentEntrySectionProps) => {
  const entered = new Set(enteredPots);
  const hasFee = (Number(entryFee) || 0) > 0;
  const pots = sidePots.filter((p) => (p.name ?? "").trim());
  const isSelect = variant === "select";

  // One entry row: [checkbox] label ......... status. Tappable when a handler is
  // supplied and not read-only. checked drives BOTH the box and the status accent.
  const row = (
    key: string,
    label: string,
    checked: boolean,
    onText: string,
    offText: string,
    onPress?: () => void,
  ) => {
    const tappable = !!onPress && !readOnly;
    const body = (
      <>
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked && <Text allowFontScaling={false} style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text allowFontScaling={false} style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        <Text
          allowFontScaling={false}
          style={[styles.rowStatus, checked ? styles.rowStatusOn : styles.rowStatusOff]}
        >
          {checked ? onText : offText}
        </Text>
      </>
    );
    return tappable ? (
      <TouchableOpacity
        key={key}
        style={styles.row}
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        {body}
      </TouchableOpacity>
    ) : (
      <View key={key} style={styles.row}>{body}</View>
    );
  };

  const feeRow = hasFee
    ? row(
        "entry",
        `Entry Fee (${formatMoney(entryFee)})`,
        !!paidEntry,
        "Paid",
        "Unpaid",
        onTogglePaidEntry,
      )
    : null;

  const potRows = pots.map((p) =>
    row(
      p.name,
      `${p.name} (${formatMoney(p.amount)})`,
      entered.has(p.name),
      "Entered",
      "Not Entered",
      onToggleSidePot ? () => onToggleSidePot(p.name, !entered.has(p.name)) : undefined,
    ),
  );

  if (!isSelect) {
    // Card: just the rows (the card owns any surrounding heading / divider). No top
    // margin so it sits tight under the Fargo row as one grouped section.
    return (
      <View style={styles.wrapDisplay}>
        {feeRow}
        {potRows}
      </View>
    );
  }

  const total = selectedEntryTotal(entryFee, pots, enteredPots);
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.heading}>Tournament Entry</Text>
      {feeRow}
      {hasFee && (
        <Text allowFontScaling={false} style={styles.hint}>Mark Paid when the entry fee is collected.</Text>
      )}
      {pots.length > 0 && (
        <>
          <Text allowFontScaling={false} style={styles.subheading}>Side Pots</Text>
          {potRows}
        </>
      )}
      {(hasFee || pots.length > 0) && (
        <View style={styles.totalRow}>
          <Text allowFontScaling={false} style={styles.totalLabel}>Total Selected</Text>
          <Text allowFontScaling={false} style={styles.totalValue}>{formatMoney(total)}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: webSc(SPACING.sm) },
  wrapDisplay: { marginTop: 0 },
  heading: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", marginBottom: webSc(SPACING.xs) },
  subheading: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: webSc(SPACING.sm), marginBottom: 2 },
  hint: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginLeft: webSc(30), marginTop: -2, marginBottom: 2 },

  // [checkbox] label ......... status
  row: { flexDirection: "row", alignItems: "center", paddingVertical: webSc(SPACING.xs), borderTopWidth: 1, borderTopColor: COLORS.border },
  checkbox: {
    width: webSc(22),
    height: webSc(22),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  checkboxOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  checkboxMark: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  rowLabel: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", marginLeft: webSc(SPACING.sm) },
  rowStatus: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginLeft: webSc(SPACING.sm) },
  // Neutral, not green: the checked checkbox is the green signal, so "Paid"/"Entered"
  // stay quiet text — keeps Ready cards from being a wall of green.
  rowStatusOn: { color: COLORS.text },
  rowStatusOff: { color: COLORS.textMuted },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: webSc(SPACING.sm),
    paddingTop: webSc(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  totalValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
});
