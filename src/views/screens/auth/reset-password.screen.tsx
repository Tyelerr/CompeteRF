import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
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
    success,
    error,
    handleUpdatePassword,
  } = useResetPassword();

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.icon}>?</Text>
          <Text style={styles.title}>PASSWORD UPDATED</Text>
          <Text style={styles.message}>
            Your password has been changed successfully.
          </Text>
        </View>
        <Button
          title="Go to App"
          onPress={() => router.replace("/(tabs)")}
          fullWidth
        />
      </View>
    );
  }

  if (!sessionReady) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.icon}>??</Text>
          <Text style={styles.title}>VERIFYING...</Text>
          <Text style={styles.message}>
            Please wait while we verify your reset link.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Text style={styles.title}>NEW PASSWORD</Text>
      <Text style={styles.description}>
        Choose a strong password for your account.
      </Text>

      <View style={styles.form}>
        <Input
          label="New Password"
          value={password}
          onChangeText={setPassword}
          placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
          secureTextEntry
        />

        <Input
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title="Update Password"
          onPress={handleUpdatePassword}
          loading={loading}
          fullWidth
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  form: {
    flex: 1,
  },
  error: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 60,
    marginBottom: SPACING.lg,
  },
  message: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
});
