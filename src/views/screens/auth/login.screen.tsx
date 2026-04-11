import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../../lib/supabase";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { Button } from "../../components/common/button";
import { Input } from "../../components/common/input";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

export const LoginScreen = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!email.includes("@")) { setError("Invalid email or password"); return; }
    if (!password) { setError("Invalid email or password"); return; }
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) { setError("Invalid email or password"); return; }
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.user?.id).maybeSingle();
      if (profile) { router.replace("/(tabs)"); } else { router.replace("/auth/register"); }
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
      </TouchableOpacity>
      {isWeb ? (
        <View style={styles.webCenter}>
          <Text allowFontScaling={false} style={styles.title}>LOG IN</Text>
          <View style={styles.cardWeb}>
            <Input label="Email" value={email} onChangeText={setEmail} placeholder="your.email@example.com" keyboardType="email-address" autoCapitalize="none" />
            <Input label="Password" value={password} onChangeText={setPassword} placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"} secureTextEntry showPasswordToggle />
            <TouchableOpacity onPress={() => router.push("/auth/forgot-password" as any)} style={styles.forgotPassword}>
              <Text allowFontScaling={false} style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
            {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
            <Button title="Log In" onPress={handleLogin} loading={loading} fullWidth />
            <View style={styles.footer}>
              <Text allowFontScaling={false} style={styles.footerText}>{"Don't have an account? "}</Text>
              <TouchableOpacity onPress={() => router.push("/auth/register" as any)}>
                <Text allowFontScaling={false} style={styles.footerLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.mobileCard}>
          <Text allowFontScaling={false} style={styles.title}>LOG IN</Text>
          <View style={styles.spacer} />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="your.email@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"} secureTextEntry showPasswordToggle />
          <TouchableOpacity onPress={() => router.push("/auth/forgot-password" as any)} style={styles.forgotPassword}>
            <Text allowFontScaling={false} style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
          {error ? <Text allowFontScaling={false} style={styles.error}>{error}</Text> : null}
          <Button title="Log In" onPress={handleLogin} loading={loading} fullWidth />
          <View style={styles.footer}>
            <Text allowFontScaling={false} style={styles.footerText}>{"Don't have an account? "}</Text>
            <TouchableOpacity onPress={() => router.push("/auth/register" as any)}>
              <Text allowFontScaling={false} style={styles.footerLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bottomSpacer} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: wxSc(SPACING.lg) },
  back: { marginTop: wxSc(SPACING.xl), marginBottom: wxSc(SPACING.lg) },
  backText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.md) },
  webCenter: { alignSelf: "center" as any, width: "100%" as any, maxWidth: 440 },
  title: { fontSize: wxMs(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginBottom: wxSc(SPACING.lg) },
  cardWeb: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
  },
  mobileCard: { flex: 1 },
  spacer: { flex: 1 },
  bottomSpacer: { flex: 2 },
  forgotPassword: { alignSelf: "flex-end", marginBottom: wxSc(SPACING.md), marginTop: -wxSc(SPACING.xs) },
  forgotPasswordText: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "500" },
  error: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.sm), marginBottom: wxSc(SPACING.md) },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: wxSc(SPACING.lg) },
  footerText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.md) },
  footerLink: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.md), fontWeight: "600" },
});