import { forwardRef } from "react";
import { Platform, TextInput, type TextInputProps } from "react-native";
import { COLORS } from "../../../theme/colors";

const isWeb = Platform.OS === "web";

/**
 * Drop-in replacement for TextInput with blue focus glow on web.
 * Forwards refs so vm.refs.name etc. work exactly as before.
 */
export const FocusTextInput = forwardRef<TextInput, TextInputProps>(
  (props, ref) => {
    const handleFocus = (e: any) => {
      if (isWeb && e?.target) {
        e.target.style.borderColor = COLORS.primary;
        e.target.style.boxShadow = `0 0 0 3px ${COLORS.primary}33`;
        e.target.style.transition =
          "border-color 0.18s ease, box-shadow 0.18s ease";
        e.target.style.outline = "none";
      }
      props.onFocus?.(e);
    };

    const handleBlur = (e: any) => {
      if (isWeb && e?.target) {
        e.target.style.borderColor = "#333333";
        e.target.style.boxShadow = "none";
      }
      props.onBlur?.(e);
    };

    return (
      <TextInput
        {...props}
        ref={ref}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );
  },
);

FocusTextInput.displayName = "FocusTextInput";
