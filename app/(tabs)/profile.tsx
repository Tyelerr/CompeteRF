// app/(tabs)/profile.tsx

import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { authService } from "../../src/models/services/auth.service";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { usePagination } from "../../src/viewmodels/hooks/use.pagination";
import { useScrollToTopOnFocus } from "../../src/viewmodels/hooks/use.scroll.to.top";
import { Button } from "../../src/views/components/common/button";
import { FullScreenImageViewer } from "../../src/views/components/common/FullScreenImageViewer";
import { Loading } from "../../src/views/components/common/loading";
import { Pagination } from "../../src/views/components/common/pagination";
import { NotificationsModal } from "../../src/views/components/notifications/NotificationsModal";
import { EditProfileModal } from "../../src/views/components/profile/EditProfileModal";
import { FavoriteTournamentCard } from "../../src/views/components/profile/FavoriteTournamentCard";
import { SearchAlertsModal } from "../../src/views/components/profile/SearchAlertsModal";

const isWeb = Platform.OS === "web";

interface Favorite {
  id: number;
  tournament_id: number;
  tournaments: {
    id: number;
    name: string;
    game_type: string;
    tournament_date: string;
    thumbnail?: string;
    venues: { venue: string; city: string; state: string };
  };
}

// Animated logged-out view
const LoggedOutView = ({ router }: { router: any }) => {
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState("");
  const welcomeFade = useRef(new Animated.Value(0)).current;
  const welcomeSlide = useRef(new Animated.Value(-30)).current;
  const messageFade = useRef(new Animated.Value(0)).current;
  const buttonsFade = useRef(new Animated.Value(0)).current;
  const buttonsSlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.sequence([
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

  const handleAppleSignIn = async () => {
    setError("");
    setAppleLoading(true);
    try {
      const result = await authService.signInWithApple();
      if (!result.user) {
        setError("Sign in failed. Please try again.");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", result.user.id)
        .maybeSingle();
      if (profile) {
        router.replace("/(tabs)");
      } else {
        router.replace({
          pathname: "/auth/complete-profile",
          params: {
            firstName: result.fullName?.givenName || "",
            lastName: result.fullName?.familyName || "",
          },
        } as any);
      }
    } catch (err: any) {
      if (err.code === "ERR_REQUEST_CANCELED") return;
      setError("Apple Sign In failed. Please try again.");
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <Text style={styles.headerTitle}>PROFILE</Text>
        <Text style={styles.headerSubtitle}>
          View and manage your tournament history
        </Text>
      </View>
      <View style={styles.notLoggedIn}>
        <Animated.Text
          style={[
            styles.welcomeText,
            { opacity: welcomeFade, transform: [{ translateY: welcomeSlide }] },
          ]}
        >
          Welcome!
        </Animated.Text>
        <Animated.Text style={[styles.message, { opacity: messageFade }]}>
          Log in to see your profile
        </Animated.Text>
        <Animated.View
          style={[
            styles.buttonGroup,
            { opacity: buttonsFade, transform: [{ translateY: buttonsSlide }] },
          ]}
        >
          {Platform.OS === "ios" && (
            <>
              <View style={styles.appleButtonWrapper}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  }
                  cornerRadius={8}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
                {appleLoading && (
                  <Text style={styles.loadingHint}>Signing in...</Text>
                )}
              </View>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}
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
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxVisible, setInboxVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [searchAlertsVisible, setSearchAlertsVisible] = useState(false);

  const scrollRef = useScrollToTopOnFocus();
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentImageTitle, setCurrentImageTitle] = useState<string>("");

  const {
    paginatedItems: paginatedFavorites,
    currentPage,
    totalPages,
    totalCount,
    displayRange,
    nextPage,
    prevPage,
    canGoNext,
    canGoPrev,
  } = usePagination(favorites, { itemsPerPage: 5 });

  useEffect(() => {
    checkUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        loadProfile(session.user.id);
        loadUnreadCount(session.user.id);
      } else {
        setProfile(null);
        setFavorites([]);
        setUnreadCount(0);
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
      await loadUnreadCount(session.user.id);
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
    if (data) await loadFavorites(data.id_auto);
    setLoading(false);
  };

  const loadFavorites = async (userIdAuto: number) => {
    const { data } = await supabase
      .from("favorites")
      .select(
        "id, tournament_id, tournaments (id, name, game_type, tournament_date, thumbnail, venues (venue, city, state))",
      )
      .eq("user_id", userIdAuto)
      .not("tournament_id", "is", null);
    if (data) setFavorites(data as unknown as Favorite[]);
  };

  const loadUnreadCount = async (userId: string) => {
    try {
      const { count } = await supabase
        .from("notification_message_recipients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      setUnreadCount(count || 0);
    } catch (err) {
      console.error("Error loading unread count:", err);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await loadProfile(user.id);
      await loadUnreadCount(user.id);
    }
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setFavorites([]);
    setUnreadCount(0);
    router.replace("/(tabs)" as any);
  };

  const getTournamentImageUrl = (tournament: any) => {
    const map: Record<string, string> = {
      "8-ball": "8-ball.jpeg",
      "9-ball": "9-ball.jpeg",
      "10-ball": "10-ball.jpeg",
      "one-pocket": "One-Pocket.jpeg",
      "straight-pool": "Straight-Pool.jpeg",
      banks: "Banks.jpeg",
    };
    if (tournament.thumbnail) {
      if (tournament.thumbnail.startsWith("custom:"))
        return tournament.thumbnail.replace("custom:", "");
      const f = map[tournament.thumbnail];
      if (f)
        return (
          "https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/" +
          f
        );
    }
    const f = map[tournament.game_type];
    return f
      ? "https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/" +
          f
      : null;
  };

  const handleViewImage = (tournament: any) => {
    const url = getTournamentImageUrl(tournament);
    if (url) {
      setCurrentImageUrl(url);
      setCurrentImageTitle(tournament.name);
      setShowImageViewer(true);
    }
  };

  const formatMemberSince = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });

  const generatePlayerID = (idAuto: number) =>
    "PL-" + String(idAuto).padStart(6, "0");

  const handleRemoveFavorite = (favId: number) => {
    const run = async () => {
      await supabase.from("favorites").delete().eq("id", favId);
      const updated = favorites.filter((f) => f.id !== favId);
      setFavorites(updated);
      if (
        currentPage > Math.ceil(updated.length / 5) &&
        Math.ceil(updated.length / 5) > 0
      )
        prevPage();
    };
    run();
  };

  if (loading) return <Loading fullScreen message="Loading..." />;
  if (!user) return <LoggedOutView router={router} />;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          )
        }
      >
        <View style={isWeb ? styles.webInner : styles.mobileInner}>
          <View style={[styles.header, isWeb && styles.headerWeb]}>
            <Text style={styles.headerTitle}>PROFILE</Text>
            <Text style={styles.headerSubtitle}>
              View and manage your tournament history
            </Text>
          </View>

          <View style={styles.profileCard}>
            {/* Messages floating button - opens inbox modal */}
            <TouchableOpacity
              style={styles.messagesFloatingButton}
              onPress={() => setInboxVisible(true)}
            >
              <Text style={styles.messagesFloatingIcon}>{"\u2709\uFE0F"}</Text>
              <Text style={styles.messagesFloatingText}>Messages</Text>
              {unreadCount > 0 && (
                <View style={styles.messagesUnreadBadge}>
                  <Text style={styles.messagesUnreadText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

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
                  {profile?.user_name
                    ? "@" + profile.user_name
                    : user.email?.split("@")[0] || "Player"}
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

            <View
              style={[styles.actionButtons, isWeb && styles.actionButtonsWeb]}
            >
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.editButton,
                  isWeb && styles.actionButtonWeb,
                ]}
                onPress={() => setEditProfileVisible(true)}
              >
                <Text style={styles.editButtonText}>
                  {"\u2699\uFE0F"} Edit Profile
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.notificationButton,
                  isWeb && styles.actionButtonWeb,
                ]}
                onPress={() => setInboxVisible(true)}
              >
                <Text style={styles.notificationButtonText}>
                  {"\uD83D\uDD14"} Notifications
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.signOutButton,
                  isWeb && styles.actionButtonWeb,
                ]}
                onPress={handleLogout}
              >
                <Text style={styles.signOutButtonText}>
                  {"\uD83D\uDEAA"} Sign Out
                </Text>
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
              onPress={() => {}}
            >
              <Text style={styles.navButtonText}>
                {"\u2764\uFE0F"} Favorite Tournaments
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButton, styles.alertsButton]}
              onPress={() => setSearchAlertsVisible(true)}
            >
              <Text style={styles.alertsButtonText}>
                {"\uD83D\uDD0D"} Search Alerts
              </Text>
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
              <>
                <Pagination
                  totalCount={totalCount}
                  displayStart={displayRange.start}
                  displayEnd={displayRange.end}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPrevPage={prevPage}
                  onNextPage={nextPage}
                  canGoPrev={canGoPrev}
                  canGoNext={canGoNext}
                />
                {paginatedFavorites.map((fav) => {
                  const t = {
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
                      tournament={t}
                      onPress={() =>
                        router.push(
                          ("/(tabs)/tournament-detail?id=" +
                            fav.tournament_id +
                            "&from=/(tabs)/profile") as any,
                        )
                      }
                      onToggleFavorite={() => handleRemoveFavorite(fav.id)}
                      onShare={() =>
                        console.log("share", fav.tournaments?.name)
                      }
                      onViewImage={() => handleViewImage(t)}
                      getTournamentImageUrl={getTournamentImageUrl}
                    />
                  );
                })}
                <Pagination
                  totalCount={totalCount}
                  displayStart={displayRange.start}
                  displayEnd={displayRange.end}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPrevPage={prevPage}
                  onNextPage={nextPage}
                  canGoPrev={canGoPrev}
                  canGoNext={canGoNext}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <FullScreenImageViewer
        visible={showImageViewer}
        imageUrl={currentImageUrl}
        title={currentImageTitle}
        onClose={() => {
          setShowImageViewer(false);
          setCurrentImageUrl(null);
          setCurrentImageTitle("");
        }}
      />

      <EditProfileModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
      />

      <NotificationsModal
        visible={inboxVisible}
        onClose={() => setInboxVisible(false)}
        userId={user?.id}
        userIdAuto={profile?.id_auto}
      />

      <SearchAlertsModal
        visible={searchAlertsVisible}
        onClose={() => setSearchAlertsVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  scrollContentWeb: { alignItems: "center", paddingBottom: SPACING.xl },
  webInner: { width: "100%" as any, maxWidth: 860 },
  mobileInner: { flex: 1 },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
    alignItems: "center",
  },
  headerWeb: { paddingTop: SPACING.lg },
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
  buttonGroup: { width: "100%" },
  appleButtonWrapper: { alignItems: "center", marginBottom: SPACING.sm },
  appleButton: { width: "100%", height: 50 },
  loadingHint: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: SPACING.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginHorizontal: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
    marginTop: SPACING.md,
  },
  profileCard: {
    margin: SPACING.md,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  messagesFloatingButton: {
    position: "absolute",
    top: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 1,
  },
  messagesFloatingIcon: { fontSize: 14 },
  messagesFloatingText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  messagesUnreadBadge: {
    backgroundColor: "#E74C3C",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  messagesUnreadText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF" },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  avatarContainer: { width: 80, height: 80, marginRight: SPACING.md },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  avatar: { width: 80, height: 80 },
  ballRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  ball: { width: 24, height: 24, borderRadius: 12, marginHorizontal: 1 },
  ball1: { backgroundColor: "#FFD700" },
  ball2: { backgroundColor: "#0066FF" },
  ball3: { backgroundColor: "#FF0000" },
  ball7: { backgroundColor: "#8B0000" },
  ball8: { backgroundColor: "#000000" },
  ball9: { backgroundColor: "#FFD700", borderWidth: 2, borderColor: "#FFF" },
  ball10: { backgroundColor: "#0066FF", borderWidth: 2, borderColor: "#FFF" },
  ball12: { backgroundColor: "#800080" },
  ball15: { backgroundColor: "#8B0000", borderWidth: 2, borderColor: "#FFF" },
  profileInfo: { flex: 1 },
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
  memberSince: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  actionButtons: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  actionButtonsWeb: { flexDirection: "row" },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  actionButtonWeb: { paddingVertical: SPACING.md + 2 },
  editButton: { backgroundColor: COLORS.secondary },
  editButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  notificationButton: { backgroundColor: COLORS.primary },
  notificationButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  signOutButton: { backgroundColor: COLORS.error },
  signOutButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  userDetails: { gap: SPACING.md },
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
  favoritesButton: { backgroundColor: COLORS.primary },
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
  alertsButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  favoritesSection: { padding: SPACING.md },
  emptyFavorites: { alignItems: "center", padding: SPACING.lg },
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
  spacerSm: { height: SPACING.sm },
});
