// src/views/components/common/money-input.tsx
// Compact money input that reads as a single "$55.00" unit inside one box.
// You type whole dollars left-to-right; "$" and ".00" are fixed affixes so the
// editable text never fights the decimals (cursor stays in the dollars). On web
// the input auto-sizes to its content so the affixes hug the number.

import { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

// "55.00" -> editable dollars "55"; typed text -> stored "<n>.00".
const dollarsOf = (stored: string): string => (stored ? stored.split(".")[0] : "");
const toStored = (typed: string): string => {
  const digits = typed.replace(/\D/g, "");
  return digits ? String(parseInt(digits, 10)) + ".00" : "";
};

export const MoneyInput = ({
  value,
  onChange,
  placeholder = "0",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.box,
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
        style={[
          styles.input,
          isWeb
            ? ({ fieldSizing: "content", outlineStyle: "none" } as object)
            : null,
        ]}
        value={dollarsOf(value)}
        onChangeText={(v) => onChange(toStored(v))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={value ? "" : placeholder}
        placeholderTextColor={COLORS.textMuted}
        keyboardType="decimal-pad"
      />
      <Text allowFontScaling={false} style={styles.affix}>
        .00
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: isWeb ? 8 : 6,
    minHeight: 38,
  },
  boxFocused: { borderColor: COLORS.primary },
  boxDisabled: { opacity: 0.5 },
  input: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    paddingVertical: 0,
    textAlign: "center",
    minWidth: isWeb ? 14 : 40,
  },
  affix: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: "600" },
});
