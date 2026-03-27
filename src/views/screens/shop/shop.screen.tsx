import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

export const ShopScreen = () => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.title}>SHOP</Text>
      </View>

      <View style={styles.content}>
        <Text allowFontScaling={false} style={styles.icon}>🛒</Text>
        <Text allowFontScaling={false} style={styles.message}>Shop & Giveaways</Text>
        <Text allowFontScaling={false} style={styles.submessage}>Coming Soon!</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: scale(SPACING.md),
    paddingTop: scale(SPACING.xl),
  },
  title: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: moderateScale(60),
    marginBottom: scale(SPACING.md),
  },
  message: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: scale(SPACING.sm),
  },
  submessage: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textMuted,
  },
});
