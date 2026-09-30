import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useResetPassword } from "../../../viewmodels/useResetPassword";
import { Button } from "../../components/common/button";
import { Input } from "../../components/common/input";

const isWeb = Platform.OS === "web";

export const ResetPasswordScreen = () => {
  const router = useRouter();
  const {
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    resolving,
    awaitingContinue,
    sessionReady,
    verifying,
    verifyErrorTitle,
    verifyError,
    verifyDebugInfo,
    success,
    error,
    handleUpdatePassword,
    handleContinue,
    successCopy,
  } = useResetPassword();

  if (success) {
    return (
      <View style={[styles.container, isWeb && styles.containerWeb]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"\u2705"}</Text>
          <Text allowFontScaling={false} style={styles.title}>{successCopy.title}</Text>
          <Text allowFontScaling={false} style={styles.message}>{successCopy.body}</Text>
        </View>
        <Button title={successCopy.actionLabel} onPress={() => router.replace(successCopy.actionRoute as any)} fullWidth />
      </View>
    );
  }

  // Error branch: expired / already used / missing / malformed link. Users see only the title,
  // the friendly message and the two actions; the debug block (which pieces arrived, never
  // values) renders in development builds only.
  if (verifyError) {
    return (
      <ScrollView contentContainerStyle={[styles.container, isWeb && styles.containerWeb]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"\u26A0\uFE0F"}</Text>
          <Text allowFontScaling={false} style={styles.title}>{verifyErrorTitle}</Text>
          <Text allowFontScaling={false} style={styles.message}>{verifyError}</Text>
          {__DEV__ && verifyDebugInfo ? (
            <View style={styles.debugBox}>
              <Text allowFontScaling={false} style={styles.debugLabel}>Debug info:</Text>
              <Text allowFontScaling={false} style={styles.debugText} selectable>{verifyDebugInfo}</Text>
            </View>
          ) : null}
        </View>
        <Button title="Request a New Link" onPress={() => router.replace("/auth/forgot-password" as any)} fullWidth />
        <View style={styles.spacer} />
        <Button title="Back to Login" onPress={() => router.replace("/auth/login")} variant="outline" fullWidth />
      </ScrollView>
    );
  }

  // A valid link has arrived, but nothing is verified until the user taps Continue (so a link
  // scanner or preview that merely opens the page consumes nothing).
  if (awaitingContinue) {
    return (
      <View style={[styles.container, isWeb && styles.containerWeb]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"\u2139\uFE0F"}</Text>
          <Text allowFontScaling={false} style={styles.title}>RESET YOUR PASSWORD</Text>
          <Text allowFontScaling={false} style={styles.message}>Tap Continue to verify your reset link and choose a new password.</Text>
        </View>
        <Button title="Continue" onPress={handleContinue} fullWidth />
      </View>
    );
  }

  if (resolving || verifying || !sessionReady) {
    return (
      <View style={[styles.container, isWeb && styles.containerWeb]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"\u23F3"}</Text>
          <Text allowFontScaling={false} style={styles.title}>VERIFYING...</Text>
          <Text allowFontScaling={false} style={styles.message}>Please wait while we verify your reset link.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, isWeb && styles.containerWeb]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Text allowFontScaling={false} style={styles.title}>NEW PASSWORD</Text>
      <Text allowFontScaling={false} style={styles.description}>Choose a strong password for your account.</Text>
      <View style={styles.form}>
        {/* Plain-text placeholders: a JSX attribute string does not process escape sequences (the
            old bullet-escape placeholder rendered literally on web). Masking is secureTextEntry. */}
        <Input label="New Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry showPasswordToggle autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
        <Input label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your new password" secureTextEntry showPasswordToggle autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
        {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
        <Button title="Update Password" onPress={handleUpdatePassword} loading={loading} fullWidth />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: webSc(SPACING.lg) },
  // On web, constrain the column so inputs don't stretch across the page.
  containerWeb: { maxWidth: 480, width: "100%" as any, alignSelf: "center" as any },
  title: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginTop: webSc(SPACING.xl), marginBottom: webSc(SPACING.md), textAlign: "center" },
  description: { fontSize: webMs(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: webSc(SPACING.xl) },
  form: { flex: 1 },
  error: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), marginBottom: webSc(SPACING.md) },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: webSc(SPACING.xl) },
  icon: { fontSize: webMs(60), marginBottom: webSc(SPACING.lg) },
  message: { fontSize: webMs(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center", marginBottom: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.md) },
  debugBox: { marginTop: webSc(SPACING.lg), padding: webSc(SPACING.md), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, width: "100%" },
  debugLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, marginBottom: webSc(SPACING.xs), fontWeight: "600", textTransform: "uppercase" },
  spacer: { height: webSc(SPACING.sm) },
  debugText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});