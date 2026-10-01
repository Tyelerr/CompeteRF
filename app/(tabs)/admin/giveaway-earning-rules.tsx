import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { EarningRulesScreen } from "../../../src/views/screens/admin/giveaway-console/earning-rules.screen";

// Giveaway Management → Earning Rules is a web/desktop admin tool (Super Admin). Native shows a
// pointer instead of a second, phone-sized editor.
export default function GiveawayEarningRulesRoute() {
  if (Platform.OS === "web") return <EarningRulesScreen />;
  return (
    <View style={nativeSt.page}>
      <Text allowFontScaling={false} style={nativeSt.title}>Earning Rules</Text>
      <Text allowFontScaling={false} style={nativeSt.body}>
        Earning rules are managed from the web admin at thecompeteapp.com → Admin → Giveaways → Earning Rules.
      </Text>
    </View>
  );
}

const nativeSt = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg, justifyContent: "center" },
  title: { color: COLORS.text, fontSize: FONT_SIZES.xl, fontWeight: "700", marginBottom: SPACING.sm },
  body: { color: COLORS.textSecondary, fontSize: FONT_SIZES.md, lineHeight: 22 },
});
