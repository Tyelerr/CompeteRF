import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../../lib/supabase";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Button } from "../../components/common/button";
import { Input } from "../../components/common/input";

export const LoginScreen = () => {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");

    if (!email.includes("@")) {
      setError("Invalid email or password");
      return;
    }

    if (!password) {
      setError("Invalid email or password");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (signInError) {
        setError("Invalid email or password");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", data.user?.id)
        .maybeSingle();

      if (profile) {
        router.replace("/(tabs)");
      } else {
        router.replace("/auth/register");
      }
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>{"\u2190"} Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>LOG IN</Text>

      <View style={styles.spacer} />

      <View style={styles.form}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="your.email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
          secureTextEntry
        />

        <TouchableOpacity
          onPress={() => router.push("/auth/forgot-password" as any)}
          style={styles.forgotPassword}
        >
          <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title="Log In"
          onPress={handleLogin}
          loading={loading}
          fullWidth
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{"Don't have an account? "}</Text>
          <TouchableOpacity
            onPress={() => router.push("/auth/register" as any)}
          >
            <Text style={styles.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomSpacer} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  back: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.text,
  },
  spacer: {
    flex: 1,
  },
  form: {},
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: SPACING.md,
    marginTop: -SPACING.xs,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
  },
  error: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: SPACING.lg,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
  },
  footerLink: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  bottomSpacer: {
    flex: 2,
  },
});
