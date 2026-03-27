import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

interface LoadingProps {
  message?: string;
  fullScreen?: boolean;
}

export const Loading = ({ message, fullScreen = false }: LoadingProps) => {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      {message && <Text allowFontScaling={false} style={styles.message}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", padding: scale(SPACING.xl) },
  fullScreen: { flex: 1, backgroundColor: COLORS.background },
  message: { marginTop: scale(SPACING.md), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary },
});
