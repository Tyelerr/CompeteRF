// src/views/components/tournament/live/SummaryView.tsx
// Event recap for the Results phase: podium (top 3), key tournament numbers and a
// few event facts. Pure over the live match list (+ a little tournament metadata).

import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import {
  computeStandings,
  computeTournamentStats,
  formatDurationMs,
} from "../../../../utils/tournament.stats";

interface SummaryTournament {
  name?: string | null;
  tournament_format?: string | null;
  tournament_date?: string | null;
  venues?: { venue?: string | null } | null;
}

const prettify = (s: string | null | undefined): string =>
  (s ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ") || "—";

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

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

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text allowFontScaling={false} style={styles.rowLabel}>
      {label}
    </Text>
    <Text allowFontScaling={false} style={styles.rowValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const MEDAL = ["1st", "2nd", "3rd"];
const medalColor = (i: number): string =>
  i === 0 ? COLORS.warning : i === 1 ? COLORS.textSecondary : COLORS.secondary;

export const SummaryView = ({
  matches,
  tournament,
}: {
  matches: LiveMatch[];
  tournament?: SummaryTournament | null;
}) => {
  const stats = useMemo(() => computeTournamentStats(matches), [matches]);
  const standings = useMemo(() => computeStandings(matches), [matches]);
  // The champion only exists once the deciding final is played (place === 1).
  // Until then the standings array starts at whatever place has filled in so far
  // (e.g. 4th), so we must NOT treat standings[0] as the winner.
  const champion = useMemo(
    () => standings.find((s) => s.place === 1) ?? null,
    [standings],
  );
  const podium = champion ? standings.slice(0, 3) : [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Champion */}
      <View style={styles.champCard}>
        <Text allowFontScaling={false} style={styles.champLabel}>
          CHAMPION
        </Text>
        <Text allowFontScaling={false} style={styles.champName} numberOfLines={1}>
          {champion ? champion.name : "To be decided"}
        </Text>
      </View>

      {/* Podium */}
      {podium.length > 0 && (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>
            Podium
          </Text>
          {podium.map((p, i) => (
            <View key={p.key}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.podiumRow}>
                <View style={[styles.medal, { borderColor: medalColor(i) }]}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.medalText, { color: medalColor(i) }]}
                  >
                    {MEDAL[i]}
                  </Text>
                </View>
                <Text allowFontScaling={false} style={styles.podiumName} numberOfLines={1}>
                  {p.name}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Numbers */}
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          By the Numbers
        </Text>
        <View style={styles.grid}>
          <Stat
            label="Players"
            value={String(stats.leaders.length || standings.length)}
          />
          <Stat label="Matches" value={String(stats.matchesCompleted)} />
          <Stat label="Total racks" value={String(stats.totalRacks)} />
          <Stat label="Avg match" value={formatDurationMs(stats.avgMatchMs)} />
          <Stat label="Upsets" value={String(stats.upsets)} />
          <Stat label="Forfeits" value={String(stats.forfeits)} />
        </View>
      </View>

      {/* Event */}
      {tournament && (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>
            Event
          </Text>
          <Row label="Format" value={prettify(tournament.tournament_format)} />
          <Row label="Date" value={fmtDate(tournament.tournament_date)} />
          <Row label="Venue" value={tournament.venues?.venue ?? "—"} />
        </View>
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
  champCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    padding: webSc(SPACING.lg),
    alignItems: "center",
    marginBottom: webSc(SPACING.md),
  },
  champLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.warning,
    letterSpacing: 1.5,
  },
  champName: {
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "900",
    color: COLORS.text,
    marginTop: webSc(SPACING.xs),
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
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.xs) },
  podiumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
  },
  medal: {
    minWidth: webSc(46),
    alignItems: "center",
    paddingVertical: webSc(4),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
  },
  medalText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "900" },
  podiumName: { flex: 1, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "33.3%", paddingVertical: webSc(SPACING.sm), gap: webSc(2) },
  statValue: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
    gap: webSc(SPACING.md),
  },
  rowLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  rowValue: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text, flexShrink: 1 },
});
