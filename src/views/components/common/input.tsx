import { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

interface InputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
  helper?: string;
  disabled?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  textContentType?: TextInputProps["textContentType"];
  autoComplete?: TextInputProps["autoComplete"];
  passwordRules?: string;
  autoFillActive?: boolean;
}

export const Input = ({ label, value, onChangeText, placeholder, secureTextEntry = false, showPasswordToggle = false, keyboardType = "default", autoCapitalize = "sentences", error, helper, disabled = false, multiline = false, numberOfLines = 1, textContentType, autoComplete, passwordRules, autoFillActive = false }: InputProps) => {
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isSecure = secureTextEntry && !passwordVisible;

  return (
    <View style={styles.container}>
      {label && (
        <Text allowFontScaling={false} style={[styles.label, isWeb && focused && styles.labelFocused]}>{label}</Text>
      )}
      <View style={styles.inputWrapper}>
        <TextInput
          allowFontScaling={false}
          style={[
            styles.input,
            showPasswordToggle && styles.inputWithToggle,
            error && styles.inputError,
            disabled && styles.inputDisabled,
            multiline && styles.multiline,
            autoFillActive && styles.autoFillInput,
            isWeb && focused && !error && styles.inputFocused,
            isWeb && { transition: "border-color 0.18s ease, box-shadow 0.18s ease", outline: "none" } as any,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={!disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textContentType={textContentType}
          autoComplete={autoComplete}
          passwordRules={passwordRules}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {showPasswordToggle && secureTextEntry && (
          <TouchableOpacity style={styles.toggleButton} onPress={() => setPasswordVisible((v) => !v)} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={styles.toggleText}>{passwordVisible ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error && <Text allowFontScaling={false} style={styles.error}>{error}</Text>}
      {helper && !error && <Text allowFontScaling={false} style={styles.helper}>{helper}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: wxSc(SPACING.md) },
  label: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.text, marginBottom: wxSc(SPACING.xs), fontWeight: "500", transition: "color 0.18s ease" as any },
  labelFocused: { color: COLORS.primary },
  inputWrapper: { position: "relative" },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: wxSc(SPACING.md), paddingHorizontal: wxSc(SPACING.md), fontSize: wxMs(FONT_SIZES.md), color: COLORS.text },
  inputWithToggle: { paddingRight: wxSc(SPACING.xl + SPACING.lg) },
  inputFocused: { borderColor: COLORS.primary, boxShadow: `0 0 0 3px ${COLORS.primary}33` } as any,
  inputError: { borderColor: COLORS.error },
  inputDisabled: { opacity: 0.5 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  autoFillInput: { backgroundColor: "#1a3a5c", borderColor: "#2d6cb4", color: "#ffffff" },
  toggleButton: { position: "absolute", right: wxSc(SPACING.md), top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: wxSc(SPACING.xs) },
  toggleText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  error: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.error, marginTop: wxSc(SPACING.xs) },
  helper: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: wxSc(SPACING.xs) },
});