import { useRouter } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useOAuthCallback } from "../../../viewmodels/useOAuthCallback";
import { Button } from "../../components/common/button";

const isWeb = Platform.OS === "web";

// /auth/callback — finishes "Continue with Google" on web, then the shared post-auth step
// navigates. Only a failure (cancelled / invalid / couldn't finish) stays on this screen.
export const OAuthCallbackScreen = () => {
  const router = useRouter();
  const { failure } = useOAuthCallback();

  if (failure) {
    return (
      <View style={[styles.container, isWeb && styles.containerWeb]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={styles.icon}>{"⚠️"}</Text>
          <Text allowFontScaling={false} style={styles.title}>{failure.title}</Text>
          <Text allowFontScaling={false} style={styles.message}>{failure.message}</Text>
        </View>
        <Button title="Back to Login" onPress={() => router.replace("/auth/login")} fullWidth />
      </View>
    );
  }

  return (
    <View style={[styles.container, isWeb && styles.containerWeb]}>
      <View style={styles.content}>
        <Text allowFontScaling={false} style={styles.icon}>{"⏳"}</Text>
        <Text allowFontScaling={false} style={styles.title}>SIGNING YOU IN...</Text>
        <Text allowFontScaling={false} style={styles.message}>Please wait while we finish signing you in.</Text>
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
});
