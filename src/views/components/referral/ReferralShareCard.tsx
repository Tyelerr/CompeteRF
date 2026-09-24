// src/views/components/referral/ReferralShareCard.tsx
// "Refer Friends" card: the signed-in user's referral code + link with Copy / Share.
// Self-contained (owns its viewmodel) so the Giveaways page and, later, Profile render the exact
// same component. Attribution only — deliberately NO reward language.
//
//   Web (wide):   [👥 Refer Friends / Share Compete with friends.] [CODE] [Copy Link][Share]
//   Web (narrow): stacked, both buttons.
//   Native:       compact two rows — title + code chip, then one "Share Invite" button (the native
//                 share sheet includes Copy, so a separate Copy button would just open the same sheet).
// The full link is never shown as text — Copy Link / Share carry it. On web, tapping the code
// pill copies just the code.
// Renders nothing until a code is available (logged out / still loading), so it never jumps.

import React from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useMyReferralCode } from "../../../viewmodels/hooks/use.my.referral.code";

const isWeb = Platform.OS === "web";
const WIDE_BREAKPOINT = 640;

export function ReferralShareCard() {
  const vm = useMyReferralCode();
  const { width } = useWindowDimensions();

  if (!vm.code) return null;

  const wide = isWeb && width >= WIDE_BREAKPOINT;

  const copyButton = isWeb ? (
    <Pressable style={[st.btn, st.btnPrimary]} onPress={vm.copyLink} accessibilityRole="button">
      <Text allowFontScaling={false} style={st.btnPrimaryText}>{vm.copied === "link" ? "Copied ✓" : "Copy Link"}</Text>
    </Pressable>
  ) : null;

  const shareButton = (
    <Pressable style={[st.btn, isWeb ? st.btnSecondary : st.btnPrimary]} onPress={vm.share} accessibilityRole="button">
      <Text allowFontScaling={false} style={isWeb ? st.btnSecondaryText : st.btnPrimaryText}>
        {isWeb ? "Share" : "Share Invite"}
      </Text>
    </Pressable>
  );

  const heading = (
    <View style={st.headingBlock}>
      <Text allowFontScaling={false} style={st.title}>{"👥"}  Refer Friends</Text>
      <Text allowFontScaling={false} style={st.subtitle}>Share Compete with friends.</Text>
    </View>
  );

  const codeChipContent = (
    <>
      <Text allowFontScaling={false} style={st.codeLabel}>{vm.copied === "code" ? "COPIED" : "CODE"}</Text>
      <Text allowFontScaling={false} style={st.codeText} selectable={!isWeb}>{vm.code}</Text>
    </>
  );
  const codeChip = isWeb ? (
    <Pressable style={st.codeChip} onPress={vm.copyCode} accessibilityRole="button" accessibilityLabel={`Copy referral code ${vm.code}`}>
      {codeChipContent}
    </Pressable>
  ) : (
    <View style={st.codeChip}>{codeChipContent}</View>
  );

  if (wide) {
    return (
      <View style={[st.card, st.rowWide]}>
        {heading}
        {codeChip}
        <View style={st.buttonsWide}>
          {copyButton}
          {shareButton}
        </View>
      </View>
    );
  }

  return (
    <View style={st.card}>
      <View style={st.rowTop}>
        {heading}
        {codeChip}
      </View>
      <View style={st.buttonsNarrow}>
        {copyButton}
        {shareButton}
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
    paddingVertical: webSc(SPACING.sm + SPACING.xs),
    paddingHorizontal: webSc(SPACING.md),
  },
  // flex: 1 fills the wide-web column so it matches the Giveaway Entries card's height exactly.
  rowWide: { flex: 1, flexDirection: "row", alignItems: "center", gap: webSc(SPACING.md) },
  rowTop: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  headingBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: webMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text },
  subtitle: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: 2 },

  codeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs + 2),
    backgroundColor: COLORS.primary + "1A",
    borderColor: COLORS.primary + "55",
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
  },
  codeLabel: { fontSize: webMs(FONT_SIZES.xs - 2), fontWeight: "700", color: COLORS.textSecondary, letterSpacing: 0.8 },
  codeText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.primaryLight, letterSpacing: 1 },

  buttonsWide: { flexDirection: "row", gap: webSc(SPACING.sm) },
  buttonsNarrow: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  btn: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
  },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnSecondary: { backgroundColor: COLORS.surfaceLight },
  btnPrimaryText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.white },
  btnSecondaryText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
});
