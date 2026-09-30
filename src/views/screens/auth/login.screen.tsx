import { useRouter } from "expo-router";
import { useRef } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { useLogin } from "../../../viewmodels/useLogin";
import { useSocialSignIn } from "../../../viewmodels/hooks/use.social.sign.in";
import { GoogleSignInButton } from "../../components/auth/GoogleSignInButton";
import { Button } from "../../components/common/button";
import { Input } from "../../components/common/input";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

export const LoginScreen = () => {
  const router = useRouter();
  // Sign-in + post-auth routing (ready → app, no profile → complete-profile) live in useLogin.
  const { identifier, setIdentifier, password, setPassword, error, loading, handleLogin } = useLogin();
  // "Continue with Google" — rendered only when available (flags off → nothing).
  const google = useSocialSignIn();
  // Web only: lets Enter in the username field jump to the password field.
  const passwordRef = useRef<TextInput>(null);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
      </TouchableOpacity>
      {isWeb ? (
        <View style={styles.webCenter}>
          <Text allowFontScaling={false} style={styles.title}>LOG IN</Text>
          <View style={styles.cardWeb}>
            {/* Web form semantics for Chrome / password managers: username + current-password
                autocomplete tokens, stable ids, and Enter-to-submit (Enter on username \u2192
                focus password; Enter on password \u2192 submit). Auth logic is unchanged. */}
            <Input label="Email or Username" value={identifier} onChangeText={setIdentifier} placeholder="email or @username" keyboardType="default" autoCapitalize="none" autoComplete="username" textContentType="username" nativeID="login-username" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => passwordRef.current?.focus()} />
            <Input label="Password" value={password} onChangeText={setPassword} placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"} secureTextEntry showPasswordToggle autoComplete="current-password" textContentType="password" nativeID="login-password" returnKeyType="go" inputRef={passwordRef} onSubmitEditing={handleLogin} />
            <TouchableOpacity onPress={() => router.push("/auth/forgot-password" as any)} style={styles.forgotPassword}>
              <Text allowFontScaling={false} style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
            {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
            <Button title="Log In" onPress={handleLogin} loading={loading} fullWidth />
            {google.googleAvailable ? <View style={styles.googleGap} /> : null}
            <GoogleSignInButton available={google.googleAvailable} loading={google.googleLoading} onPress={google.signInWithGoogle} />
            {google.error ? <Text allowFontScaling={false} style={styles.error}>{google.error}</Text> : null}
            <View style={styles.footer}>
              <Text allowFontScaling={false} style={styles.footerText}>{"Don't have an account? "}</Text>
              <TouchableOpacity onPress={() => router.push("/auth/register" as any)}>
                <Text allowFontScaling={false} style={styles.footerLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.mobileCard}>
          <Text allowFontScaling={false} style={styles.title}>LOG IN</Text>
          <View style={styles.spacer} />
          <Input label="Email or Username" value={identifier} onChangeText={setIdentifier} placeholder="email or @username" keyboardType="default" autoCapitalize="none" />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"} secureTextEntry showPasswordToggle />
          <TouchableOpacity onPress={() => router.push("/auth/forgot-password" as any)} style={styles.forgotPassword}>
            <Text allowFontScaling={false} style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
          {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
          <Button title="Log In" onPress={handleLogin} loading={loading} fullWidth />
          {google.googleAvailable ? <View style={styles.googleGap} /> : null}
          <GoogleSignInButton available={google.googleAvailable} loading={google.googleLoading} onPress={google.signInWithGoogle} />
          {google.error ? <Text allowFontScaling={false} style={styles.error}>{google.error}</Text> : null}
          <View style={styles.footer}>
            <Text allowFontScaling={false} style={styles.footerText}>{"Don't have an account? "}</Text>
            <TouchableOpacity onPress={() => router.push("/auth/register" as any)}>
              <Text allowFontScaling={false} style={styles.footerLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bottomSpacer} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  googleGap: { height: wxSc(SPACING.md) },
  container: { flex: 1, backgroundColor: COLORS.background, padding: wxSc(SPACING.lg) },
  back: { marginTop: wxSc(SPACING.xl), marginBottom: wxSc(SPACING.lg) },
  backText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.md) },
  webCenter: { alignSelf: "center" as any, width: "100%" as any, maxWidth: 440 },
  title: { fontSize: wxMs(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginBottom: wxSc(SPACING.lg) },
  cardWeb: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
  },
  mobileCard: { flex: 1 },
  spacer: { flex: 1 },
  bottomSpacer: { flex: 2 },
  forgotPassword: { alignSelf: "flex-end", marginBottom: wxSc(SPACING.md), marginTop: -wxSc(SPACING.xs) },
  forgotPasswordText: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "500" },
  error: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.sm), marginBottom: wxSc(SPACING.md) },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: wxSc(SPACING.lg) },
  footerText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.md) },
  footerLink: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.md), fontWeight: "600" },
});