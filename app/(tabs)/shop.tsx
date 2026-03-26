import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { Giveaway } from "../../src/models/types/giveaway.types";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { useScrollToTopOnFocus } from "../../src/viewmodels/hooks/use.scroll.to.top";
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
const { width: SW, height: SH } = require("react-native").Dimensions.get("window");

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Design tokens
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SectionHeader
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SectionHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <View style={shS.row}>
      <View style={[shS.pill, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
        <Text style={[shS.text, { color: accent }]}>{label}</Text>
      </View>
      <View style={[shS.line, { backgroundColor: accent + "30" }]} />
    </View>
  );
}
const shS = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  pill: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  text: { fontSize: FONT_SIZES.xs, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  line: { flex: 1, height: 1 },
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ActiveGiveawayWrapper â€” glowing border around active cards
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: 16,
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 8,
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: T.blueBorder,
    zIndex: 1,
  },
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// EndedGiveawayCard
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EndedGiveawayCard({ giveaway }: { giveaway: Giveaway }) {
  const isAwarded   = giveaway.status === "awarded";
  const cardBg      = isAwarded ? "#1A1710" : "#171510";
  const accent      = isAwarded ? T.gold : T.amber;
  const accentDim   = isAwarded ? T.goldDim : T.amberDim;
  const accentBorder= isAwarded ? T.goldBorder : T.amberBorder;
  const badgeLabel  = isAwarded ? "\uD83C\uDFC6  Winner Drawn" : "\uD83C\uDFB2  Drawing Soon";
  const statusLabel = isAwarded ? "Giveaway Complete" : "Entry Period Closed";

  return (
    <View style={[ecS.card, { backgroundColor: cardBg, borderColor: accentBorder,
      shadowColor: accent }]}>
      <View style={[ecS.badge, { backgroundColor: accentDim, borderColor: accentBorder }]}>
        <Text style={[ecS.badgeText, { color: accent }]}>{badgeLabel}</Text>
      </View>
      <Text style={ecS.name}>{giveaway.name}</Text>
      {giveaway.prize_value ? (
        <Text style={[ecS.prize, { color: accent }]}>
          ${giveaway.prize_value.toLocaleString()} Value
        </Text>
      ) : null}
      {giveaway.description ? (
        <Text style={ecS.desc} numberOfLines={2}>{giveaway.description}</Text>
      ) : null}
      <Text style={ecS.entries}>
        {giveaway.entry_count || 0} {giveaway.entry_count === 1 ? "entry" : "entries"}
      </Text>
      <View style={[ecS.statusBar, { borderTopColor: accentBorder }]}>
        <Text style={[ecS.statusText, { color: accent }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}
const ecS = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  badgeText: { fontSize: FONT_SIZES.sm, fontWeight: "700" },
  name: { fontSize: FONT_SIZES.lg, fontWeight: "700", color: T.white, marginBottom: SPACING.xs },
  prize: { fontSize: FONT_SIZES.md, fontWeight: "600", marginBottom: SPACING.xs },
  desc: { fontSize: FONT_SIZES.sm, color: T.lightGray, lineHeight: 18, marginBottom: SPACING.sm },
  entries: { fontSize: FONT_SIZES.xs, color: T.gray, marginBottom: SPACING.sm },
  statusBar: { borderTopWidth: 1, paddingTop: SPACING.sm, alignItems: "center" },
  statusText: { fontSize: FONT_SIZES.sm, fontWeight: "600", letterSpacing: 0.3 },
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main Screen
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ShopScreen() {
  const router = useRouter();
  const giveawaysVm = useGiveaways();
  const scrollRef = useScrollToTopOnFocus();
  const confettiRef = React.useRef<ConfettiBurstRef>(null);

  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedGiveaway, setSelectedGiveaway] = useState<Giveaway | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);

  useEffect(() => { checkUser(); }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("profiles").select("*").eq("id", session.user.id).single();
        setProfile(data);
      }
    } catch (e) { console.error(e); }
    finally { setAuthLoading(false); }
  };

  const handleViewGiveaway = (g: Giveaway) => {
    setSelectedGiveaway(g);
    setShowDetailModal(true);
    giveawaysVm.trackGiveawayView(g.id);
  };

  const handleEnterGiveaway = (g: Giveaway) => {
    if (!profile) { router.push("/(tabs)/profile"); return; }
    setSelectedGiveaway(g);
    setShowEntryModal(true);
  };

  const handleEntrySuccess = () => {
    if (selectedGiveaway) giveawaysVm.markAsEntered(selectedGiveaway.id);
    confettiRef.current?.fire(SW / 2, SH * 0.55);
  };

  const handleEnterFromDetail = () => {
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
      {/* Header */}
      {isWeb ? (
        <View style={s.headerWeb}>
          <Text style={s.title}>GIVEAWAYS</Text>
          <Text style={s.subtitle}>Enter for a chance to win billiards gear</Text>
        </View>
      ) : (
        <View style={s.headerMobile}>
          <Text style={s.titleMobile}>GIVEAWAYS</Text>
          <Text style={s.subtitleMobile}>Enter for a chance to win billiards gear</Text>
        </View>
      )}

      {/* Stats */}
      <View style={s.statsWrapper}>
        <GiveawayStatsCard stats={giveawaysVm.stats} />
      </View>

      {/* Login banner */}
      {!authLoading && !profile && (
        <View style={s.loginBanner}>
          <Text style={s.loginText}>🎁  Log in to enter giveaways!</Text>
          <View style={s.loginButtons}>
            <Button title="Log In" onPress={() => router.push("/(tabs)/profile")} size="sm" />
            <Button title="Sign Up" onPress={() => router.push("/auth/register")} variant="outline" size="sm" />
          </View>
        </View>
      )}

      {/* Error */}
      {giveawaysVm.error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{giveawaysVm.error}</Text>
          <Button title="Try Again" onPress={giveawaysVm.refresh} size="sm" />
        </View>
      )}

      {/* Empty */}
      {!giveawaysVm.error && !hasActive && !hasEnded && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>{"🎁"}</Text>
          <Text style={s.emptyTitle}>No Active Giveaways</Text>
          <Text style={s.emptySubtitle}>Check back soon for new giveaways!</Text>
        </View>
      )}

      {/* â”€â”€ Active â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {/* â”€â”€ Latest Results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {hasEnded && (
        <>
          <SectionHeader label="Latest Results" accent={T.gold} />
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

      <View style={{ height: SPACING.xxl }} />
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
  scrollContentWeb: { alignItems: "center", paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  webInner: { width: "100%", maxWidth: 900 },

  headerWeb: { alignItems: "center", paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontSize: FONT_SIZES.xl, fontWeight: "700", color: T.white, letterSpacing: 1 },
  subtitle: { fontSize: FONT_SIZES.sm, color: T.gray, marginTop: 4 },

  headerMobile: { alignItems: "center", paddingTop: 56, paddingBottom: 14 },
  titleMobile: { fontSize: 22, fontWeight: "700", color: T.white, letterSpacing: 1.5 },
  subtitleMobile: { fontSize: FONT_SIZES.sm, color: T.gray, marginTop: 4 },

  statsWrapper: { marginHorizontal: SPACING.md, marginTop: SPACING.sm, marginBottom: SPACING.xs },

  webGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md, paddingHorizontal: SPACING.md },
  webGridItem: { flex: 1, minWidth: 300 },

  loginBanner: {
    backgroundColor: T.blueDim, borderRadius: 14, padding: SPACING.md,
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: T.blueBorder,
  },
  loginText: { fontSize: FONT_SIZES.md, color: T.white, textAlign: "center", marginBottom: SPACING.sm, fontWeight: "500" },
  loginButtons: { flexDirection: "row", justifyContent: "center", gap: SPACING.sm },

  errorBox: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: SPACING.lg,
    alignItems: "center", marginBottom: SPACING.md, marginHorizontal: SPACING.md,
  },
  errorText: { fontSize: FONT_SIZES.md, color: COLORS.error, textAlign: "center", marginBottom: SPACING.md },

  empty: { alignItems: "center", padding: SPACING.xl, marginTop: SPACING.xl },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.md },
  emptyTitle: { fontSize: FONT_SIZES.lg, fontWeight: "700", color: T.white, marginBottom: SPACING.sm },
  emptySubtitle: { fontSize: FONT_SIZES.md, color: T.gray, textAlign: "center" },
});





