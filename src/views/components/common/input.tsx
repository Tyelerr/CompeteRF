import { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

interface InputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
  helper?: string;
  disabled?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  // iOS autofill props
  textContentType?: TextInputProps["textContentType"];
  autoComplete?: TextInputProps["autoComplete"];
  passwordRules?: string;
  // When true, applies dark-on-blue styling for iOS strong password fields
  autoFillActive?: boolean;
}

export const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  error,
  helper,
  disabled = false,
  multiline = false,
  numberOfLines = 1,
  textContentType,
  autoComplete,
  passwordRules,
  autoFillActive = false,
}: InputProps) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, isWeb && focused && styles.labelFocused]}>
          {label}
        </Text>
      )}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            error && styles.inputError,
            disabled && styles.inputDisabled,
            multiline && styles.multiline,
            autoFillActive && styles.autoFillInput,
            // Web focus glow
            isWeb && focused && !error && styles.inputFocused,
            isWeb && {
              // @ts-ignore — web only
              transition: "border-color 0.18s ease, box-shadow 0.18s ease",
              outline: "none",
            },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={secureTextEntry}
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
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {helper && !error && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
    // @ts-ignore — web only
    transition: "color 0.18s ease",
  },
  labelFocused: {
    color: COLORS.primary,
  },
  inputWrapper: {
    position: "relative",
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  inputFocused: {
    borderColor: COLORS.primary,
    // @ts-ignore — web only
    boxShadow: `0 0 0 3px ${COLORS.primary}33`,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  autoFillInput: {
    backgroundColor: "#1a3a5c",
    borderColor: "#2d6cb4",
    color: "#ffffff",
  },
  error: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error,
    marginTop: SPACING.xs,
  },
  helper: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
});
