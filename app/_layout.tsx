import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { analyticsService } from "../src/models/services/analytics.service";
import { AuthProvider } from "../src/providers/AuthProvider";
import { QueryProvider } from "../src/providers/QueryProvider";

export default function RootLayout() {
  // Clear any persisted navigation state that could cause rehydration crashes
  // Track app opened once on mount
  useEffect(() => {
    analyticsService.trackAppOpened({
      platform: Platform.OS,
    });
  }, []);

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} initialRouteName="(tabs)">
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth" />
          </Stack>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
