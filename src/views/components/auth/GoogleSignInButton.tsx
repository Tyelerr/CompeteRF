import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, GOOGLE_BUTTON } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";

// Google's official "G" logo — the SVG markup exactly as emitted by Google's own Sign in with
// Google button generator (developers.google.com/identity/branding-guidelines → "Render HTML
// Button Element"). Used verbatim; never recoloured or redrawn.
const GOOGLE_G_LOGO_SVG =
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="display: block;">' +
  '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>' +
  '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>' +
  '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>' +
  '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>' +
  '<path fill="none" d="M0 0h48v48H0z"></path>' +
  "</svg>";
const GOOGLE_G_LOGO_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(GOOGLE_G_LOGO_SVG)}`;

export const GOOGLE_SIGN_IN_LABEL = "Sign in with Google";

interface GoogleSignInButtonProps {
  /** From useSocialSignIn — false while Google is unavailable here (renders nothing). */
  available: boolean;
  loading: boolean;
  /** The existing Supabase signInWithOAuth({ provider: "google" }) handler. */
  onPress: () => void;
  /** Show an "or" divider under the button (used above the password form). */
  withDivider?: boolean;
}

// "Sign in with Google" in Google's light theme (white fill, #747775 1px stroke, #1F1F1F medium
// text, official G logo on the left, 12px logo-to-text gap), sized to match Compete's auth
// buttons — Google's custom-button guidelines allow scaling as long as the logo keeps its aspect.
// The click still runs the existing Supabase OAuth handler (no Google Identity Services SDK).
// Web only for now: native Google stays disabled (a native build would render the logo with a
// PNG from Google's signin-assets bundle, since RN's Image can't draw SVG natively).
export const GoogleSignInButton = ({ available, loading, onPress, withDivider = false }: GoogleSignInButtonProps) => {
  if (!available) return null;
  return (
    <View>
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={GOOGLE_SIGN_IN_LABEL}
        accessibilityState={{ disabled: loading, busy: loading }}
        style={(state) => {
          const hovered = (state as { hovered?: boolean }).hovered === true;
          return [styles.button, hovered && !loading && styles.hovered, loading && styles.disabled];
        }}
      >
        {(state) => {
          const { pressed } = state;
          const hovered = (state as { hovered?: boolean }).hovered === true;
          return (
            <>
              <View
                pointerEvents="none"
                style={[styles.stateLayer, pressed ? styles.pressedLayer : hovered ? styles.hoverLayer : null]}
              />
              <View style={styles.content}>
                <Image source={{ uri: GOOGLE_G_LOGO_URI }} style={[styles.logo, loading && styles.dimmed]} accessibilityIgnoresInvertColors />
                <Text allowFontScaling={false} numberOfLines={1} style={[styles.label, loading && styles.dimmed]}>
                  {GOOGLE_SIGN_IN_LABEL}
                </Text>
              </View>
            </>
          );
        }}
      </Pressable>
      {withDivider ? (
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text allowFontScaling={false} style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
};

const LOGO_SIZE = 20; // Google: 20px icon
const LOGO_GAP = 12; // Google: 12px icon-to-text margin

const styles = StyleSheet.create({
  // Same footprint as the Compete auth Button (md: 16px vertical padding, 12px radius, full width).
  button: {
    width: "100%",
    minHeight: webSc(SPACING.md) * 2 + webMs(FONT_SIZES.md) + 6,
    backgroundColor: GOOGLE_BUTTON.fill,
    borderWidth: 1,
    borderColor: GOOGLE_BUTTON.stroke,
    borderRadius: RADIUS.md,
    paddingHorizontal: webSc(SPACING.md),
    justifyContent: "center",
    overflow: "hidden",
    ...(Platform.OS === "web" ? ({ cursor: "pointer", transitionProperty: "box-shadow", transitionDuration: "218ms" } as object) : {}),
  },
  // Google's hover elevation.
  hovered: Platform.OS === "web" ? ({ boxShadow: "0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15)" } as object) : {},
  disabled: Platform.OS === "web" ? ({ cursor: "default" } as object) : {},
  stateLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  hoverLayer: { backgroundColor: GOOGLE_BUTTON.hoverOverlay },
  pressedLayer: { backgroundColor: GOOGLE_BUTTON.pressedOverlay },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, marginRight: LOGO_GAP },
  label: {
    color: GOOGLE_BUTTON.text,
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "500",
    letterSpacing: 0.25,
    ...(Platform.OS === "web" ? ({ fontFamily: "Roboto, arial, sans-serif" } as object) : {}),
  },
  dimmed: { opacity: 0.38 }, // Google's disabled-content opacity
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: webSc(SPACING.md) },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: webSc(SPACING.sm), color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm) },
  spacer: { height: webSc(SPACING.sm) },
});
