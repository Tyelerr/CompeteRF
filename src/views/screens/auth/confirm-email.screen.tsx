import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useConfirmEmail } from "../../../viewmodels/useConfirmEmail";
import { Button } from "../../components/common/button";

const isWeb = Platform.OS === "web";

// /auth/confirm — confirms the signup email only after the user taps Continue, then hands off to
// the shared post-auth step (no profile → Complete Profile, profile → app).
export const ConfirmEmailScreen = () => {
  const router = useRouter();
  const {
    resolving,
    awaitingContinue,
    verifying,
    confirmed,
    routing,
    routeError,
    errorTitle,
    errorMessage,
    debugInfo,
    handleContinue,
    retryRouting,
  } = useConfirmEmail();

  // Expired / used / missing / malformed link. Users see only the title, the friendly message and
  // the two actions; the debug block renders in development builds only.
  if (errorMessage) {
    return (
      <ScrollView contentContainerStyle={[styles.container, isWeb && styles.containerWeb]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"⚠️"}</Text>
          <Text allowFontScaling={false} style={styles.title}>{errorTitle}</Text>
          <Text allowFontScaling={false} style={styles.message}>{errorMessage}</Text>
          {__DEV__ && debugInfo ? (
            <View style={styles.debugBox}>
              <Text allowFontScaling={false} style={styles.debugLabel}>Debug info:</Text>
              <Text allowFontScaling={false} style={styles.debugText} selectable>{debugInfo}</Text>
            </View>
          ) : null}
        </View>
        <Button title="Request a New Link" onPress={() => router.replace("/auth/check-email" as any)} fullWidth />
        <View style={styles.spacer} />
        <Button title="Back to Login" onPress={() => router.replace("/auth/login")} variant="outline" fullWidth />
      </ScrollView>
    );
  }

  // Confirmed: the shared post-auth step is routing. If loading the account failed, offer a retry
  // (the email IS confirmed — never send them back to sign up).
  if (confirmed) {
    return (
      <View style={[styles.container, isWeb && styles.containerWeb]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"✅"}</Text>
          <Text allowFontScaling={false} style={styles.title}>EMAIL CONFIRMED</Text>
          <Text allowFontScaling={false} style={styles.message}>
            {routeError ?? "Taking you to finish setting up your account..."}
          </Text>
        </View>
        {routeError ? (
          <>
            <Button title="Try Again" onPress={retryRouting} loading={routing} fullWidth />
            <View style={styles.spacer} />
            <Button title="Back to Login" onPress={() => router.replace("/auth/login")} variant="outline" fullWidth />
          </>
        ) : null}
      </View>
    );
  }

  // A valid link has arrived, but nothing is verified until the user taps Continue.
  if (awaitingContinue) {
    return (
      <View style={[styles.container, isWeb && styles.containerWeb]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"✉️"}</Text>
          <Text allowFontScaling={false} style={styles.title}>CONFIRM YOUR EMAIL</Text>
          <Text allowFontScaling={false} style={styles.message}>
            Tap Continue to confirm your email and finish creating your Compete account.
          </Text>
        </View>
        <Button title="Continue" onPress={handleContinue} fullWidth />
      </View>
    );
  }

  // resolving (before hydration / while the launch URL resolves) or verifying.
  return (
    <View style={[styles.container, isWeb && styles.containerWeb]}>
      <View style={styles.content}>
        <Text allowFontScaling={false} style={styles.icon}>{"⏳"}</Text>
        <Text allowFontScaling={false} style={styles.title}>{verifying && !resolving ? "CONFIRMING..." : "CHECKING..."}</Text>
        <Text allowFontScaling={false} style={styles.message}>Please wait while we check your confirmation link.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: webSc(SPACING.lg) },
  // On web, constrain the column so the content doesn't stretch across the page.
  containerWeb: { maxWidth: 480, width: "100%" as any, alignSelf: "center" as any },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: webSc(SPACING.xl) },
  icon: { fontSize: webMs(60), marginBottom: webSc(SPACING.lg) },
  title: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginBottom: webSc(SPACING.md), textAlign: "center" },
  message: { fontSize: webMs(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center", marginBottom: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.md) },
  debugBox: { marginTop: webSc(SPACING.lg), padding: webSc(SPACING.md), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, width: "100%" },
  debugLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, marginBottom: webSc(SPACING.xs), fontWeight: "600", textTransform: "uppercase" },
  debugText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  spacer: { height: webSc(SPACING.sm) },
});
