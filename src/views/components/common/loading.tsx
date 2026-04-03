import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

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
  container: { alignItems: "center", justifyContent: "center", padding: wxSc(SPACING.xl) },
  fullScreen: { flex: 1, backgroundColor: COLORS.background },
  message: { marginTop: wxSc(SPACING.md), fontSize: wxMs(FONT_SIZES.md), color: COLORS.textSecondary },
});