import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { Button } from "../../src/views/components/common/button";
import { Loading } from "../../src/views/components/common/loading";

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setUser(session?.user || null);
    if (session?.user) {
      await loadProfile(session.user.id);
    }
    setLoading(false);
  };

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  if (loading) {
    return <Loading fullScreen message="Loading..." />;
  }

  // Logged in user view
  if (user && profile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>HOME</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.welcome}>Welcome back, {profile.name}! 👋</Text>
          <Text style={styles.username}>@{profile.user_name}</Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoText}>📍 {profile.home_state}</Text>
            <Text style={styles.infoText}>📧 {profile.email}</Text>
          </View>
        </View>

        <View style={styles.buttons}>
          <Button
            title="Log Out"
            onPress={handleLogout}
            variant="outline"
            fullWidth
          />
        </View>
      </View>
    );
  }

  // Logged in but no profile yet
  if (user && !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.logo}>🎱</Text>
          <Text style={styles.title}>COMPETE</Text>
          <Text style={styles.subtitle}>Complete your profile to continue</Text>
        </View>

        <View style={styles.buttons}>
          <Button
            title="Complete Profile"
            onPress={() => router.push("/auth/complete-profile")}
            fullWidth
          />
          <View style={styles.spacer} />
          <Button
            title="Log Out"
            onPress={handleLogout}
            variant="outline"
            fullWidth
          />
        </View>
      </View>
    );
  }

  // Not logged in view
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>🎱</Text>
        <Text style={styles.title}>COMPETE</Text>
        <Text style={styles.subtitle}>Find Billiards Tournaments Near You</Text>
      </View>

      <View style={styles.buttons}>
        <Button
          title="Create Account"
          onPress={() => router.push("/auth/register")}
          fullWidth
        />
        <View style={styles.spacer} />
        <Button
          title="Log In"
          onPress={() => router.push("/auth/login")}
          variant="outline"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  header: {
    paddingTop: SPACING.xl,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 80,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  welcome: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  username: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.primary,
    marginBottom: SPACING.xl,
  },
  infoCard: {
    backgroundColor: COLORS.backgroundCard,
    padding: SPACING.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: "100%",
  },
  infoText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  buttons: {
    paddingBottom: SPACING.xl,
  },
  spacer: {
    height: SPACING.md,
  },
});
