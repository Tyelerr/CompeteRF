import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = ({ title, onPress, variant = "primary", size = "md", disabled = false, loading = false, fullWidth = false }: ButtonProps) => {
  const buttonStyles = [styles.base, styles[variant], styles[size], fullWidth && styles.fullWidth, disabled && styles.disabled];
  const textStyles = [styles.text, styles[`${variant}Text`], styles[`${size}Text`]];

  return (
    <TouchableOpacity style={buttonStyles} onPress={onPress} disabled={disabled || loading} activeOpacity={0.7}>
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? COLORS.primary : COLORS.white} />
      ) : (
        <Text allowFontScaling={false} style={textStyles}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", borderRadius: RADIUS.md },
  primary: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.secondary },
  outline: { backgroundColor: COLORS.transparent, borderWidth: 1, borderColor: COLORS.primary },
  ghost: { backgroundColor: COLORS.transparent },
  sm: { paddingVertical: scale(SPACING.sm), paddingHorizontal: scale(SPACING.md) },
  md: { paddingVertical: scale(SPACING.md), paddingHorizontal: scale(SPACING.lg) },
  lg: { paddingVertical: scale(SPACING.lg), paddingHorizontal: scale(SPACING.xl) },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  text: { fontWeight: "600" },
  primaryText: { color: COLORS.white },
  secondaryText: { color: COLORS.white },
  outlineText: { color: COLORS.primary },
  ghostText: { color: COLORS.primary },
  smText: { fontSize: moderateScale(FONT_SIZES.sm) },
  mdText: { fontSize: moderateScale(FONT_SIZES.md) },
  lgText: { fontSize: moderateScale(FONT_SIZES.lg) },
});
