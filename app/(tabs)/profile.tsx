import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { Button } from "../../src/views/components/common/button";
import { Loading } from "../../src/views/components/common/loading";

interface Favorite {
  id: number;
  tournament_id: number;
  tournaments: {
    id: number;
    name: string;
    game_type: string;
    tournament_date: string;
    venues: {
      venue: string;
      city: string;
      state: string;
    };
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

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
        setFavorites([]);
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
    } else {
      setLoading(false);
    }
  };

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);

    if (data) {
      await loadFavorites(data.id_auto);
    }
    setLoading(false);
  };

  const loadFavorites = async (userIdAuto: number) => {
    const { data } = await supabase
      .from("favorites")
      .select(
        `
        id,
        tournament_id,
        tournaments (
          id,
          name,
          game_type,
          tournament_date,
          venues (
            venue,
            city,
            state
          )
        )
      `,
      )
      .eq("user_id", userIdAuto)
      .not("tournament_id", "is", null);

    if (data) {
      setFavorites(data as unknown as Favorite[]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await loadProfile(user.id);
    }
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setFavorites([]);
    router.replace("/(tabs)");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("");
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const removeFavorite = async (favoriteId: number) => {
    await supabase.from("favorites").delete().eq("id", favoriteId);

    setFavorites(favorites.filter((f) => f.id !== favoriteId));
  };

  if (loading) {
    return <Loading fullScreen message="Loading..." />;
  }

  // Not logged in
  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>PROFILE</Text>
        </View>

        <View style={styles.notLoggedIn}>
          <Text style={styles.icon}>👤</Text>
          <Text style={styles.message}>Log in to see your profile</Text>
          <View style={styles.spacer} />
          <Button
            title="Log In"
            onPress={() => router.push("/auth/login")}
            fullWidth
          />
          <View style={styles.spacerSm} />
          <Button
            title="Create Account"
            onPress={() => router.push("/auth/register")}
            variant="outline"
            fullWidth
          />
        </View>
      </View>
    );
  }

  // Logged in but no profile
  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>PROFILE</Text>
        </View>

        <View style={styles.notLoggedIn}>
          <Text style={styles.icon}>👤</Text>
          <Text style={styles.message}>Complete your profile to continue</Text>
          <View style={styles.spacer} />
          <Button
            title="Complete Profile"
            onPress={() => router.push("/auth/complete-profile")}
            fullWidth
          />
        </View>
      </View>
    );
  }

  // Logged in with profile
  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PROFILE</Text>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
        </View>
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.username}>@{profile.user_name}</Text>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            🎱 {profile.role?.replace("_", " ") || "Player"}
          </Text>
        </View>

        <Text style={styles.location}>📍 {profile.home_state}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          ❤️ MY FAVORITES ({favorites.length})
        </Text>

        {favorites.length === 0 ? (
          <View style={styles.emptyFavorites}>
            <Text style={styles.emptyText}>No favorites yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the heart on tournaments to save them here!
            </Text>
          </View>
        ) : (
          favorites.map((fav) => (
            <TouchableOpacity
              key={fav.id}
              style={styles.favoriteCard}
              onPress={() =>
                router.push(`/tournament-detail?id=${fav.tournament_id}`)
              }
            >
              <View style={styles.favoriteInfo}>
                <View style={styles.gameTypeBadge}>
                  <Text style={styles.gameTypeText}>
                    {fav.tournaments?.game_type}
                  </Text>
                </View>
                <Text style={styles.favoriteName}>{fav.tournaments?.name}</Text>
                <Text style={styles.favoriteVenue}>
                  📍 {fav.tournaments?.venues?.venue} -{" "}
                  {fav.tournaments?.venues?.city},{" "}
                  {fav.tournaments?.venues?.state}
                </Text>
                <Text style={styles.favoriteDate}>
                  📅 {formatDate(fav.tournaments?.tournament_date)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeFavorite(fav.id)}
              >
                <Text style={styles.removeIcon}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚙️ SETTINGS</Text>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>🔔</Text>
          <Text style={styles.menuText}>Notifications</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>🔒</Text>
          <Text style={styles.menuText}>Privacy</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>❓</Text>
          <Text style={styles.menuText}>Help & Support</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.logoutSection}>
        <Button
          title="Log Out"
          onPress={handleLogout}
          variant="outline"
          fullWidth
        />
      </View>
    </ScrollView>
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
  notLoggedIn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  icon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  message: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  profileSection: {
    alignItems: "center",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  avatarText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.white,
  },
  name: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text,
  },
  username: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  badge: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
  },
  badgeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    textTransform: "capitalize",
  },
  location: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  section: {
    padding: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  emptyFavorites: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  favoriteCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
  },
  favoriteInfo: {
    flex: 1,
  },
  gameTypeBadge: {
    backgroundColor: COLORS.primary,
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    alignSelf: "flex-start",
    marginBottom: SPACING.xs,
  },
  gameTypeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  favoriteName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },
  favoriteVenue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  favoriteDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  removeButton: {
    padding: SPACING.sm,
  },
  removeIcon: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuIcon: {
    fontSize: FONT_SIZES.lg,
    marginRight: SPACING.md,
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  menuArrow: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
  },
  logoutSection: {
    padding: SPACING.lg,
    paddingTop: SPACING.md,
  },
  spacer: {
    height: SPACING.lg,
  },
  spacerSm: {
    height: SPACING.sm,
  },
});
