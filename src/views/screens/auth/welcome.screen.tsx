import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../../lib/supabase";
import { authService } from "../../../models/services/auth.service";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { Button } from "../../components/common/button";

export const WelcomeScreen = () => {
  const router = useRouter();
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState("");

  const welcomeFade = useRef(new Animated.Value(0)).current;
  const welcomeSlide = useRef(new Animated.Value(-30)).current;
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoFade = useRef(new Animated.Value(0)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(20)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;
  const buttonsFade = useRef(new Animated.Value(0)).current;
  const buttonsSlide = useRef(new Animated.Value(30)).current;
  const glowPulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(welcomeFade, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(welcomeSlide, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(logoFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(titleFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(subtitleFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(buttonsFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(buttonsSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.3, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const handleAppleSignIn = async () => {
    setError("");
    setAppleLoading(true);
    try {
      const result = await authService.signInWithApple();
      if (!result.user) { setError("Sign in failed. Please try again."); return; }
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", result.user.id).maybeSingle();
      if (profile) {
        router.replace("/(tabs)");
      } else {
        const firstName = result.fullName?.givenName || "";
        const lastName = result.fullName?.familyName || "";
        router.replace({ pathname: "/auth/complete-profile", params: { firstName, lastName } } as any);
      }
    } catch (err: any) {
      if (err.code === "ERR_REQUEST_CANCELED") return;
      setError("Apple Sign In failed. Please try again.");
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Animated.Text allowFontScaling={false} style={[styles.welcome, { opacity: welcomeFade, transform: [{ translateY: welcomeSlide }] }]}>
          Welcome!
        </Animated.Text>
        <View style={styles.logoContainer}>
          <Animated.View style={[styles.glowRing, { opacity: glowPulse }]} />
          <Animated.View style={[styles.glowRingInner, { opacity: glowPulse }]} />
          <Animated.Text allowFontScaling={false} style={[styles.logo, { opacity: logoFade, transform: [{ scale: logoScale }] }]}>
            🎱
          </Animated.Text>
        </View>
        <Animated.Text allowFontScaling={false} style={[styles.title, { opacity: titleFade, transform: [{ translateY: titleSlide }] }]}>
          COMPETE
        </Animated.Text>
        <Animated.Text allowFontScaling={false} style={[styles.subtitle, { opacity: subtitleFade }]}>
          Find Billiards Tournaments Near You
        </Animated.Text>
      </View>

      <Animated.View style={[styles.buttons, { opacity: buttonsFade, transform: [{ translateY: buttonsSlide }] }]}>
        {Platform.OS === "ios" && (
          <View style={styles.appleButtonWrapper}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={8}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
            {appleLoading && <Text allowFontScaling={false} style={styles.loadingHint}>Signing in...</Text>}
          </View>
        )}
        {Platform.OS === "ios" && (
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text allowFontScaling={false} style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>
        )}
        <Button title="Create Account" onPress={() => router.push("/auth/register")} fullWidth />
        <View style={styles.spacer} />
        <Button title="Log In" onPress={() => router.push("/auth/login")} variant="outline" fullWidth />
        {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: scale(SPACING.lg), justifyContent: "space-between" },
  content: { flex: 1, alignItems: "center", justifyContent: "center" },
  welcome: { fontSize: moderateScale(34), fontWeight: "700", color: "#4A90D9", marginBottom: scale(SPACING.xl), letterSpacing: 1 },
  logoContainer: { alignItems: "center", justifyContent: "center", marginBottom: scale(SPACING.lg), width: scale(140), height: scale(140) },
  glowRing: { position: "absolute", width: scale(140), height: scale(140), borderRadius: scale(70), backgroundColor: "transparent", borderWidth: 2, borderColor: "#4A90D9", shadowColor: "#4A90D9", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20, elevation: 10 },
  glowRingInner: { position: "absolute", width: scale(110), height: scale(110), borderRadius: scale(55), backgroundColor: "rgba(74, 144, 217, 0.08)", borderWidth: 1, borderColor: "rgba(74, 144, 217, 0.3)" },
  logo: { fontSize: moderateScale(80) },
  title: { fontSize: moderateScale(FONT_SIZES.title), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.sm) },
  subtitle: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.textSecondary, textAlign: "center" },
  buttons: { paddingBottom: scale(SPACING.xl) },
  appleButtonWrapper: { alignItems: "center", marginBottom: scale(SPACING.sm) },
  appleButton: { width: "100%", height: 50 },
  loadingHint: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), marginTop: scale(SPACING.xs) },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: scale(SPACING.md) },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), marginHorizontal: scale(SPACING.md) },
  spacer: { height: scale(SPACING.md) },
  error: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), textAlign: "center", marginTop: scale(SPACING.md) },
});
