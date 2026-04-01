import { StripeProvider } from "@stripe/stripe-react-native";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { analyticsService } from "../src/models/services/analytics.service";
import { AuthProvider } from "../src/providers/AuthProvider";
import { QueryProvider } from "../src/providers/QueryProvider";

const STRIPE_PUBLISHABLE_KEY = "pk_test_51THVAnJkrBtoXOiDIf3TFgKI947X9rJ93yWanQMg8l7fU0AOzVnXotpRUP4fVWo55ijASAs63T7MUab4AXHup4d400htclFqDx";

export default function RootLayout() {
  useEffect(() => {
    analyticsService.trackAppOpened({
      platform: Platform.OS,
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.competerf">
        <QueryProvider>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }} initialRouteName="(tabs)">
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth" />
            </Stack>
          </AuthProvider>
        </QueryProvider>
      </StripeProvider>
    </SafeAreaProvider>
  );
}