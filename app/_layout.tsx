import "../src/utils/web-alert"; // patch RN-web's no-op Alert.alert (side effect)
import { Stack } from "expo-router";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.82)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 70,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(750),
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => onComplete());
  }, []);

  return (
    <Animated.View style={[styles.splash, { opacity: containerOpacity }]}>
      <Animated.Image
        source={require("../assets/images/icon.png")}
        style={[
          styles.splashIcon,
          { opacity, transform: [{ scale }, { translateY }] },
        ]}
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  splashIcon: {
    width: 180,
    height: 180,
  },
});
