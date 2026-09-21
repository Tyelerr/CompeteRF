// src/views/screens/tournament/live-tournament.screen.tsx
// Public, read-only "View Tournament" screen for a started/finished tournament.
// Anyone (player, spectator, a bar owner who isn't running it) can watch: an
// Overview, the live Matches (Card + Bracket views), and the Players list — with
// none of the TD management controls.

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { useTournamentSpectator } from "../../../viewmodels/useTournamentSpectator";
import { Loading } from "../../components/common/loading";
import { MatchesView } from "../../components/tournament/live/MatchesView";
import { PayoutSummary } from "../../components/tournament/live/PayoutSummary";
import { PayoutsView } from "../../components/tournament/live/PayoutsView";
import { SpectatorOverview } from "../../components/tournament/live/SpectatorOverview";
import { StatsView } from "../../components/tournament/live/StatsView";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

type Tab = "overview" | "matches" | "stats" | "payouts";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "matches", label: "Matches" },
  { key: "stats", label: "Stats" },
  { key: "payouts", label: "Payouts" },
];

const prettify = (s?: string) =>
  (s ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const liveStatus = (
  liveState?: string | null,
  status?: string,
): { label: string; live: boolean; done: boolean } => {
  if (liveState === "in_progress") return { label: "LIVE", live: true, done: false };
  if (liveState === "finished" || status === "completed")
    return { label: "FINAL", live: false, done: true };
  return { label: prettify(liveState ?? status ?? "").toUpperCase(), live: false, done: false };
};

export const LiveTournamentScreen = ({
  id,
  initialTab,
  initialView,
  focusMatchId,
  focusKey,
  highlightRegId,
  from,
}: {
  id: string;
  initialTab?: string;
  initialView?: string;
  focusMatchId?: string;
  focusKey?: string;
  highlightRegId?: number | null;
  // Which tab/screen to return to on Back. This screen lives under (tabs) as a
  // hidden tab, so a plain router.back() falls to the first tab (Home).
  from?: string;
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tournamentId = id ? Number(id) : undefined;
  const sp = useTournamentSpectator(tournamentId);
  const goBack = () => {
    if (from === "profile") router.navigate("/profile" as any);
    else router.back();
  };
  // Players is consolidated into Stats — map any saved ?tab=players deep link to Stats
  // (otherwise unknown tabs fall back to Overview).
  const requestedTab = initialTab === "players" ? "stats" : initialTab;
  const validTab = TABS.some((t) => t.key === requestedTab)
    ? (requestedTab as Tab)
    : "overview";
  const [tab, setTab] = useState<Tab>(validTab);
  const matchesInitialMode = initialView === "bracket" ? "bracket" : "cards";

  // This screen stays mounted (it's a tab route), so re-opening it from "View
  // Bracket" must reset the tab to the requested one each time (focusKey changes
  // per navigation). The Matches view itself is remounted via key={focusKey}.
  useEffect(() => {
    setTab(validTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, initialTab]);

  // Which registration ids are in a live match right now (drives the "Playing" tag
  // on Overview leaders + the Stats player list).
  const playingRegIds = sp.playingRegIds;

  const t: any = sp.tournament;
  const status = liveStatus(t?.live_state, t?.status);

  return (
    <View style={styles.root}>
      <View style={[styles.inner, isWeb && styles.webInner]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + wxSc(SPACING.xs) }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={wxMs(24)} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <Text allowFontScaling={false} style={styles.headerTitle} numberOfLines={1}>
            {t?.name ?? "Tournament"}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            status.live && styles.statusLive,
            status.done && styles.statusDone,
          ]}
        >
          <Text allowFontScaling={false} style={styles.statusText}>
            {status.label || "—"}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((tb) => (
          <TouchableOpacity
            key={tb.key}
            activeOpacity={0.8}
            style={[styles.tab, tab === tb.key && styles.tabActive]}
            onPress={() => setTab(tb.key)}
          >
            <Text
              allowFontScaling={false}
              style={[styles.tabText, tab === tb.key && styles.tabTextActive]}
            >
              {tb.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {sp.isLoading && !t ? (
        <View style={styles.center}>
          <Loading message="Loading tournament..." />
        </View>
      ) : !t ? (
        <View style={styles.center}>
          <Text allowFontScaling={false} style={styles.empty}>
            Tournament not found.
          </Text>
        </View>
      ) : tab === "stats" ? (
        <View style={styles.matchesWrap}>
          <StatsView
            matches={sp.matches}
            players={sp.players}
            playingRegIds={playingRegIds}
            raceConfig={sp.raceConfig}
            highlightRegId={highlightRegId}
          />
        </View>
      ) : tab === "payouts" ? (
        <View style={styles.matchesWrap}>
          <PayoutsView
            matches={sp.matches}
            config={sp.prizeConfig}
            entryPool={sp.entryPool}
            sidePotPools={sp.sidePotPools}
            sidePotEntrants={sp.sidePotEntrants}
            summary={<PayoutSummary data={sp.payoutSummary} />}
          />
        </View>
      ) : tab === "matches" ? (
        <View style={styles.matchesWrap}>
          <MatchesView
            key={focusKey ?? "matches"}
            matches={sp.matches}
            tables={sp.tables}
            readOnly
            groups={sp.groups}
            initialMode={matchesInitialMode}
            focusMatchId={focusMatchId}
            focusKey={focusKey}
            highlightRegId={highlightRegId}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <SpectatorOverview
            players={sp.players}
            playingRegIds={playingRegIds}
            kpis={sp.kpis}
            activeMatches={sp.activeMatches}
            upNext={sp.upNext}
            autoAssignMode={sp.autoAssignMode}
            events={sp.events}
            live={status.live}
            onOpenPlayers={() => setTab("stats")}
            onOpenMatches={() => setTab("matches")}
          />
        </ScrollView>
      )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1 },
  // Web: keep the page content a sensible centered width instead of stretching the
  // tab bars and toggles across an ultrawide window.
  webInner: { flex: 1, width: "100%" as any, maxWidth: 1080, alignSelf: "center" as any },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: wxSc(SPACING.sm),
    paddingBottom: wxSc(SPACING.sm),
    gap: wxSc(SPACING.xs),
  },
  backBtn: { padding: wxSc(SPACING.xs) },
  headerMid: { flex: 1 },
  headerTitle: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
  statusPill: {
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(4),
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusLive: { backgroundColor: COLORS.error, borderColor: COLORS.error },
  statusDone: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statusText: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.5,
  },

  tabs: {
    flexDirection: "row",
    marginHorizontal: wxSc(SPACING.md),
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.xs),
    marginBottom: wxSc(SPACING.sm),
  },
  tab: {
    flex: 1,
    paddingVertical: wxSc(SPACING.sm),
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textSecondary },
  tabTextActive: { color: "#fff" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center" },

  matchesWrap: { flex: 1 },
  content: { padding: wxSc(SPACING.md), paddingBottom: wxSc(SPACING.xl) },

  sectionHeader: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: wxSc(SPACING.sm),
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.md),
  },
  cardTitle: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: wxSc(SPACING.sm),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.xs),
  },
  rowLabel: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  rowVal: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  poolNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.xs),
    marginTop: wxSc(SPACING.sm),
  },
  poolText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted },

  // Players search + sort row
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.sm),
    marginBottom: wxSc(SPACING.sm),
  },
  search: {
    flex: 1,
    height: wxSc(44),
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: 0,
    fontSize: wxMs(FONT_SIZES.sm),
  },
  sortWrap: { width: wxSc(140) },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: wxSc(SPACING.xs) },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.sm),
  },
  seedBadge: {
    minWidth: wxSc(26),
    height: wxSc(26),
    borderRadius: wxSc(13),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wxSc(4),
  },
  seedText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.textSecondary },
  playerMain: { flex: 1, gap: wxSc(SPACING.xs) },
  playerName: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  playerNameOut: { color: COLORS.textMuted },

  // W/L record boxes
  recordRow: { flexDirection: "row", alignItems: "center", gap: wxSc(4), flexWrap: "wrap" },
  recBox: {
    width: wxSc(18),
    height: wxSc(18),
    borderRadius: wxSc(4),
    alignItems: "center",
    justifyContent: "center",
  },
  recWin: { backgroundColor: COLORS.success },
  recLoss: { backgroundColor: COLORS.error },
  recBoxText: { fontSize: wxMs(10), fontWeight: "900", color: "#fff" },
  recordEmpty: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted },
  outTag: {
    fontSize: wxMs(9),
    fontWeight: "900",
    color: COLORS.error,
    letterSpacing: 0.5,
    marginLeft: wxSc(2),
  },

  // Right-side Fargo / Group pills
  playerRight: { alignItems: "flex-end", gap: wxSc(4) },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(4),
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(3),
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statPillGroup: { backgroundColor: COLORS.primary + "18", borderColor: COLORS.primary },
  statPillLabel: {
    fontSize: wxMs(9),
    fontWeight: "800",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  statPillLabelGroup: { color: COLORS.primary },
  statPillVal: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  statPillValGroup: { color: COLORS.primary },

  // Players status filter (segmented)
  filterRow: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: wxSc(SPACING.xs),
    marginBottom: wxSc(SPACING.sm),
  },
  filterBtn: {
    flex: 1,
    paddingVertical: wxSc(SPACING.xs),
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  filterBtnOn: { backgroundColor: COLORS.primary },
  filterText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textSecondary },
  filterTextOn: { color: "#fff" },

  // Compact standings rows
  pRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.sm),
  },
  pRank: {
    minWidth: wxSc(22),
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.textSecondary,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  pMain: { flex: 1, minWidth: 0 as any, gap: wxSc(2) },
  pNameRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.xs) },
  pName: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, flexShrink: 1 },
  pNameOut: { color: COLORS.textMuted },
  pPlaying: {
    fontSize: wxMs(9),
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 0.3,
  },
  pSubRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), flexWrap: "wrap" },
  pFargo: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700", fontVariant: ["tabular-nums"] },
  pGroupTag: {
    paddingHorizontal: wxSc(SPACING.xs),
    paddingVertical: wxSc(1),
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary + "18",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  pGroupText: { fontSize: wxMs(9), fontWeight: "800", color: COLORS.primary, letterSpacing: 0.3 },
  pRec: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", fontVariant: ["tabular-nums"] },
  pRecEmpty: { color: COLORS.textMuted },
  win: { color: COLORS.success },
  loss: { color: COLORS.error },
  recSep: { color: COLORS.textMuted },
  pIn: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.success },
  pOut: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.error },
});
