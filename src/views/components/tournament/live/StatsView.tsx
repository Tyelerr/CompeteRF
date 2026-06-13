// src/views/components/tournament/live/StatsView.tsx
// Read-only tournament stats with a Tournament / Players toggle. Tournament shows
// event-wide progress, timing, highlights and a W/L leaderboard. Players shows a
// picked player's card plus their Tournament Performance Rating for this event.
// Shown to everyone in the live view and to the TD in the manage hub. Pure
// presentation over computeTournamentStats / computeAllPlayerStats.

import { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import {
  computeAllPlayerStats,
  computeTournamentStats,
  formatDurationMs,
  PlayerTournamentStats,
  winFractionLabel,
  winPctLabel,
} from "../../../../utils/tournament.stats";
import { Dropdown } from "../../common/dropdown";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Text allowFontScaling={false} style={styles.statValue} numberOfLines={1}>
      {value}
    </Text>
    <Text allowFontScaling={false} style={styles.statLabel} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const Row = ({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) => (
  <View style={styles.row}>
    <Text allowFontScaling={false} style={styles.rowLabel}>
      {label}
    </Text>
    <Text
      allowFontScaling={false}
      style={[styles.rowValue, valueColor ? { color: valueColor } : null]}
    >
      {value}
    </Text>
  </View>
);

// Green above Fargo, red below, gray near it (±10).
const deltaColor = (d: number | null): string =>
  d == null
    ? COLORS.textMuted
    : d > 10
      ? COLORS.success
      : d < -10
        ? COLORS.error
        : COLORS.textSecondary;
const deltaLabel = (d: number | null): string =>
  d == null ? "N/A" : d === 0 ? "Even" : d > 0 ? `+${d}` : `${d}`;

const TournamentStatsBody = ({ matches }: { matches: LiveMatch[] }) => {
  const stats = useMemo(() => computeTournamentStats(matches), [matches]);
  return (
    <>
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          Progress
        </Text>
        <View style={styles.grid}>
          <Stat
            label="Played"
            value={`${stats.matchesCompleted}/${stats.matchesTotal}`}
          />
          <Stat label="Complete" value={`${stats.percentComplete}%`} />
          <Stat label="Live now" value={String(stats.matchesInProgress)} />
          <Stat label="Remaining" value={String(stats.matchesRemaining)} />
        </View>
        <View style={styles.barTrack}>
          <View
            style={[styles.barFill, { width: `${stats.percentComplete}%` }]}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          Match Timing
        </Text>
        <View style={styles.grid}>
          <Stat label="Avg / match" value={formatDurationMs(stats.avgMatchMs)} />
          <Stat label="Fastest" value={formatDurationMs(stats.fastestMatchMs)} />
          <Stat label="Longest" value={formatDurationMs(stats.longestMatchMs)} />
          <Stat label="Total racks" value={String(stats.totalRacks)} />
        </View>
      </View>

      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          Highlights
        </Text>
        <View style={styles.grid}>
          <Stat label="Upsets" value={String(stats.upsets)} />
          <Stat label="Forfeits" value={String(stats.forfeits)} />
          <Stat label="Withdrawals" value={String(stats.withdrawals)} />
        </View>
      </View>

      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          W / L Leaderboard
        </Text>
        {stats.leaders.length === 0 ? (
          <Text allowFontScaling={false} style={styles.empty}>
            No completed matches yet.
          </Text>
        ) : (
          stats.leaders.map((p, i) => (
            <View key={p.key}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.leaderRow}>
                <Text allowFontScaling={false} style={styles.rank}>
                  {`#${i + 1}`}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={styles.leaderName}
                  numberOfLines={1}
                >
                  {p.name}
                </Text>
                <Text allowFontScaling={false} style={styles.record}>
                  {`${p.wins}-${p.losses}`}
                </Text>
                <View style={styles.pctPill}>
                  <Text allowFontScaling={false} style={styles.pctText}>
                    {winPctLabel(p)}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );
};

const PlayerStatsBody = ({
  players,
  selected,
  onSelect,
}: {
  players: PlayerTournamentStats[];
  selected: PlayerTournamentStats | null;
  onSelect: (key: string) => void;
}) => {
  if (players.length === 0) {
    return (
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.empty}>
          No players yet.
        </Text>
      </View>
    );
  }
  const options = players.map((p) => ({
    label: `${p.name}  (${p.matchWins}-${p.matchLosses})`,
    value: p.key,
  }));
  const p = selected;
  const dColor = p ? deltaColor(p.performanceDelta) : COLORS.textMuted;

  return (
    <>
      <Dropdown
        options={options}
        value={p?.key ?? ""}
        onSelect={onSelect}
        placeholder="Select a player"
      />
      {p && (
        <>
          {/* Player card */}
          <View style={[styles.card, styles.playerCard]}>
            <View style={styles.playerCardMain}>
              <Text
                allowFontScaling={false}
                style={styles.playerName}
                numberOfLines={1}
              >
                {p.name}
              </Text>
              <Text allowFontScaling={false} style={styles.playerSub}>
                {`Record ${p.matchWins}-${p.matchLosses}`}
              </Text>
            </View>
            <View style={styles.fargoPill}>
              <Text allowFontScaling={false} style={styles.fargoPillLabel}>
                FARGO
              </Text>
              <Text allowFontScaling={false} style={styles.fargoPillVal}>
                {p.fargo != null ? p.fargo : "—"}
              </Text>
            </View>
          </View>

          {/* Tournament performance */}
          <View style={styles.card}>
            <Text allowFontScaling={false} style={styles.cardTitle}>
              Tournament Performance
            </Text>
            <View style={styles.perfHead}>
              <View>
                <Text allowFontScaling={false} style={styles.perfRating}>
                  {p.performanceRating != null ? p.performanceRating : "N/A"}
                </Text>
                <Text allowFontScaling={false} style={styles.perfRatingLabel}>
                  Performance Rating
                </Text>
              </View>
              <View style={[styles.deltaBadge, { borderColor: dColor }]}>
                <Text
                  allowFontScaling={false}
                  style={[styles.deltaText, { color: dColor }]}
                >
                  {deltaLabel(p.performanceDelta)}
                </Text>
                <Text allowFontScaling={false} style={styles.deltaSub}>
                  vs Fargo
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <Row
              label="Current Fargo"
              value={p.fargo != null ? String(p.fargo) : "—"}
            />
            <Row
              label="Performance Delta"
              value={deltaLabel(p.performanceDelta)}
              valueColor={dColor}
            />
            <Row label="Win %" value={winFractionLabel(p.winPct)} />
            <Row
              label="Avg Opponent Fargo"
              value={p.avgOpponentFargo != null ? String(p.avgOpponentFargo) : "—"}
            />
            <Row label="Games Won" value={String(p.gamesWon)} />
            <Row label="Games Lost" value={String(p.gamesLost)} />
            <Row label="Record" value={`${p.matchWins}-${p.matchLosses}`} />
          </View>
        </>
      )}
    </>
  );
};

export const StatsView = ({
  matches,
  highlightRegId,
}: {
  matches: LiveMatch[];
  highlightRegId?: number | null;
}) => {
  const [view, setView] = useState<"tournament" | "players">("tournament");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const players = useMemo(() => computeAllPlayerStats(matches), [matches]);

  // Selected = explicit pick, else the viewer (if known), else the top performer.
  const defaultKey = highlightRegId != null ? `r${highlightRegId}` : null;
  const selected =
    players.find((p) => p.key === selectedKey) ??
    (defaultKey ? players.find((p) => p.key === defaultKey) : undefined) ??
    players[0] ??
    null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.toggle}>
        {(["tournament", "players"] as const).map((v) => (
          <TouchableOpacity
            key={v}
            activeOpacity={0.85}
            style={[styles.toggleBtn, view === v && styles.toggleBtnOn]}
            onPress={() => setView(v)}
          >
            <Text
              allowFontScaling={false}
              style={[styles.toggleText, view === v && styles.toggleTextOn]}
            >
              {v === "tournament" ? "Tournament" : "Players"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === "tournament" ? (
        <TournamentStatsBody matches={matches} />
      ) : (
        <PlayerStatsBody
          players={players}
          selected={selected}
          onSelect={setSelectedKey}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.xl * 2),
    ...Platform.select({
      web: { maxWidth: 760, width: "100%" as any, alignSelf: "center" as any },
    }),
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.md),
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
  },
  toggleBtnOn: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textSecondary },
  toggleTextOn: { color: "#fff" },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  cardTitle: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.md),
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "25%", paddingVertical: webSc(SPACING.xs), gap: webSc(2) },
  statValue: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  barTrack: {
    height: webSc(6),
    borderRadius: webSc(RADIUS.full),
    backgroundColor: COLORS.background,
    marginTop: webSc(SPACING.sm),
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: webSc(RADIUS.full), backgroundColor: COLORS.success },
  empty: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.xs) },

  // Leaderboard rows
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
  },
  rank: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.primary,
    minWidth: webSc(30),
    fontVariant: ["tabular-nums"],
  },
  leaderName: { flex: 1, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  record: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  pctPill: {
    minWidth: webSc(46),
    alignItems: "center",
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(3),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pctText: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },

  // Player card
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.md),
  },
  playerCardMain: { flex: 1 },
  playerName: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", color: COLORS.text },
  playerSub: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginTop: webSc(2),
  },
  fargoPill: {
    alignItems: "center",
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fargoPillLabel: { fontSize: webMs(9), fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5 },
  fargoPillVal: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },

  // Performance card
  perfHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  perfRating: {
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  perfRatingLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  deltaBadge: {
    alignItems: "center",
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1.5,
  },
  deltaText: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", fontVariant: ["tabular-nums"] },
  deltaSub: { fontSize: webMs(9), color: COLORS.textMuted, fontWeight: "700", letterSpacing: 0.5 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
  },
  rowLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  rowValue: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
});
