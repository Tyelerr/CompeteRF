import "../src/utils/web-alert"; // patch RN-web's no-op Alert.alert (side effect)
import { Stack } from "expo-router";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { analyticsService } from "../src/models/services/analytics.service";
import { AuthProvider } from "../src/providers/AuthProvider";
import { QueryProvider } from "../src/providers/QueryProvider";
import { WebAlertHost } from "../src/views/components/common/WebAlertHost";
import { COLORS } from "../src/theme/colors";

SplashScreen.preventAutoHideAsync();

// Dark navigation theme so the background BEHIND screen transitions is dark, not
// the React Navigation default white (which flashes at the top during the card
// animation before the screen paints).
const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: COLORS.background,
    card: COLORS.background,
    border: COLORS.border,
    text: COLORS.text,
    primary: COLORS.primary,
  },
};

function AnimatedSplash({ onComplete }: { onComplete: () => void }) {
  // Logo is visible and at normal size from the first frame — the animation is a
  // pronounced grow, then a fade-out reveal (no entrance fade).
  const scale = useRef(new Animated.Value(1)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1) GROW: normal size → ~2.3x. Ease-out cubic makes the growth smooth and
      //    obvious (fast start, gentle settle).
      Animated.timing(scale, {
        toValue: 2.3,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 2) HOLD briefly at full size.
      Animated.delay(150),
      // 3) FADE OUT the whole splash (black + grown logo), revealing the app
      //    underneath. onComplete fires only after this finishes → clean unmount.
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => onComplete());
  }, []);

  return (
    <Animated.View style={[styles.splash, { opacity: containerOpacity }]}>
      <Animated.Image
        source={require("../assets/images/icon.png")}
        style={[styles.splashIcon, { transform: [{ scale }] }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    analyticsService.trackAppOpened({ platform: Platform.OS });
    SplashScreen.hideAsync().then(() => setAppReady(true));
  }, []);

  return (
    <SafeAreaProvider style={styles.root}>
      {/* App-wide native status bar. Rendered once at the root so every screen and
          modal inherits it — the phone's time, battery, signal and Wi-Fi stay visible
          throughout the app. style="light" forces light (readable) icons/text over our
          dark UI regardless of the device's system light/dark setting. It is never
          hidden here; a full-screen experience that truly needs it gone must opt out
          locally. translucent lets content sit edge-to-edge while safe-area insets
          (from SafeAreaProvider) keep real content out from under it. */}
      <StatusBar style="light" translucent />
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider value={NAV_THEME}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: COLORS.background },
              }}
              initialRouteName="(tabs)"
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="legal" />
              <Stack.Screen name="account-deletion" />
            </Stack>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
      {appReady && !splashDone && (
        <AnimatedSplash onComplete={() => setSplashDone(true)} />
      )}
      <WebAlertHost />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  splash: {
    // Explicit full-screen positioning. NOTE: RN 0.86 (SDK 57) removed
    // StyleSheet.absoluteFillObject — spreading it yielded `undefined`, which dropped
    // the absolute positioning and let the splash collapse into normal layout at the
    // bottom of the screen. Positioning explicitly is version-proof.
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  splashIcon: {
    width: 180,
    height: 180,
  },
});
