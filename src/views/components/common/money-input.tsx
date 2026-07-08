// src/views/components/common/money-input.tsx
// Reusable currency input. While focused you type freely (digits + one decimal,
// max two places — "20.5", "20.", ".5" are all fine). On blur it formats to a
// single two-decimal amount shown as "$5.00" — no per-keystroke reformatting and
// no split "$5 .00" affix. Empty stays empty. The stored value is a plain number
// string ("5.00"), so existing validation/backends are unaffected.

import { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

// Allow only digits and a single decimal point (max two decimals) WHILE typing.
export const sanitizeCurrencyInput = (text: string): string => {
  let s = text.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    const intPart = s.slice(0, dot);
    const decPart = s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    s = `${intPart}.${decPart}`;
  }
  return s;
};

// Normalize to exactly two decimals on blur (5 -> "5.00", ".5" -> "0.50",
// "20." -> "20.00"). Empty stays empty.
export const formatCurrency = (raw: string): string => {
  const s = (raw ?? "").trim();
  if (s === "") return "";
  const n = parseFloat(s);
  return isNaN(n) ? "" : n.toFixed(2);
};

export const MoneyInput = ({
  value,
  onChange,
  disabled,
  compact,
  placeholder = "0.00",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
}) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const display = focused && draft != null ? draft : value;
  return (
    <View
      style={[
        styles.box,
        compact && styles.boxCompact,
        focused && !disabled && styles.boxFocused,
        disabled && styles.boxDisabled,
      ]}
    >
      <Text allowFontScaling={false} style={styles.affix}>
        $
      </Text>
      <TextInput
        allowFontScaling={false}
        editable={!disabled}
        style={[styles.input, isWeb ? ({ outlineStyle: "none" } as object) : null]}
        value={display}
        onFocus={() => {
          setDraft(value);
          setFocused(true);
        }}
        onChangeText={(t) => setDraft(sanitizeCurrencyInput(t))}
        onBlur={() => {
          setFocused(false);
          onChange(formatCurrency(draft ?? value));
          setDraft(null);
        }}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        keyboardType="decimal-pad"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    width: isWeb ? 150 : 130,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: isWeb ? 9 : 7,
    minHeight: 40,
  },
  boxCompact: { width: isWeb ? 104 : 96, paddingHorizontal: 8 },
  boxFocused: { borderColor: COLORS.primary },
  boxDisabled: { opacity: 0.5 },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    paddingVertical: 0,
    marginLeft: 3,
  },
  affix: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: "600" },
});
