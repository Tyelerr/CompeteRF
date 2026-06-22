// src/views/components/common/field-check.tsx
// One completion check to rule them all. Every form field across the app
// (dropdowns, text inputs, date pickers, …) renders THIS component so a
// completed field looks identical everywhere — same green, same icon, same
// size, same spacing, same left-aligned position. No per-section variation.
//
// Render it as the FIRST child inside a control whose box has the shared
// CHECK_INSET left padding, so the checks line up in a single column down the
// left edge of the form. Pass `complete` only when the field holds valid data;
// when false it renders nothing (incomplete fields show no check).

import { StyleSheet, Text } from "react-native";
import { COLORS } from "../../../theme/colors";

// Shared horizontal inset for any control that hosts a FieldCheck, so the check
// (and the content after it) sits at the same x in every field.
export const CHECK_INSET = 10;

export const FieldCheck = ({ complete }: { complete?: boolean }) =>
  complete ? (
    <Text allowFontScaling={false} style={styles.check}>
      {"✓"}
    </Text>
  ) : null;

const styles = StyleSheet.create({
  check: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: "700",
    width: 14,
    textAlign: "center",
    marginRight: 7,
  },
});
