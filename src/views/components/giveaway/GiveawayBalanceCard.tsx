// src/views/components/giveaway/GiveawayBalanceCard.tsx
// "🎟 GIVEAWAY ENTRIES · N Available" — the signed-in user's Giveaway Entries balance, shown even
// at 0. Presentation only (balance comes from useGiveaways). No earning buttons yet: Daily Entry
// and referral rewards don't exist, so nothing here promises them.
//   stacked (web / wide):  label on top, big number below — sits beside the Refer Friends card.
//   inline  (mobile):      one slim row, so Active Now isn't pushed down.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";

interface Props {
  balance: number;
  variant: "stacked" | "inline";
}

export function GiveawayBalanceCard({ balance, variant }: Props) {
  if (variant === "inline") {
    return (
      <View style={[st.card, st.inline]}>
        <Text allowFontScaling={false} style={st.label}>{"🎟"}  GIVEAWAY ENTRIES</Text>
        <Text allowFontScaling={false} style={st.inlineValue}>
          <Text style={st.inlineNumber}>{balance}</Text> Available
        </Text>
      </View>
    );
  }
  return (
    <View style={[st.card, st.stacked]}>
      <Text allowFontScaling={false} style={st.label}>{"🎟"}  GIVEAWAY ENTRIES</Text>
      <View style={st.stackedRow}>
        <Text allowFontScaling={false} style={st.number}>{balance}</Text>
        <Text allowFontScaling={false} style={st.available}>Available</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: webSc(SPACING.md),
  },
  // flex: 1 fills the wide-web column so it matches the Refer Friends card's height exactly
  // (the row stretches both columns); stacked is only used on wide web.
  stacked: { flex: 1, paddingVertical: webSc(SPACING.sm + SPACING.xs), justifyContent: "center" },
  stackedRow: { flexDirection: "row", alignItems: "baseline", gap: webSc(SPACING.xs + 2), marginTop: 2 },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.sm + 2),
  },
  label: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.textSecondary, letterSpacing: 0.8 },
  number: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "800", color: COLORS.text },
  available: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  inlineValue: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  inlineNumber: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
});
