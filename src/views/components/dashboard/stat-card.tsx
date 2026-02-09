import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface StatCardProps {
  icon: string;
  value?: number;
  label: string;
  onPress?: () => void;
}

export const StatCard = ({ icon, value, label, onPress }: StatCardProps) => {
  const noValue = value === undefined;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={[styles.icon, noValue && styles.iconLarge]}>{icon}</Text>
      {value !== undefined && <Text style={styles.value}>{value}</Text>}
      <Text style={[styles.label, noValue && styles.labelLarge]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 100,
  },
  icon: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  iconLarge: {
    fontSize: 32,
  },
  value: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.text,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  labelLarge: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});
