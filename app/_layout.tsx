import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { analyticsService } from "../src/models/services/analytics.service";
import { AuthProvider } from "../src/providers/AuthProvider";
import { QueryProvider } from "../src/providers/QueryProvider";

export const STRIPE_PUBLISHABLE_KEY = "pk_test_51THVAnJkrBtoXOiDIf3TFgKI947X9rJ93yWanQMg8l7fU0AOzVnXotpRUP4fVWo55ijASAs63T7MUab4AXHup4d400htclFqDx";

function AppProviders({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "web") {
    try {
      const { StripeProvider } = require("@stripe/stripe-react-native");
      return (
        <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.competerf">
          {children}
        </StripeProvider>
      );
    } catch {
      return <>{children}</>;
    }
  }
  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    analyticsService.trackAppOpened({
      platform: Platform.OS,
    });
  }, []);

  return (
    <SafeAreaProvider>
      <AppProviders>
        <QueryProvider>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }} initialRouteName="(tabs)">
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth" />
            </Stack>
          </AuthProvider>
        </QueryProvider>
      </AppProviders>
    </SafeAreaProvider>
  );
}