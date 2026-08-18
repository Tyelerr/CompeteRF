// src/views/components/common/otp-input.tsx
// Length-aware one-time-code input. A single hidden TextInput backs the visual
// boxes, so iOS SMS autofill (textContentType="oneTimeCode" / autoComplete=
// "sms-otp"), auto-advance, and backspace all work natively. Calls onComplete
// when `length` digits are present (autofill or manual) and dismisses the
// keyboard. Default length is 5 to match the Telnyx Verify profile's code.
import React, { useRef } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

interface OtpInputProps {
  value: string;
  onChange: (code: string) => void;
  onComplete: (code: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function OtpInput({ value, onChange, onComplete, length = 5, disabled, autoFocus = true }: OtpInputProps) {
  const ref = useRef<TextInput>(null);
  const boxes = Array.from({ length }, (_, i) => i);

  const handle = (t: string) => {
    const digits = t.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) {
      Keyboard.dismiss();
      onComplete(digits);
    }
  };

  return (
    <Pressable style={styles.row} onPress={() => ref.current?.focus()}>
      {boxes.map((i) => {
        const active = i === value.length;
        return (
          <View key={i} style={[styles.box, active && styles.boxActive, value[i] != null && styles.boxFilled]}>
            <Text allowFontScaling={false} style={styles.digit}>{value[i] ?? ""}</Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={handle}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        maxLength={length}
        editable={!disabled}
        caretHidden
        autoFocus={autoFocus}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: wxSc(SPACING.xs),
    marginTop: wxSc(SPACING.sm),
  },
  box: {
    flex: 1,
    aspectRatio: 0.82,
    maxWidth: wxSc(52),
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: { borderColor: COLORS.primary },
  boxFilled: { borderColor: COLORS.primary },
  digit: { fontSize: wxMs(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text },
  // Transparent input laid over the boxes so taps/focus/autofill land on it.
  hiddenInput: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0,
    color: "transparent",
  },
});
