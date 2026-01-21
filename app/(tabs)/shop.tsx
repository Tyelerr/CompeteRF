import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { Button } from "../../src/views/components/common/button";
import { Loading } from "../../src/views/components/common/loading";

export default function ShopScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setUser(session?.user || null);
    setLoading(false);
  };

  if (loading) {
    return <Loading fullScreen message="Loading..." />;
  }

  // Not logged in - show login prompt
  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SHOP</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.icon}>🛒</Text>
          <Text style={styles.title}>Log In to Access Shop</Text>
          <Text style={styles.subtitle}>
            Create an account to enter giveaways, shop for gear, and more!
          </Text>

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
      </View>
    );
  }

  // Logged in - show shop content
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SHOP</Text>
        <Text style={styles.headerSubtitle}>Giveaways & More</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.icon}>🎁</Text>
        <Text style={styles.title}>Coming Soon!</Text>
        <Text style={styles.subtitle}>
          Giveaways and shop features are on the way.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  icon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: SPACING.xl,
  },
  buttons: {
    width: "100%",
    marginTop: SPACING.lg,
  },
  spacer: {
    height: SPACING.md,
  },
});
