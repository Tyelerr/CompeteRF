// src/views/screens/tournament/live-tournament.screen.tsx
// Public, read-only "View Tournament" screen for a started/finished tournament.
// Anyone (player, spectator, a bar owner who isn't running it) can watch: an
// Overview, the live Matches (Card + Bracket views), and the Players list — with
// none of the TD management controls.

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
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
import { RaceConfig } from "../../../utils/bracket.utils";
import { moderateScale, scale } from "../../../utils/scaling";
import { useTournamentSpectator } from "../../../viewmodels/useTournamentSpectator";
import { Loading } from "../../components/common/loading";
import { MatchesView } from "../../components/tournament/live/MatchesView";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

type Tab = "overview" | "matches" | "players";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "matches", label: "Matches" },
  { key: "players", label: "Players" },
];

const STATUS_LABEL: Record<string, string> = {
  preregistered: "Registered",
  approved: "Approved",
  checked_in: "Checked in",
  no_show: "No show",
};

const prettify = (s?: string) =>
  (s ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const fmtDate = (d?: string): string => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const fmtTime = (t?: string | null): string => {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  if (isNaN(hh)) return t;
  const ap = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${m ?? "00"} ${ap}`;
};

const raceSummary = (cfg: RaceConfig): string =>
  cfg.mode === "fixed"
    ? `Race to ${cfg.fixedWinners}`
    : cfg.mode === "groups"
      ? `${cfg.groups.length} race group${cfg.groups.length === 1 ? "" : "s"}`
      : "Fargo differential";

const liveStatus = (
  liveState?: string | null,
  status?: string,
): { label: string; live: boolean; done: boolean } => {
  if (liveState === "in_progress") return { label: "LIVE", live: true, done: false };
  if (liveState === "finished" || status === "completed")
    return { label: "FINAL", live: false, done: true };
  return { label: prettify(liveState ?? status ?? "").toUpperCase(), live: false, done: false };
};

const statusChipStyle = (status: string) => {
  if (status === "checked_in") return { backgroundColor: COLORS.success + "22", borderColor: COLORS.success };
  if (status === "approved") return { backgroundColor: COLORS.primary + "22", borderColor: COLORS.primary };
  if (status === "no_show") return { backgroundColor: COLORS.error + "22", borderColor: COLORS.error };
  return { backgroundColor: COLORS.surface, borderColor: COLORS.border };
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text allowFontScaling={false} style={styles.rowLabel}>
      {label}
    </Text>
    <Text allowFontScaling={false} style={styles.rowVal} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

export const LiveTournamentScreen = ({ id }: { id: string }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tournamentId = id ? Number(id) : undefined;
  const sp = useTournamentSpectator(tournamentId);
  const [tab, setTab] = useState<Tab>("overview");

  const t: any = sp.tournament;
  const status = liveStatus(t?.live_state, t?.status);
  const director = t?.profiles ?? null;
  const directorName = director
    ? [director.first_name, director.last_name].filter(Boolean).join(" ") ||
      (director.user_name ? `@${director.user_name}` : "Unknown")
    : "Unknown";

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + wxSc(SPACING.xs) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
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
      ) : tab === "matches" ? (
        <View style={styles.matchesWrap}>
          <MatchesView matches={sp.matches} tables={sp.tables} readOnly groups={sp.groups} />
        </View>
      ) : tab === "players" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text allowFontScaling={false} style={styles.sectionHeader}>
            {sp.players.length} PLAYER{sp.players.length === 1 ? "" : "S"}
          </Text>
          <View style={styles.card}>
            {sp.players.length === 0 ? (
              <Text allowFontScaling={false} style={styles.empty}>
                No players yet.
              </Text>
            ) : (
              sp.players.map((p, i) => (
                <View key={p.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.playerRow}>
                    <View style={styles.seedBadge}>
                      <Text allowFontScaling={false} style={styles.seedText}>
                        {p.seed ?? i + 1}
                      </Text>
                    </View>
                    <View style={styles.playerMain}>
                      <Text allowFontScaling={false} style={styles.playerName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <View style={styles.statPills}>
                        <View style={styles.statPill}>
                          <Text allowFontScaling={false} style={styles.statPillLabel}>FARGO</Text>
                          <Text allowFontScaling={false} style={styles.statPillVal}>
                            {p.fargo != null ? p.fargo : "—"}
                          </Text>
                        </View>
                        {p.group != null && (
                          <View style={[styles.statPill, styles.statPillGroup]}>
                            <Text allowFontScaling={false} style={[styles.statPillLabel, styles.statPillLabelGroup]}>GROUP</Text>
                            <Text allowFontScaling={false} style={[styles.statPillVal, styles.statPillValGroup]}>
                              {p.group}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {STATUS_LABEL[p.status] && (
                      <View style={[styles.statusChip, statusChipStyle(p.status)]}>
                        <Text allowFontScaling={false} style={styles.statusChipText}>
                          {STATUS_LABEL[p.status]}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text allowFontScaling={false} style={styles.cardTitle}>Tournament</Text>
            <Row label="Game" value={prettify(t.game_type)} />
            <Row label="Format" value={prettify(t.tournament_format)} />
            <Row label="Race" value={raceSummary(sp.raceConfig)} />
            <Row label="Players" value={String(sp.players.length)} />
          </View>

          <View style={styles.card}>
            <Text allowFontScaling={false} style={styles.cardTitle}>When & Where</Text>
            <Row label="Date" value={fmtDate(t.tournament_date)} />
            {!!fmtTime(t.start_time) && <Row label="Time" value={fmtTime(t.start_time)} />}
            <Row
              label="Venue"
              value={t.venues?.venue ?? "—"}
            />
            {t.venues?.city && (
              <Row label="City" value={`${t.venues.city}, ${t.venues.state ?? ""}`.trim()} />
            )}
            <Row label="Director" value={directorName} />
          </View>

          <View style={styles.card}>
            <Text allowFontScaling={false} style={styles.cardTitle}>Entry & Prize Pool</Text>
            <Row
              label="Entry Fee"
              value={t.entry_fee != null ? `$${t.entry_fee}` : "Free"}
            />
            {t.added_money > 0 && <Row label="Added Money" value={`$${t.added_money}`} />}
            <View style={styles.poolNote}>
              <Ionicons name="trophy-outline" size={wxMs(16)} color={COLORS.textMuted} />
              <Text allowFontScaling={false} style={styles.poolText}>
                Prize pool breakdown coming soon.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
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
  statPills: { flexDirection: "row", flexWrap: "wrap", gap: wxSc(SPACING.xs) },
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
  statusChip: {
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(4),
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusChipText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.text },
});
