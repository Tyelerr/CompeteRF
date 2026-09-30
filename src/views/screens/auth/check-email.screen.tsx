import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useCheckEmail } from "../../../viewmodels/useCheckEmail";
import { Button } from "../../components/common/button";
import { Input } from "../../components/common/input";

const isWeb = Platform.OS === "web";

// "Check your email" after a signup that needs confirmation, and "Email not confirmed" at
// sign-in. Copy per platform lives in checkEmailCopy (web never says the link opens the app).
export const CheckEmailScreen = () => {
  const router = useRouter();
  const { copy, mode, email, typedEmail, setTypedEmail, sending, remaining, canResend, notice, resend } =
    useCheckEmail();

  const resendTitle = remaining > 0 ? `${copy.resendLabel} (${remaining}s)` : copy.resendLabel;

  return (
    <ScrollView contentContainerStyle={[styles.container, isWeb && styles.containerWeb]} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <Text allowFontScaling={false} style={styles.icon}>{"✉️"}</Text>
        <Text allowFontScaling={false} style={styles.title}>{copy.title}</Text>
        <Text allowFontScaling={false} style={styles.message}>{copy.lead}</Text>
        {email ? (
          <Text allowFontScaling={false} style={styles.email} selectable>{email}</Text>
        ) : (
          <View style={styles.inputWrap}>
            <Input
              label="Email"
              value={typedEmail}
              onChangeText={setTypedEmail}
              placeholder="your.email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
          </View>
        )}
        <Text allowFontScaling={false} style={styles.message}>{copy.body}</Text>
        {notice ? (
          <Text allowFontScaling={false} style={[styles.notice, notice.tone === "error" ? styles.noticeError : styles.noticeSuccess]}>
            {notice.text}
          </Text>
        ) : null}
      </View>
      <Button title={resendTitle} onPress={resend} loading={sending} disabled={!canResend} fullWidth />
      <View style={styles.spacer} />
      {mode === "signup" ? (
        <>
          <Button title="Change Email" onPress={() => router.replace("/auth/register" as any)} variant="outline" fullWidth />
          <View style={styles.spacer} />
          <Button title="Back to Login" onPress={() => router.replace("/auth/login")} variant="ghost" fullWidth />
        </>
      ) : (
        <Button
          title="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/auth/login"))}
          variant="outline"
          fullWidth
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: COLORS.background, padding: webSc(SPACING.lg) },
  // On web, constrain the column so the content doesn't stretch across the page.
  containerWeb: { maxWidth: 480, width: "100%" as any, alignSelf: "center" as any },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: webSc(SPACING.xl) },
  icon: { fontSize: webMs(60), marginBottom: webSc(SPACING.lg) },
  title: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginBottom: webSc(SPACING.md), textAlign: "center" },
  message: { fontSize: webMs(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center", marginBottom: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.md) },
  email: { fontSize: webMs(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, textAlign: "center", marginBottom: webSc(SPACING.md) },
  inputWrap: { width: "100%", marginBottom: webSc(SPACING.sm) },
  notice: { fontSize: webMs(FONT_SIZES.sm), textAlign: "center", marginTop: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md) },
  noticeSuccess: { color: COLORS.success },
  noticeError: { color: COLORS.error },
  spacer: { height: webSc(SPACING.sm) },
});
