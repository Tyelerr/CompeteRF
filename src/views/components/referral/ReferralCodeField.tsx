// src/views/components/referral/ReferralCodeField.tsx
// Optional "Referral Code" input for the signup screens, with a small Paste action (handy after
// the /r page copied the code before sending the user to the App Store). Presentation only —
// state comes from useReferralCodeField (owned by the screen so it can call vm.commit() on submit).

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { ReferralFieldCheck } from "../../../viewmodels/hooks/use.referral.code.field";
import { Input } from "../common/input";

interface ReferralCodeFieldProps {
  code: string;
  onChangeCode: (value: string) => void;
  check: ReferralFieldCheck;
  inviter: string | null;
  onPaste?: () => void;
  pasteNote?: string | null;
}

export function ReferralCodeField({ code, onChangeCode, check, inviter, onPaste, pasteNote }: ReferralCodeFieldProps) {
  const helper =
    check === "valid"
      ? `✓ Invited by ${inviter ?? "a friend"}`
      : check === "checking"
        ? "Checking code..."
        : "Optional — got a code from a friend? Enter it here.";

  return (
    <View>
      <View style={st.labelRow}>
        <Text allowFontScaling={false} style={st.label}>Referral Code (optional)</Text>
        {onPaste ? (
          <Pressable onPress={onPaste} hitSlop={8} accessibilityRole="button" accessibilityLabel="Paste referral code">
            <Text allowFontScaling={false} style={st.paste}>Paste</Text>
          </Pressable>
        ) : null}
      </View>
      <Input
        value={code}
        onChangeText={onChangeCode}
        placeholder="e.g. TYELERR"
        autoCapitalize="characters"
        autoComplete="off"
        helper={check === "invalid" ? undefined : helper}
        error={check === "invalid" ? "Code not found — check it or leave this blank" : undefined}
      />
      {pasteNote ? <Text allowFontScaling={false} style={st.note}>{pasteNote}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: webSc(SPACING.xs) },
  label: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "500", color: COLORS.text },
  paste: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.primaryLight },
  note: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(SPACING.xs) },
});
