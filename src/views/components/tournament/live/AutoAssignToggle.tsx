// src/views/components/tournament/live/AutoAssignToggle.tsx
// THE Auto Assign control — one persistent tournament-level ON/OFF (live_settings.autoAssignEnabled),
// shown identically on the Dashboard and the Queue. It is independent of the Match Order mode:
// only an explicit tap on "Off" here turns Auto Assign off. Assignments themselves run
// server-side (auto-assign-run), so leaving the screen changes nothing.
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";

export const AutoAssignToggle = ({
  enabled,
  onChange,
  disabled,
  stacked,
}: {
  enabled: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  // Dashboard card: label above a full-width switch. Queue row: label inline, content-sized.
  stacked?: boolean;
}) => {
  const seg = (on: boolean) => {
    const active = enabled === on;
    return (
      <TouchableOpacity
        key={on ? "on" : "off"}
        style={[
          styles.seg,
          stacked && styles.segStacked,
          active && (on ? styles.segOnActive : styles.segOffActive),
        ]}
        onPress={() => !active && onChange(on)}
        disabled={disabled || active}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled: !!disabled }}
        accessibilityLabel={`Auto Assign ${on ? "On" : "Off"}`}
      >
        {on && active && <View style={styles.dotOn} />}
        <Text
          allowFontScaling={false}
          style={[styles.segText, active && (on ? styles.segTextOn : styles.segTextOffActive)]}
        >
          {on ? "On" : "Off"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.wrap, stacked && styles.wrapStacked]}>
      <Text allowFontScaling={false} style={[styles.label, stacked && styles.labelStacked]}>
        Auto Assign
      </Text>
      <View
        style={[styles.track, stacked && styles.trackStacked, disabled && styles.disabled]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Auto Assign"
      >
        {seg(false)}
        {seg(true)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  wrapStacked: { flexDirection: "column", alignItems: "stretch", gap: webSc(SPACING.xs) },
  label: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "800" },
  labelStacked: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700" },
  track: {
    flexDirection: "row",
    height: webSc(40),
    padding: webSc(3),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  trackStacked: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
  seg: {
    minWidth: webSc(56),
    paddingHorizontal: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.sm - 2),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: webSc(6),
  },
  segStacked: { flex: 1 },
  segOffActive: { backgroundColor: COLORS.surfaceLight },
  segOnActive: { backgroundColor: COLORS.success + "26", borderWidth: 1, borderColor: COLORS.success },
  segText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, fontWeight: "800" },
  segTextOffActive: { color: COLORS.text },
  segTextOn: { color: COLORS.success },
  dotOn: { width: webSc(8), height: webSc(8), borderRadius: webSc(4), backgroundColor: COLORS.success },
});
