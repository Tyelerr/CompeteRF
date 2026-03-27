import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { useForgotPassword } from "../../../viewmodels/useForgotPassword";
import { Button } from "../../components/common/button";
import { Input } from "../../components/common/input";

export const ForgotPasswordScreen = () => {
  const router = useRouter();
  const { email, setEmail, loading, sent, error, handleSendReset } = useForgotPassword();

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>✉️</Text>
          <Text allowFontScaling={false} style={styles.title}>CHECK YOUR EMAIL</Text>
          <Text allowFontScaling={false} style={styles.message}>{"We've sent a password reset link to:"}</Text>
          <Text allowFontScaling={false} style={styles.email}>{email}</Text>
          <Text allowFontScaling={false} style={styles.message}>Tap the link in the email to reset your password. It will open the app directly.</Text>
        </View>
        <Button title="Back to Log In" onPress={() => router.back()} fullWidth />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text allowFontScaling={false} style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text allowFontScaling={false} style={styles.title}>FORGOT PASSWORD</Text>
      <Text allowFontScaling={false} style={styles.description}>{"Enter your email address and we'll send you a link to reset your password."}</Text>
      <View style={styles.form}>
        <Input label="Email" value={email} onChangeText={setEmail} placeholder="your.email@example.com" keyboardType="email-address" autoCapitalize="none" />
        {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
        <Button title="Send Reset Link" onPress={handleSendReset} loading={loading} fullWidth />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: scale(SPACING.lg) },
  back: { marginTop: scale(SPACING.xl), marginBottom: scale(SPACING.lg) },
  backText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.md) },
  title: { fontSize: moderateScale(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.md) },
  description: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: scale(SPACING.xl) },
  form: { flex: 1 },
  error: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), marginBottom: scale(SPACING.md) },
  content: { flex: 1, alignItems: "center", justifyContent: "center" },
  icon: { fontSize: moderateScale(60), marginBottom: scale(SPACING.lg) },
  message: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center", marginBottom: scale(SPACING.sm) },
  email: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, fontWeight: "600", marginBottom: scale(SPACING.lg) },
});
