import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

interface BadgeProps { label: string; variant?: "primary" | "success" | "warning" | "error" | "info"; }

export const Badge = ({ label, variant = "primary" }: BadgeProps) => {
  return (
    <View style={[styles.badge, styles[variant]]}>
      <Text allowFontScaling={false} style={styles.text}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.full },
  primary: { backgroundColor: COLORS.primary },
  success: { backgroundColor: COLORS.success },
  warning: { backgroundColor: COLORS.warning },
  error: { backgroundColor: COLORS.error },
  info: { backgroundColor: COLORS.info },
  text: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.white },
});
