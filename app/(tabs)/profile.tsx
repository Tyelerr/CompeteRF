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
import { FavoriteTournamentCard } from "../../src/views/components/profile/FavoriteTournamentCard";

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
    router.replace("/(tabs)" as any);
  };

  const handleShare = async (tournament: any) => {
    // TODO: Implement share functionality
    console.log("Sharing tournament:", tournament.name);
  };

  const formatMemberSince = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  };

  const generatePlayerID = (idAuto: number) => {
    return `PL-${String(idAuto).padStart(6, "0")}`;
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
          <Text style={styles.headerSubtitle}>
            View and manage your tournament history
          </Text>
        </View>

        <View style={styles.notLoggedIn}>
          <Text style={styles.message}>Log in to see your profile</Text>
          <View style={styles.spacer} />
          <Button
            title="Log In"
            onPress={() => router.push("/auth/login" as any)}
            fullWidth
          />
          <View style={styles.spacerSm} />
          <Button
            title="Create Account"
            onPress={() => router.push("/auth/register" as any)}
            variant="outline"
            fullWidth
          />
        </View>
      </View>
    );
  }

  // Logged in - show profile (even if incomplete)
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
        <Text style={styles.headerSubtitle}>
          View and manage your tournament history
        </Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          {/* Billiard Ball Avatar */}
          <View style={styles.avatar}>
            <View style={styles.ballRow}>
              <View style={[styles.ball, styles.ball8]} />
              <View style={[styles.ball, styles.ball9]} />
              <View style={[styles.ball, styles.ball1]} />
            </View>
            <View style={styles.ballRow}>
              <View style={[styles.ball, styles.ball15]} />
              <View style={[styles.ball, styles.ball2]} />
              <View style={[styles.ball, styles.ball10]} />
            </View>
            <View style={styles.ballRow}>
              <View style={[styles.ball, styles.ball7]} />
              <View style={[styles.ball, styles.ball3]} />
              <View style={[styles.ball, styles.ball12]} />
            </View>
          </View>

          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <Text style={styles.name}>
              {profile?.name || user.email?.split("@")[0] || "Player"}
            </Text>
            <Text style={styles.playerID}>
              {profile ? generatePlayerID(profile.id_auto) : "No ID"}
            </Text>
            <Text style={styles.memberSince}>
              Member since{" "}
              {formatMemberSince(profile?.created_at || user.created_at)}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={() => router.push("../edit-profile" as any)}
          >
            <Text style={styles.editButtonText}>⚙️ Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.notificationButton]}
            onPress={() => {
              /* TODO: Navigate to notifications */
            }}
          >
            <Text style={styles.notificationButtonText}>🔔 Notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.signOutButton]}
            onPress={handleLogout}
          >
            <Text style={styles.signOutButtonText}>🚪 Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* User Details - Show available info */}
        {profile && (
          <View style={styles.userDetails}>
            {profile.home_state && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Home State</Text>
                <Text style={styles.detailValue}>{profile.home_state}</Text>
              </View>
            )}

            {profile.favorite_player && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Favorite Player</Text>
                <Text style={styles.detailValue}>
                  {profile.favorite_player}
                </Text>
              </View>
            )}

            {profile.preferred_game && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Favorite Game</Text>
                <Text style={styles.detailValue}>{profile.preferred_game}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Bottom Navigation Buttons */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity
          style={[styles.navButton, styles.favoritesButton]}
          onPress={() => {
            /* Current favorites functionality */
          }}
        >
          <Text style={styles.navButtonText}>❤️ Favorite Tournaments</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, styles.alertsButton]}
          onPress={() => router.push("/search-alerts" as any)}
        >
          <Text style={styles.navButtonText}>🔍 Search Alerts</Text>
        </TouchableOpacity>
      </View>

      {/* Favorites Section - Clean Card Design */}
      <View style={styles.favoritesSection}>
        {favorites.length === 0 ? (
          <View style={styles.emptyFavorites}>
            <Text style={styles.emptyText}>No favorites yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the heart on tournaments to save them here!
            </Text>
          </View>
        ) : (
          favorites.map((fav) => (
            <FavoriteTournamentCard
              key={fav.id}
              tournament={{
                id: fav.tournament_id,
                name: fav.tournaments?.name || "Unknown Tournament",
                game_type: fav.tournaments?.game_type || "Unknown",
                tournament_date: fav.tournaments?.tournament_date || "",
                venues: {
                  venue: fav.tournaments?.venues?.venue || "Unknown Venue",
                  city: fav.tournaments?.venues?.city || "Unknown City",
                  state: fav.tournaments?.venues?.state || "Unknown State",
                },
              }}
              onPress={() =>
                router.push(`/tournament-detail?id=${fav.tournament_id}` as any)
              }
              onToggleFavorite={() => {
                // Remove from favorites
                const removeFavorite = async () => {
                  await supabase.from("favorites").delete().eq("id", fav.id);
                  setFavorites(favorites.filter((f) => f.id !== fav.id));
                };
                removeFavorite();
              }}
              onShare={() => handleShare(fav.tournaments)}
            />
          ))
        )}
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
    paddingBottom: SPACING.sm,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  notLoggedIn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  message: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
    textAlign: "center",
  },
  profileCard: {
    margin: SPACING.md,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    marginRight: SPACING.md,
  },
  ballRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  ball: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginHorizontal: 1,
  },
  // Billiard ball colors
  ball1: { backgroundColor: "#FFD700" }, // Yellow
  ball2: { backgroundColor: "#0066FF" }, // Blue
  ball3: { backgroundColor: "#FF0000" }, // Red
  ball7: { backgroundColor: "#8B0000" }, // Maroon
  ball8: { backgroundColor: "#000000" }, // Black
  ball9: { backgroundColor: "#FFD700", borderWidth: 2, borderColor: "#FFF" }, // Yellow stripe
  ball10: { backgroundColor: "#0066FF", borderWidth: 2, borderColor: "#FFF" }, // Blue stripe
  ball12: { backgroundColor: "#800080" }, // Purple
  ball15: { backgroundColor: "#8B0000", borderWidth: 2, borderColor: "#FFF" }, // Maroon stripe
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  playerID: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  memberSince: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  actionButtons: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  editButton: {
    backgroundColor: COLORS.secondary,
  },
  editButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  notificationButton: {
    backgroundColor: COLORS.primary,
  },
  notificationButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  signOutButton: {
    backgroundColor: COLORS.error,
  },
  signOutButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  userDetails: {
    gap: SPACING.md,
  },
  detailItem: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
  },
  detailLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  detailValue: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: "500",
  },
  bottomNavigation: {
    flexDirection: "row",
    margin: SPACING.md,
    gap: SPACING.sm,
  },
  navButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  favoritesButton: {
    backgroundColor: COLORS.primary,
  },
  alertsButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  navButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.white,
  },
  // New clean favorites section
  favoritesSection: {
    padding: SPACING.md,
  },
  emptyFavorites: {
    alignItems: "center",
    padding: SPACING.lg,
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
  spacer: {
    height: SPACING.lg,
  },
  spacerSm: {
    height: SPACING.sm,
  },
});
