import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";

interface ToggleSwitchProps { label: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; }

export const ToggleSwitch = ({ label, value, onValueChange, disabled = false }: ToggleSwitchProps) => {
  return (
    <View style={styles.container}>
      <Text allowFontScaling={false} style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ false: COLORS.border, true: COLORS.primary }} thumbColor={value ? COLORS.white : COLORS.textMuted} ios_backgroundColor={COLORS.border} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: isWeb ? SPACING.sm : scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  label: { fontSize: isWeb ? FONT_SIZES.sm : moderateScale(FONT_SIZES.md), color: COLORS.text, fontWeight: "500" },
  labelDisabled: { color: COLORS.textMuted },
});