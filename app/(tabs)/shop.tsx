import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Giveaway } from "../../src/models/types/giveaway.types";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { moderateScale, scale } from "../../src/utils/scaling";
import { useScrollToTopOnFocus } from "../../src/viewmodels/hooks/use.scroll.to.top";
import { useAuthStore } from "../../src/viewmodels/stores/auth.store";
import { useGiveaways } from "../../src/viewmodels/useGiveaways";
import { Button } from "../../src/views/components/common/button";
import { Loading } from "../../src/views/components/common/loading";
import { WebContainer } from "../../src/views/components/common/WebContainer";
import {
  GiveawayCard,
  GiveawayDetailModal,
  GiveawayEntryModal,
  GiveawayStatsCard,
} from "../../src/views/components/shop";
import { ConfettiBurst, ConfettiBurstRef } from "../../src/views/components/common/ConfettiBurst";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);
const { width: SW, height: SH } = require("react-native").Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  gold:        "#F5A623",
  goldDim:     "#F5A62325",
  goldBorder:  "#F5A62355",
  amber:       "#FF9F0A",
  amberDim:    "#FF9F0A20",
  amberBorder: "#FF9F0A45",
  blue:        "#007AFF",
  blueDim:     "#007AFF20",
  blueBorder:  "#007AFF50",
  green:       "#30D158",
  greenDim:    "#30D15818",
  greenBorder: "#30D15848",
  card:        "#1C1C1E",
  cardBorder:  "#2C2C2E",
  white:       "#FFFFFF",
  gray:        "#8E8E93",
  lightGray:   "#AEAEB2",
  bg:          "#000000",
};

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <View style={shS.row}>
      <View style={[shS.pill, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
        <Text allowFontScaling={false} style={[shS.text, { color: accent }]}>{label}</Text>
      </View>
      <View style={[shS.line, { backgroundColor: accent + "30" }]} />
    </View>
  );
}
const shS = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: wxSc(SPACING.md),
    marginTop: wxSc(SPACING.lg),
    marginBottom: wxSc(SPACING.md),
    gap: wxSc(SPACING.sm),
  },
  pill: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.xs),
  },
  text: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  line: { flex: 1, height: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// ActiveGiveawayWrapper
// ─────────────────────────────────────────────────────────────────────────────
function ActiveGiveawayWrapper({ children }: { children: React.ReactNode }) {
  return (
    <View style={awS.outer}>
      <View style={awS.ring} pointerEvents="none" />
      {children}
    </View>
  );
}
const awS = StyleSheet.create({
  outer: {
    marginHorizontal: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.sm),
    borderRadius: wxSc(16),
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 8,
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: wxSc(16),
    borderWidth: 1.5,
    borderColor: T.blueBorder,
    zIndex: 1,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDrawnDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `Drawn ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EndedGiveawayCard
// ─────────────────────────────────────────────────────────────────────────────
function EndedGiveawayCard({ giveaway }: { giveaway: Giveaway }) {
  const isAwarded   = giveaway.status === "awarded";
  const cardBg      = isAwarded ? "#0D1A12" : "#131313";
  const badgeLabel  = isAwarded ? "\uD83C\uDFC6  Winner Drawn" : "\uD83C\uDFB2  Drawing Soon";
  const statusLabel = isAwarded ? "Giveaway Complete" : "Entry Period Closed";
  const drawnDate   = isAwarded ? formatDrawnDate(giveaway.winner_drawn_at) : null;

  return (
    <View style={[ecS.card, { backgroundColor: cardBg, borderColor: T.greenBorder, shadowColor: T.green }]}>
      <View style={ecS.row}>
        <View style={ecS.left}>
          <View style={[ecS.badge, { backgroundColor: T.greenDim, borderColor: T.greenBorder }]}>
            <Text allowFontScaling={false} style={[ecS.badgeText, { color: T.green }]}>{badgeLabel}</Text>
          </View>
          <Text allowFontScaling={false} style={ecS.name} numberOfLines={2}>{giveaway.name}</Text>
          {giveaway.prize_value ? (
            <Text allowFontScaling={false} style={[ecS.prize, { color: T.green }]}>
              ${giveaway.prize_value.toLocaleString()} Value
            </Text>
          ) : null}
          {isAwarded && giveaway.winner_display_name ? (
            <Text allowFontScaling={false} style={ecS.winner}>{"\uD83C\uDFC5"} {giveaway.winner_display_name}</Text>
          ) : null}
          {drawnDate ? (
            <Text allowFontScaling={false} style={ecS.drawnDate}>{drawnDate}</Text>
          ) : null}
          <Text allowFontScaling={false} style={ecS.entries}>
            {giveaway.entry_count || 0} {giveaway.entry_count === 1 ? "entry" : "entries"}
          </Text>
        </View>
        {giveaway.image_url ? (
          <Image source={{ uri: giveaway.image_url }} style={ecS.image} resizeMode="cover" />
        ) : (
          <View style={ecS.imagePlaceholder}>
            <Text allowFontScaling={false} style={ecS.imagePlaceholderText}>{"\uD83C\uDF81"}</Text>
          </View>
        )}
      </View>
      <View style={[ecS.statusBar, { borderTopColor: T.greenBorder }]}>
        <Text allowFontScaling={false} style={[ecS.statusText, { color: T.green }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}
const ecS = StyleSheet.create({
  card: {
    borderRadius: wxSc(16),
    padding: wxSc(SPACING.md),
    marginHorizontal: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.sm),
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: wxSc(SPACING.sm),
  },
  left: {
    flex: 1,
    marginRight: wxSc(SPACING.md),
  },
  image: {
    width: wxSc(80),
    height: wxSc(80),
    borderRadius: wxSc(10),
  },
  imagePlaceholder: {
    width: wxSc(80),
    height: wxSc(80),
    borderRadius: wxSc(10),
    backgroundColor: T.card,
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: { fontSize: wxMs(32) },
  badge: {
    alignSelf: "flex-start",
    borderRadius: RADIUS.sm,
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.xs),
    marginBottom: wxSc(SPACING.sm),
    borderWidth: 1,
  },
  badgeText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  name: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", color: T.white, marginBottom: wxSc(SPACING.xs) },
  prize: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "600", marginBottom: wxSc(SPACING.xs) },
  winner: { fontSize: wxMs(FONT_SIZES.sm), color: T.lightGray, marginBottom: wxSc(4) },
  drawnDate: { fontSize: wxMs(FONT_SIZES.xs), color: T.gray, marginBottom: wxSc(SPACING.sm) },
  entries: { fontSize: wxMs(FONT_SIZES.xs), color: T.gray },
  statusBar: { borderTopWidth: 1, paddingTop: wxSc(SPACING.sm), alignItems: "center" },
  statusText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", letterSpacing: 0.3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ShopScreen() {
  const router = useRouter();
  const giveawaysVm = useGiveaways();
  const scrollRef = useScrollToTopOnFocus();
  const confettiRef = React.useRef<ConfettiBurstRef>(null);

  // ── Auth state: sourced from the reactive Zustand store so the login
  // banner and entry gate update immediately after login/logout without
  // requiring an app restart or manual re-fetch. ──────────────────────
  const profile = useAuthStore((s) => s.profile);
  const authLoading = useAuthStore((s) => s.isLoading);

  const [selectedGiveaway, setSelectedGiveaway] = React.useState<Giveaway | null>(null);
  const [showDetailModal, setShowDetailModal] = React.useState(false);
  const [showEntryModal, setShowEntryModal] = React.useState(false);

  const handleViewGiveaway = (g: Giveaway) => {
    setSelectedGiveaway(g);
    setShowDetailModal(true);
    giveawaysVm.trackGiveawayView(g.id);
  };

  const handleEnterGiveaway = (g: Giveaway) => {
    giveawaysVm.trackGiveawayView(g.id);
    if (!profile) { router.push("/(tabs)/profile"); return; }
    setSelectedGiveaway(g);
    setShowEntryModal(true);
  };

  const handleEntrySuccess = () => {
    if (selectedGiveaway) giveawaysVm.markAsEntered(selectedGiveaway.id);
    confettiRef.current?.fire(SW / 2, SH * 0.55);
  };

  const handleEnterFromDetail = () => {
    if (selectedGiveaway) giveawaysVm.trackGiveawayView(selectedGiveaway.id);
    setShowDetailModal(false);
    if (selectedGiveaway && !giveawaysVm.isEntered(selectedGiveaway.id)) {
      setTimeout(() => setShowEntryModal(true), 300);
    }
  };

  if (giveawaysVm.loading) return <Loading fullScreen message="Loading..." />;

  const hasActive = giveawaysVm.giveaways.length > 0;
  const hasEnded  = giveawaysVm.endedGiveaways.length > 0;

  const pageContent = (
    <>
      {isWeb ? (
        <View style={s.headerWeb}>
          <Text allowFontScaling={false} style={s.title}>GIVEAWAYS</Text>
          <Text allowFontScaling={false} style={s.subtitle}>Enter for a chance to win billiards gear</Text>
        </View>
      ) : (
        <View style={s.headerMobile}>
          <Text allowFontScaling={false} style={s.titleMobile}>GIVEAWAYS</Text>
          <Text allowFontScaling={false} style={s.subtitleMobile}>Enter for a chance to win billiards gear</Text>
        </View>
      )}

      <View style={s.statsWrapper}>
        <GiveawayStatsCard stats={giveawaysVm.stats} />
      </View>

      {!authLoading && !profile && (
        <View style={s.loginBanner}>
          <Text allowFontScaling={false} style={s.loginText}>{"\uD83C\uDF81"}{"  "}Log in to enter giveaways!</Text>
          <View style={s.loginButtons}>
            <Button title="Log In" onPress={() => router.push("/(tabs)/profile")} size="sm" />
            <Button title="Sign Up" onPress={() => router.push("/auth/register")} variant="outline" size="sm" />
          </View>
        </View>
      )}

      {giveawaysVm.error && (
        <View style={s.errorBox}>
          <Text allowFontScaling={false} style={s.errorText}>{giveawaysVm.error}</Text>
          <Button title="Try Again" onPress={giveawaysVm.refresh} size="sm" />
        </View>
      )}

      {!giveawaysVm.error && !hasActive && !hasEnded && (
        <View style={s.empty}>
          <Text allowFontScaling={false} style={s.emptyIcon}>{"\uD83C\uDF81"}</Text>
          <Text allowFontScaling={false} style={s.emptyTitle}>No Active Giveaways</Text>
          <Text allowFontScaling={false} style={s.emptySubtitle}>Check back soon for new giveaways!</Text>
        </View>
      )}

      {/* Active */}
      {hasActive && (
        <>
          <SectionHeader label="Active Now" accent={T.green} />
          {isWeb ? (
            <View style={s.webGrid}>
              {giveawaysVm.giveaways.map((g) => (
                <View key={g.id} style={s.webGridItem}>
                  <GiveawayCard
                    giveaway={g}
                    isEntered={giveawaysVm.isEntered(g.id)}
                    daysRemaining={giveawaysVm.getDaysRemaining(g.end_date)}
                    onEnter={() => handleEnterGiveaway(g)}
                    onView={() => handleViewGiveaway(g)}
                  />
                </View>
              ))}
              {giveawaysVm.giveaways.length % 2 !== 0 && <View style={s.webGridItem} />}
            </View>
          ) : (
            giveawaysVm.giveaways.map((g) => (
              <ActiveGiveawayWrapper key={g.id}>
                <GiveawayCard
                  giveaway={g}
                  isEntered={giveawaysVm.isEntered(g.id)}
                  daysRemaining={giveawaysVm.getDaysRemaining(g.end_date)}
                  onEnter={() => handleEnterGiveaway(g)}
                  onView={() => handleViewGiveaway(g)}
                />
              </ActiveGiveawayWrapper>
            ))
          )}
        </>
      )}

      {/* Latest Results */}
      {hasEnded && (
        <>
          <SectionHeader label="Latest Results" accent={T.green} />
          {isWeb ? (
            <View style={s.webGrid}>
              {giveawaysVm.endedGiveaways.map((g) => (
                <View key={g.id} style={s.webGridItem}>
                  <EndedGiveawayCard giveaway={g} />
                </View>
              ))}
              {giveawaysVm.endedGiveaways.length % 2 !== 0 && <View style={s.webGridItem} />}
            </View>
          ) : (
            giveawaysVm.endedGiveaways.map((g) => (
              <EndedGiveawayCard key={g.id} giveaway={g} />
            ))
          )}
        </>
      )}

      <View style={{ height: wxSc(SPACING.xxl) }} />
    </>
  );

  return (
    <WebContainer>
      <View style={s.container}>
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, isWeb && s.scrollContentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            !isWeb ? (
              <RefreshControl
                refreshing={giveawaysVm.refreshing}
                onRefresh={giveawaysVm.refresh}
                tintColor={T.blue}
              />
            ) : undefined
          }
        >
          {isWeb ? <View style={s.webInner}>{pageContent}</View> : pageContent}
        </ScrollView>

        <GiveawayDetailModal
          visible={showDetailModal}
          giveaway={selectedGiveaway}
          isEntered={selectedGiveaway ? giveawaysVm.isEntered(selectedGiveaway.id) : false}
          daysRemaining={selectedGiveaway ? giveawaysVm.getDaysRemaining(selectedGiveaway.end_date) : ""}
          onClose={() => setShowDetailModal(false)}
          onEnter={handleEnterFromDetail}
        />
        <GiveawayEntryModal
          visible={showEntryModal}
          giveaway={selectedGiveaway}
          onClose={() => setShowEntryModal(false)}
          onSuccess={handleEntrySuccess}
        />
      </View>
      <ConfettiBurst ref={confettiRef} />
    </WebContainer>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 0 },
  scrollContentWeb: { alignItems: "center", paddingHorizontal: wxSc(SPACING.md), paddingBottom: wxSc(SPACING.xl) },
  webInner: { width: "100%", maxWidth: 900 },

  headerWeb: { alignItems: "center", paddingTop: wxSc(SPACING.lg), paddingBottom: wxSc(SPACING.sm) },
  title: { fontSize: wxMs(FONT_SIZES.xl), fontWeight: "700", color: T.white, letterSpacing: 1 },
  subtitle: { fontSize: wxMs(FONT_SIZES.sm), color: T.gray, marginTop: wxSc(4) },

  headerMobile: { alignItems: "center", paddingTop: wxSc(56), paddingBottom: wxSc(14) },
  titleMobile: { fontSize: wxMs(22), fontWeight: "700", color: T.white, letterSpacing: 1.5 },
  subtitleMobile: { fontSize: wxMs(FONT_SIZES.sm), color: T.gray, marginTop: wxSc(4) },

  statsWrapper: { marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.xs) },

  webGrid: { flexDirection: "row", flexWrap: "wrap", gap: wxSc(SPACING.md), paddingHorizontal: wxSc(SPACING.md) },
  webGridItem: { flex: 1, minWidth: 300 },

  loginBanner: {
    backgroundColor: T.blueDim, borderRadius: wxSc(14), padding: wxSc(SPACING.md),
    marginHorizontal: wxSc(SPACING.md), marginBottom: wxSc(SPACING.md),
    borderWidth: 1, borderColor: T.blueBorder,
  },
  loginText: { fontSize: wxMs(FONT_SIZES.md), color: T.white, textAlign: "center", marginBottom: wxSc(SPACING.sm), fontWeight: "500" },
  loginButtons: { flexDirection: "row", justifyContent: "center", gap: wxSc(SPACING.sm) },

  errorBox: {
    backgroundColor: COLORS.surface, borderRadius: wxSc(12), padding: wxSc(SPACING.lg),
    alignItems: "center", marginBottom: wxSc(SPACING.md), marginHorizontal: wxSc(SPACING.md),
  },
  errorText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.error, textAlign: "center", marginBottom: wxSc(SPACING.md) },

  empty: { alignItems: "center", padding: wxSc(SPACING.xl), marginTop: wxSc(SPACING.xl) },
  emptyIcon: { fontSize: wxMs(64), marginBottom: wxSc(SPACING.md) },
  emptyTitle: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", color: T.white, marginBottom: wxSc(SPACING.sm) },
  emptySubtitle: { fontSize: wxMs(FONT_SIZES.md), color: T.gray, textAlign: "center" },
});
