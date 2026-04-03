import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

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
  const textStyles = [styles.text, styles[(variant + "Text") as keyof typeof styles], styles[(size + "Text") as keyof typeof styles]];
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
  sm: { paddingVertical: wxSc(SPACING.sm), paddingHorizontal: wxSc(SPACING.md) },
  md: { paddingVertical: wxSc(SPACING.md), paddingHorizontal: wxSc(SPACING.lg) },
  lg: { paddingVertical: wxSc(SPACING.lg), paddingHorizontal: wxSc(SPACING.xl) },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  text: { fontWeight: "600" },
  primaryText: { color: COLORS.white },
  secondaryText: { color: COLORS.white },
  outlineText: { color: COLORS.primary },
  ghostText: { color: COLORS.primary },
  smText: { fontSize: wxMs(FONT_SIZES.sm) },
  mdText: { fontSize: wxMs(FONT_SIZES.md) },
  lgText: { fontSize: wxMs(FONT_SIZES.lg) },
});