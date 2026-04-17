import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { useResetPassword } from "../../../viewmodels/useResetPassword";
import { Button } from "../../components/common/button";
import { Input } from "../../components/common/input";

export const ResetPasswordScreen = () => {
  const router = useRouter();
  const {
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    sessionReady,
    verifying,
    verifyError,
    verifyDebugUrl,
    success,
    error,
    handleUpdatePassword,
  } = useResetPassword();

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"\u2705"}</Text>
          <Text allowFontScaling={false} style={styles.title}>PASSWORD UPDATED</Text>
          <Text allowFontScaling={false} style={styles.message}>Your password has been changed successfully.</Text>
        </View>
        <Button title="Go to App" onPress={() => router.replace("/(tabs)")} fullWidth />
      </View>
    );
  }

  // Error branch - shown when we could not verify the reset link.
  // Includes a collapsible debug block so the user can share the failing
  // URL with support without needing device logs.
  if (verifyError) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"\u26A0\uFE0F"}</Text>
          <Text allowFontScaling={false} style={styles.title}>RESET LINK PROBLEM</Text>
          <Text allowFontScaling={false} style={styles.message}>{verifyError}</Text>
          {verifyDebugUrl ? (
            <View style={styles.debugBox}>
              <Text allowFontScaling={false} style={styles.debugLabel}>Debug info:</Text>
              <Text allowFontScaling={false} style={styles.debugText} selectable>{verifyDebugUrl}</Text>
            </View>
          ) : null}
        </View>
        <Button title="Back to Login" onPress={() => router.replace("/auth/login")} fullWidth />
      </ScrollView>
    );
  }

  if (verifying || !sessionReady) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"\u23F3"}</Text>
          <Text allowFontScaling={false} style={styles.title}>VERIFYING...</Text>
          <Text allowFontScaling={false} style={styles.message}>Please wait while we verify your reset link.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Text allowFontScaling={false} style={styles.title}>NEW PASSWORD</Text>
      <Text allowFontScaling={false} style={styles.description}>Choose a strong password for your account.</Text>
      <View style={styles.form}>
        <Input label="New Password" value={password} onChangeText={setPassword} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" secureTextEntry />
        <Input label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" secureTextEntry />
        {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
        <Button title="Update Password" onPress={handleUpdatePassword} loading={loading} fullWidth />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: scale(SPACING.lg) },
  title: { fontSize: moderateScale(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginTop: scale(SPACING.xl), marginBottom: scale(SPACING.md), textAlign: "center" },
  description: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: scale(SPACING.xl) },
  form: { flex: 1 },
  error: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), marginBottom: scale(SPACING.md) },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: scale(SPACING.xl) },
  icon: { fontSize: moderateScale(60), marginBottom: scale(SPACING.lg) },
  message: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center", marginBottom: scale(SPACING.md), paddingHorizontal: scale(SPACING.md) },
  debugBox: { marginTop: scale(SPACING.lg), padding: scale(SPACING.md), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, width: "100%" },
  debugLabel: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginBottom: scale(SPACING.xs), fontWeight: "600", textTransform: "uppercase" },
  debugText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});