// src/views/components/tournament/live/StatsView.tsx
// Read-only tournament stats — progress, match timing, highlights and a W/L
// leaderboard — derived from the live match list. Shown to everyone in the live
// tournament view and to the TD in the manage hub. Pure presentation over
// computeTournamentStats.

import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import {
  computeTournamentStats,
  formatDurationMs,
  winPctLabel,
} from "../../../../utils/tournament.stats";

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

export const StatsView = ({ matches }: { matches: LiveMatch[] }) => {
  const stats = useMemo(() => computeTournamentStats(matches), [matches]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Progress */}
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
          <View style={[styles.barFill, { width: `${stats.percentComplete}%` }]} />
        </View>
      </View>

      {/* Timing */}
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

      {/* Highlights */}
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

      {/* W/L leaderboard */}
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
  stat: {
    width: "25%",
    paddingVertical: webSc(SPACING.xs),
    gap: webSc(2),
  },
  statValue: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
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
});
