import { Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { analyticsService } from "../src/models/services/analytics.service";
import { AuthProvider } from "../src/providers/AuthProvider";
import { QueryProvider } from "../src/providers/QueryProvider";

SplashScreen.preventAutoHideAsync();

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
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} initialRouteName="(tabs)">
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="legal" />
            <Stack.Screen name="privacy" />
            <Stack.Screen name="terms" />
            <Stack.Screen name="community-guidelines" />
            <Stack.Screen name="support" />
            <Stack.Screen name="account-deletion" />
          </Stack>
        </AuthProvider>
      </QueryProvider>
      {appReady && !splashDone && (
        <AnimatedSplash onComplete={() => setSplashDone(true)} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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