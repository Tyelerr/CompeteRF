import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
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
import { FullScreenImageViewer } from "../../src/views/components/common/FullScreenImageViewer";
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
    thumbnail?: string;
    venues: {
      venue: string;
      city: string;
      state: string;
    };
  };
}

// ── Animated logged-out view ─────────────────────────────────────────
const LoggedOutView = ({ router }: { router: any }) => {
  const welcomeFade = useRef(new Animated.Value(0)).current;
  const welcomeSlide = useRef(new Animated.Value(-30)).current;
  const messageFade = useRef(new Animated.Value(0)).current;
  const buttonsFade = useRef(new Animated.Value(0)).current;
  const buttonsSlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. "Welcome!" slides in
      Animated.parallel([
        Animated.timing(welcomeFade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(welcomeSlide, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
      // 2. Message + buttons fade in
      Animated.parallel([
        Animated.timing(messageFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsSlide, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PROFILE</Text>
        <Text style={styles.headerSubtitle}>
          View and manage your tournament history
        </Text>
      </View>

      <View style={styles.notLoggedIn}>
        {/* Animated "Welcome!" */}
        <Animated.Text
          style={[
            styles.welcomeText,
            {
              opacity: welcomeFade,
              transform: [{ translateY: welcomeSlide }],
            },
          ]}
        >
          Welcome!
        </Animated.Text>

        {/* Message */}
        <Animated.Text style={[styles.message, { opacity: messageFade }]}>
          Log in to see your profile
        </Animated.Text>

        {/* Buttons */}
        <Animated.View
          style={[
            styles.buttonGroup,
            {
              opacity: buttonsFade,
              transform: [{ translateY: buttonsSlide }],
            },
          ]}
        >
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
        </Animated.View>
      </View>
    </View>
  );
};

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  // Image viewer state
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentImageTitle, setCurrentImageTitle] = useState<string>("");

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
          thumbnail,
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
    console.log("Sharing tournament:", tournament.name);
  };

  const getTournamentImageUrl = (tournament: any) => {
    const gameTypeImageMap: Record<string, string> = {
      "8-ball": "8-ball.jpeg",
      "9-ball": "9-ball.jpeg",
      "10-ball": "10-ball.jpeg",
      "one-pocket": "One-Pocket.jpeg",
      "straight-pool": "Straight-Pool.jpeg",
      banks: "Banks.jpeg",
    };

    if (tournament.thumbnail) {
      if (tournament.thumbnail.startsWith("custom:")) {
        return tournament.thumbnail.replace("custom:", "");
      } else {
        const imageFile = gameTypeImageMap[tournament.thumbnail];
        if (imageFile) {
          return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
        }
      }
    }

    const imageFile = gameTypeImageMap[tournament.game_type];
    if (imageFile) {
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
    }

    return null;
  };

  const handleViewImage = (tournament: any) => {
    const imageUrl = getTournamentImageUrl(tournament);
    if (imageUrl) {
      setCurrentImageUrl(imageUrl);
      setCurrentImageTitle(tournament.name);
      setShowImageViewer(true);
    }
  };

  const closeImageViewer = () => {
    setShowImageViewer(false);
    setCurrentImageUrl(null);
    setCurrentImageTitle("");
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

  // Not logged in — show animated welcome
  if (!user) {
    return <LoggedOutView router={router} />;
  }

  // Logged in - show profile
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContent}
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
            <View style={styles.avatarContainer}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.profileImage}
                  resizeMode="cover"
                />
              ) : (
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
              )}
            </View>

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
              <Text style={styles.notificationButtonText}>
                🔔 Notifications
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.signOutButton]}
              onPress={handleLogout}
            >
              <Text style={styles.signOutButtonText}>🚪 Sign Out</Text>
            </TouchableOpacity>
          </View>

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
                  <Text style={styles.detailValue}>
                    {profile.preferred_game}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

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

        <View style={styles.favoritesSection}>
          {favorites.length === 0 ? (
            <View style={styles.emptyFavorites}>
              <Text style={styles.emptyText}>No favorites yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the heart on tournaments to save them here!
              </Text>
            </View>
          ) : (
            favorites.map((fav) => {
              const tournamentData = {
                id: fav.tournament_id,
                name: fav.tournaments?.name || "Unknown Tournament",
                game_type: fav.tournaments?.game_type || "Unknown",
                tournament_date: fav.tournaments?.tournament_date || "",
                thumbnail: fav.tournaments?.thumbnail,
                venues: {
                  venue: fav.tournaments?.venues?.venue || "Unknown Venue",
                  city: fav.tournaments?.venues?.city || "Unknown City",
                  state: fav.tournaments?.venues?.state || "Unknown State",
                },
              };

              return (
                <FavoriteTournamentCard
                  key={fav.id}
                  tournament={tournamentData}
                  onPress={() =>
                    router.push(
                      `/tournament-detail?id=${fav.tournament_id}` as any,
                    )
                  }
                  onToggleFavorite={() => {
                    const removeFavorite = async () => {
                      await supabase
                        .from("favorites")
                        .delete()
                        .eq("id", fav.id);
                      setFavorites(favorites.filter((f) => f.id !== fav.id));
                    };
                    removeFavorite();
                  }}
                  onShare={() => handleShare(fav.tournaments)}
                  onViewImage={() => handleViewImage(tournamentData)}
                  getTournamentImageUrl={getTournamentImageUrl}
                />
              );
            })
          )}
        </View>
      </ScrollView>

      <FullScreenImageViewer
        visible={showImageViewer}
        imageUrl={currentImageUrl}
        title={currentImageTitle}
        onClose={closeImageViewer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flex: 1,
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
  // ── Logged-out animated styles ───────────────────────────────────
  notLoggedIn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  welcomeText: {
    fontSize: 36,
    fontWeight: "700",
    color: "#4A90D9",
    marginBottom: SPACING.xl,
    letterSpacing: 1,
  },
  message: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
    marginBottom: SPACING.xl,
    textAlign: "center",
  },
  buttonGroup: {
    width: "100%",
  },
  // ── Logged-in styles ─────────────────────────────────────────────
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
  avatarContainer: {
    width: 80,
    height: 80,
    marginRight: SPACING.md,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 80,
    height: 80,
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
  ball1: { backgroundColor: "#FFD700" },
  ball2: { backgroundColor: "#0066FF" },
  ball3: { backgroundColor: "#FF0000" },
  ball7: { backgroundColor: "#8B0000" },
  ball8: { backgroundColor: "#000000" },
  ball9: { backgroundColor: "#FFD700", borderWidth: 2, borderColor: "#FFF" },
  ball10: { backgroundColor: "#0066FF", borderWidth: 2, borderColor: "#FFF" },
  ball12: { backgroundColor: "#800080" },
  ball15: { backgroundColor: "#8B0000", borderWidth: 2, borderColor: "#FFF" },
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
