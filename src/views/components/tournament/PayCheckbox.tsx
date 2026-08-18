// src/views/components/tournament/PayCheckbox.tsx
// Shared checkbox row for tournament entry (entry fee + side pots). Extracted from the
// elimination manage screen's inline PayCheckbox so elimination + chip can share ONE
// component. Presentational only — the caller owns the toggle + state.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";

export interface PayCheckboxProps {
  label: string;
  checked: boolean;
  onToggle?: () => void;
  // Read-only OR no handler → not tappable. When read-only + checked, the label reads
  // in the "paid/entered" accent color.
  readOnly?: boolean;
}

export const PayCheckbox = ({ label, checked, onToggle, readOnly }: PayCheckboxProps) => (
  <TouchableOpacity
    style={styles.payRow}
    onPress={onToggle}
    disabled={readOnly || !onToggle}
    activeOpacity={0.7}
    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
  >
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked && <Text allowFontScaling={false} style={styles.checkboxMark}>✓</Text>}
    </View>
    <Text
      allowFontScaling={false}
      style={[styles.payLabel, readOnly && checked && styles.payLabelPaid]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  payRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs) },
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
  payLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  payLabelPaid: { color: COLORS.success, fontWeight: "600" },
});
