// app/(tabs)/profile.tsx

import * as AppleAuthentication from "expo-apple-authentication";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { Alert,
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
import { moderateScale, scale } from "../../src/utils/scaling";
import { useFavorites } from "../../src/viewmodels/hooks/use.favorites";
import { useProfileTournaments } from "../../src/viewmodels/hooks/use.profile.tournaments";
import { usePlayerLiveMatch } from "../../src/viewmodels/hooks/use.player.live.match";
import { usePlayerPerformance } from "../../src/viewmodels/hooks/use.player.performance";
import { PerformanceSnapshot } from "../../src/views/components/profile/PerformanceSnapshot";
import { useScrollToTopOnFocus } from "../../src/viewmodels/hooks/use.scroll.to.top";
import { useAuthStore } from "../../src/viewmodels/stores/auth.store";
import { Button } from "../../src/views/components/common/button";
import { Loading } from "../../src/views/components/common/loading";
import { NotificationsModal } from "../../src/views/components/notifications/NotificationsModal";
import { EditProfileModal } from "../../src/views/components/profile/EditProfileModal";
import { MyTournaments } from "../../src/views/components/profile/MyTournaments";
import { TournamentHubView } from "../../src/views/components/profile/TournamentHubView";
import { TournamentDetailModal } from "../../src/views/components/tournament/TournamentDetailModal";
import { WebTournamentDetailOverlay } from "../../src/views/screens/billiards/WebTournamentDetailOverlay";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

// Profile top-level view when the player is in a live tournament.
type ProfileTab = "tournament" | "profile";

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

const formatGameName = (game: string): string => {
  return game
    .split(/[-\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// ── Animated logged-out view ─────────────────────────────────────────────────
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
        Animated.timing(welcomeFade, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(welcomeSlide, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(messageFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(buttonsFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(buttonsSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleAppleSignIn = async () => {
    setError("");
    setAppleLoading(true);
    try {
      const result = await authService.signInWithApple();
      if (!result.user) { setError("Sign in failed. Please try again."); return; }
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", result.user.id).maybeSingle();
      if (profile) {
        router.replace("/(tabs)");
      } else {
        router.replace({ pathname: "/auth/complete-profile", params: { firstName: result.fullName?.givenName || "", lastName: result.fullName?.familyName || "" } } as any);
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
        <Text allowFontScaling={false} style={styles.headerTitle}>PROFILE</Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>View and manage your tournament history</Text>
      </View>
      <View style={styles.notLoggedIn}>
        <Animated.Text allowFontScaling={false} style={[styles.welcomeText, { opacity: welcomeFade, transform: [{ translateY: welcomeSlide }] }]}>
          Welcome!
        </Animated.Text>
        <Animated.Text allowFontScaling={false} style={[styles.message, { opacity: messageFade }]}>
          Log in to see your profile
        </Animated.Text>
        <Animated.View style={[styles.buttonGroup, isWeb && styles.buttonGroupWeb, { opacity: buttonsFade, transform: [{ translateY: buttonsSlide }] }]}>
          {Platform.OS === "ios" && (
            <>
              <View style={styles.appleButtonWrapper}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={8}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
                {appleLoading && <Text allowFontScaling={false} style={styles.loadingHint}>Signing in...</Text>}
              </View>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text allowFontScaling={false} style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}
          <Button title="Log In" onPress={() => router.push("/auth/login" as any)} fullWidth />
          <View style={styles.spacerSm} />
          <Button title="Create Account" onPress={() => router.push("/auth/register" as any)} variant="outline" fullWidth />
          {error ? <Text allowFontScaling={false} style={styles.errorText}>{error}</Text> : null}
        </Animated.View>
      </View>
    </View>
  );
};

// One Home State / Favorite Player / Favorite Game cell in the profile card.
const DetailCell = ({
  icon,
  color,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  color: string;
  label: string;
  value: string;
}) => (
  <View style={styles.detailCell}>
    <View style={styles.detailCellHead}>
      <Ionicons name={icon} size={wxMs(13)} color={color} />
      <Text allowFontScaling={false} style={styles.detailCellLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
    <Text
      allowFontScaling={false}
      style={styles.detailCellValue}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {value}
    </Text>
  </View>
);

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter();
  const scrollRef = useScrollToTopOnFocus();
  const storeProfile = useAuthStore((s) => s.profile);
  const {
    favorites: favRows,
    toggleFavorite: toggleFav,
    refetch: refetchFavorites,
  } = useFavorites(storeProfile?.id_auto);
  const { live, registered, completed } = useProfileTournaments(storeProfile?.id_auto);
  const { hub, adjustScore, isScoring, myRegId } = usePlayerLiveMatch(storeProfile?.id_auto);
  const performance = usePlayerPerformance(storeProfile?.id_auto);
  const inLiveTournament = live.length > 0;
  const [profileTab, setProfileTab] = useState<ProfileTab>("tournament");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(storeProfile ?? null);
  // Favorites come from the shared useFavorites React Query cache (single source
  // of truth) so favoriting on Billiards reflects here instantly. The cast keeps
  // the local shape that includes the joined tournament/venue data.
  const favorites = favRows as unknown as Favorite[];
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxVisible, setInboxVisible] = useState(false);
  const [inboxTab, setInboxTab] = useState<"conversations" | "notifications">("conversations");
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [searchAlertsVisible, setSearchAlertsVisible] = useState(false);
  const [detailTournamentId, setDetailTournamentId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const favoritedIds = useMemo(
    () => new Set(favorites.map((f) => f.tournament_id)),
    [favorites],
  );

  const handleToggleFavorite = async (tournamentId: number) => {
    try {
      await toggleFav(tournamentId);
    } catch {
      /* ignore — useFavorites rolls back + alerts on failure */
    }
  };

  useEffect(() => { if (storeProfile) setProfile(storeProfile); }, [storeProfile]);

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        loadProfile(session.user.id);
        loadUnreadCount(session.user.id);
      } else {
        setProfile(null);
        setUnreadCount(0);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);
    if (session?.user) {
      if (storeProfile) {
        setLoading(false);
        loadUnreadCount(session.user.id);
      } else {
        await loadProfile(session.user.id);
        await loadUnreadCount(session.user.id);
      }
    } else {
      setLoading(false);
    }
  };

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) setProfile(data);
    setLoading(false);
  };

  const loadUnreadCount = async (userId: string) => {
    try {
      const { count } = await supabase
        .from("notification_message_recipients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      setUnreadCount(count || 0);
    } catch (err) { console.error("Error loading unread count:", err); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) { await loadProfile(user.id); await loadUnreadCount(user.id); }
    await refetchFavorites();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setProfile(null); setUnreadCount(0);
    router.replace("/(tabs)" as any);
  };

  const handleSettings = () => {
    Alert.alert("Settings", undefined, [
      { text: "Edit Profile", onPress: () => setEditProfileVisible(true) },
      { text: "Sign Out", style: "destructive", onPress: handleLogout },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const openDetailModal = (tournamentId: number | string) => {
    setDetailTournamentId(String(tournamentId));
    setShowDetailModal(true);
  };
  const closeDetailModal = () => { setShowDetailModal(false); setDetailTournamentId(null); };

  // Tournament View "View Bracket" → open the spectator bracket centered on the
  // player's current/next match.
  const openBracket = (tournamentId: number) => {
    const focus = hub?.current?.matchId;
    // fk changes every tap so the (kept-mounted) spectator screen re-centers + resets.
    const fk = Date.now();
    const q =
      `tab=matches&view=bracket&fk=${fk}` +
      `${focus ? `&focus=${focus}` : ""}` +
      `${myRegId ? `&me=${myRegId}` : ""}`;
    router.push(`/live-tournament/${tournamentId}?${q}` as any);
  };

  const formatMemberSince = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" });

  const generatePlayerID = (idAuto: number) => "ID-" + String(idAuto).padStart(6, "0");

  if (loading && !profile) return <Loading fullScreen message="Loading..." />;
  if (!user) return <LoggedOutView router={router} />;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          )
        }
      >
        <View style={[styles.pageWrapper, isWeb && styles.pageWrapperWeb]}>
          <View style={[styles.header, isWeb && styles.headerWeb]}>
            <Text allowFontScaling={false} style={styles.headerTitle}>PROFILE</Text>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.cardIcons}>
              <TouchableOpacity
                style={styles.cardIconBtn}
                onPress={() => { setInboxTab("conversations"); setInboxVisible(true); }}
                hitSlop={6}
              >
                <Ionicons name="mail-outline" size={wxMs(20)} color={COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardIconBtn} onPress={handleSettings} hitSlop={6}>
                <Ionicons name="settings-outline" size={wxMs(20)} color={COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cardIconBtn}
                onPress={() => { setInboxTab("notifications"); setInboxVisible(true); }}
                hitSlop={6}
              >
                <Ionicons name="notifications-outline" size={wxMs(20)} color={COLORS.text} />
                {unreadCount > 0 && <View style={styles.bellBadge} />}
              </TouchableOpacity>
            </View>

            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.profileImage} resizeMode="cover" />
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
                <View style={styles.statusDot} />
              </View>
              <View style={styles.profileInfo}>
                <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>
                  {profile?.user_name
                    ? "@" + profile.user_name.charAt(0).toUpperCase() + profile.user_name.slice(1).toLowerCase()
                    : user.email?.split("@")[0] || "Player"}
                </Text>
                <Text allowFontScaling={false} style={styles.memberSince} numberOfLines={1}>
                  Member since {formatMemberSince(profile?.created_at || user.created_at)}
                </Text>
                <View style={styles.idChip}>
                  <Text allowFontScaling={false} style={styles.idChipText}>
                    {profile?.id_auto ? generatePlayerID(profile.id_auto) : "Loading..."}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.detailRow}>
              <DetailCell
                icon="location-outline"
                color={COLORS.error}
                label="Home State"
                value={profile?.home_state || "\u2014"}
              />
              <View style={styles.detailDivider} />
              <DetailCell
                icon="star"
                color={COLORS.warning}
                label="Fav. Player"
                value={profile?.favorite_player || "\u2014"}
              />
              <View style={styles.detailDivider} />
              <DetailCell
                icon="ellipse"
                color={COLORS.primary}
                label="Fav. Game"
                value={profile?.preferred_game ? formatGameName(profile.preferred_game) : "\u2014"}
              />
            </View>
          </View>

          {/* When the player is in a live tournament, the profile becomes a hub
              for that event: a Tournament | Profile toggle picks between the live
              match hub and the normal profile. Off the live path, the normal
              profile content sits directly under the card. */}
          {inLiveTournament && (
            <View style={styles.topToggle}>
              {(["tournament", "profile"] as ProfileTab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  activeOpacity={1}
                  style={[styles.topToggleBtn, profileTab === tab && styles.topToggleBtnActive]}
                  onPress={() => setProfileTab(tab)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.topToggleText,
                      profileTab === tab && styles.topToggleTextActive,
                    ]}
                  >
                    {tab === "tournament" ? "Tournament View" : "Profile View"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {inLiveTournament && profileTab === "tournament" ? (
            hub ? (
              <TournamentHubView
                hub={hub}
                onOpenTournament={openBracket}
                onAdjustScore={(matchId, slot, delta) => {
                  adjustScore(matchId, slot, delta).catch(() =>
                    Alert.alert(
                      "Couldn't update score",
                      "You may not have permission to score this match yet.",
                    ),
                  );
                }}
                isScoring={isScoring}
              />
            ) : null
          ) : (
            <>
              <MyTournaments
                live={live}
                registered={registered}
                completed={completed}
                favorites={favorites}
                favoritedIds={favoritedIds}
                onOpenTournament={(id) => openDetailModal(id)}
                onToggleFavorite={handleToggleFavorite}
                alertsOpen={searchAlertsVisible}
                onToggleAlerts={setSearchAlertsVisible}
                userId={storeProfile?.id_auto}
              />

              {/* Placeholder sections — only with My Tournaments, not Search Alerts */}
              {!searchAlertsVisible && (
                <>
                  <PerformanceSnapshot
                    stats={performance.stats}
                    period={performance.period}
                    onPeriod={performance.setPeriod}
                  />
                  <View style={styles.placeholderSection}>
                    <Text allowFontScaling={false} style={styles.placeholderTitle}>
                      RECENT ACTIVITY
                    </Text>
                    <View style={styles.placeholderCard}>
                      <Text allowFontScaling={false} style={styles.placeholderText}>
                        Your matches and results will show up here
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {editProfileVisible && (
        <EditProfileModal visible={editProfileVisible} onClose={() => setEditProfileVisible(false)} />
      )}

      <NotificationsModal
        visible={inboxVisible}
        onClose={() => setInboxVisible(false)}
        userId={user?.id}
        userIdAuto={profile?.id_auto}
        initialTab={inboxTab}
        onViewTournament={(id) => { setInboxVisible(false); setTimeout(() => openDetailModal(id), 150); }}
      />

      {isWeb && showDetailModal && detailTournamentId && <WebTournamentDetailOverlay id={detailTournamentId} onClose={closeDetailModal} />}
      {!isWeb && <TournamentDetailModal id={detailTournamentId} visible={showDetailModal} onClose={closeDetailModal} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  pageWrapper: { flex: 1, paddingBottom: wxSc(SPACING.xl) },
  pageWrapperWeb: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any },

  // Tournament | Profile top toggle (shown only when in a live tournament)
  topToggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.xs),
    marginHorizontal: wxSc(SPACING.md),
    marginTop: wxSc(SPACING.md),
  },
  topToggleBtn: {
    flex: 1,
    paddingVertical: wxSc(SPACING.sm),
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  topToggleBtnActive: { backgroundColor: COLORS.primary },
  topToggleText: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  topToggleTextActive: { color: "#fff" },

  // Match Center (conditional placeholder)
  matchCenter: {
    marginHorizontal: wxSc(SPACING.md),
    marginTop: wxSc(SPACING.sm),
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.md),
  },
  matchCenterHead: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.xs) },
  liveDot: { width: wxSc(8), height: wxSc(8), borderRadius: wxSc(4), backgroundColor: COLORS.error },
  matchCenterTitle: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.error,
    letterSpacing: 1,
  },
  matchCenterName: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    marginTop: wxSc(SPACING.xs),
  },
  matchCenterSub: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: wxSc(2) },

  // Placeholder sections
  placeholderSection: { marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.lg) },
  placeholderTitle: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.5,
    marginBottom: wxSc(SPACING.sm),
  },
  placeholderCard: {
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: wxSc(SPACING.xl),
    alignItems: "center",
  },
  placeholderText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textMuted, fontWeight: "600" },

  header: {
    padding: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.xl + SPACING.lg),
    paddingBottom: wxSc(SPACING.sm),
    alignItems: "center",
  },
  // New top bar: PROFILE centered with settings + bell on the right.
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.xl + SPACING.md),
    paddingBottom: wxSc(SPACING.sm),
  },
  topBarSide: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), minWidth: wxSc(60) },
  iconBtn: { padding: wxSc(2) },
  bellBadge: {
    position: "absolute",
    top: wxSc(1),
    right: wxSc(1),
    width: wxSc(8),
    height: wxSc(8),
    borderRadius: wxSc(4),
    backgroundColor: COLORS.error,
  },
  headerWeb: { paddingTop: SPACING.lg },
  headerTitle: { fontSize: wxMs(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, textAlign: "center" },
  headerSubtitle: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center", marginTop: wxSc(SPACING.xs) },

  notLoggedIn: { flex: 1, alignItems: "center", justifyContent: "center", padding: wxSc(SPACING.lg) },
  welcomeText: { fontSize: wxMs(36), fontWeight: "700", color: "#4A90D9", marginBottom: wxSc(SPACING.xl), letterSpacing: 1 },
  message: { fontSize: wxMs(FONT_SIZES.lg), color: COLORS.textMuted, marginBottom: wxSc(SPACING.xl), textAlign: "center" },
  buttonGroup: { width: "100%" },
  buttonGroupWeb: { maxWidth: 400, alignSelf: "center" as any, width: "100%" as any },
  appleButtonWrapper: { alignItems: "center", marginBottom: wxSc(SPACING.sm) },
  appleButton: { width: "100%", height: wxSc(50) },
  loadingHint: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm), marginTop: wxSc(SPACING.xs) },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: wxSc(SPACING.md) },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm), marginHorizontal: wxSc(SPACING.md) },
  errorText: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.sm), textAlign: "center", marginTop: wxSc(SPACING.md) },
  spacerSm: { height: wxSc(SPACING.sm) },

  profileCard: {
    paddingTop: wxSc(10),
    margin: wxSc(SPACING.md),
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: wxSc(SPACING.lg),
  },
  messagesFloatingButton: {
    position: "absolute",
    top: wxSc(10),
    right: wxSc(SPACING.md),
    backgroundColor: COLORS.primary,
    borderRadius: wxSc(12),
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.xs),
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(4),
    zIndex: 1,
  },
  messagesFloatingIcon: { fontSize: wxMs(14) },
  messagesFloatingText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.white },
  // Top-right card icon group: messages (envelope), settings, notifications.
  cardIcons: {
    position: "absolute",
    top: wxSc(10),
    right: wxSc(SPACING.md),
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.md),
    zIndex: 1,
  },
  cardIconBtn: { padding: wxSc(2) },
  messagesUnreadBadge: {
    backgroundColor: COLORS.error,
    borderRadius: wxSc(10),
    minWidth: wxSc(18),
    height: wxSc(18),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wxSc(4),
    marginLeft: wxSc(2),
  },
  messagesUnreadText: { fontSize: wxMs(10), fontWeight: "700", color: COLORS.white },

  profileHeader: { flexDirection: "row", alignItems: "center", marginBottom: wxSc(SPACING.sm), marginTop: wxSc(20) },
  avatarContainer: { width: wxSc(80), height: wxSc(80), marginRight: wxSc(SPACING.md) },
  profileImage: { width: wxSc(80), height: wxSc(80), borderRadius: wxSc(40), borderWidth: 2, borderColor: COLORS.border },
  avatar: { width: wxSc(80), height: wxSc(80) },
  statusDot: {
    position: "absolute",
    right: wxSc(2),
    bottom: wxSc(2),
    width: wxSc(16),
    height: wxSc(16),
    borderRadius: wxSc(8),
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.backgroundCard,
  },
  ballRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: wxSc(2) },
  ball: { width: wxSc(24), height: wxSc(24), borderRadius: wxSc(12), marginHorizontal: wxSc(1) },
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
  name: { fontSize: wxMs(FONT_SIZES.xl), fontWeight: "800", color: COLORS.text },
  memberSince: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: wxSc(2),
  },
  idChip: {
    alignSelf: "flex-start",
    marginTop: wxSc(SPACING.xs),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: wxSc(RADIUS.sm),
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(2),
  },
  idChipText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700", letterSpacing: 0.5 },

  // Home State / Favorite Player / Favorite Game row
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: wxSc(SPACING.xs),
    paddingTop: wxSc(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detailCell: { flex: 1, gap: wxSc(2) },
  detailCellHead: { flexDirection: "row", alignItems: "center", gap: wxSc(4) },
  detailCellLabel: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, flexShrink: 1 },
  detailCellValue: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "700" },
  detailDivider: { width: 1, alignSelf: "stretch", backgroundColor: COLORS.border, marginHorizontal: wxSc(SPACING.sm) },

  actionButtons: { flexDirection: "row", gap: wxSc(SPACING.xs), marginBottom: wxSc(SPACING.sm) },
  actionButtonsWeb: { flexDirection: "row" },
  actionButton: {
    flex: 1,
    paddingVertical: wxSc(SPACING.sm),
    paddingHorizontal: wxSc(SPACING.xs),
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: wxSc(44),
  },
  actionButtonWeb: { paddingVertical: SPACING.md + 2 },
  editButton: { backgroundColor: COLORS.secondary },
  editButtonText: { color: COLORS.white, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", textAlign: "center", flexShrink: 1 },
  notificationButton: { backgroundColor: COLORS.primary },
  notificationButtonText: { color: COLORS.white, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", textAlign: "center", flexShrink: 1 },
  signOutButton: { backgroundColor: COLORS.error },
  signOutButtonText: { color: COLORS.white, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", textAlign: "center", flexShrink: 1 },

  userDetails: { gap: wxSc(SPACING.md) },
  detailItem: { borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: wxSc(SPACING.sm) },
  detailLabel: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: wxSc(SPACING.xs) },
  detailValue: { fontSize: wxMs(FONT_SIZES.lg), color: COLORS.text, fontWeight: "500" },

  bottomNavigation: { flexDirection: "row", margin: wxSc(SPACING.md), gap: wxSc(SPACING.sm) },
  navButton: {
    flex: 1,
    paddingVertical: wxSc(SPACING.md),
    paddingHorizontal: wxSc(SPACING.sm),
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: wxSc(52),
  },
  favoritesButton: { backgroundColor: COLORS.primary },
  alertsButton: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  navButtonText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.white, textAlign: "center", flexShrink: 1 },
  alertsButtonText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, textAlign: "center", flexShrink: 1 },

  favoritesSection: { padding: wxSc(SPACING.md) },
  emptyFavorites: { alignItems: "center", padding: wxSc(SPACING.lg) },
  emptyText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.textMuted, marginBottom: wxSc(SPACING.xs) },
  emptySubtext: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center" },
});