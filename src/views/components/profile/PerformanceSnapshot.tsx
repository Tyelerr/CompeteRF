// src/views/components/profile/PerformanceSnapshot.tsx
// Profile "Performance Snapshot": a dense, sports-app dashboard. Each stat has a
// category accent (colored icon, soft glow, colored top border), the value is the
// hero, Matches/Win Rate are emphasized in a larger top row, subtle trend chips
// vs the previous period, and cards lift slightly when pressed. Period dropdown.

import { ComponentProps, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import {
  PERIODS,
  PeriodKey,
  PlayerPerformance,
} from "../../../utils/player.performance";
import { Dropdown } from "../common/dropdown";

// Category accents — theme tokens where they fit, plus gold / purple / emerald.
const GOLD = "#E8B931";
const PURPLE = "#A855F7";
const EMERALD = "#10B981";

const ordinal = (n: number): string => {
  const t = n % 100;
  const s =
    t >= 11 && t <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${s}`;
};

const monthYear = (d: string | null): string | undefined => {
  if (!d) return undefined;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? undefined
    : dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

type IconName = ComponentProps<typeof Ionicons>["name"];
type Trend = { dir: "up" | "down"; text: string } | undefined;

interface CardDef {
  icon: IconName;
  color: string;
  label: string;
  value: string;
  sub?: string;
  trend?: Trend;
  primary?: boolean;
}

const TrendChip = ({ trend }: { trend: NonNullable<Trend> }) => (
  <Text
    allowFontScaling={false}
    style={[
      styles.trend,
      { color: trend.dir === "up" ? COLORS.success : COLORS.error },
    ]}
  >
    {`${trend.dir === "up" ? "▲" : "▼"} ${trend.text}`}
  </Text>
);

const StatCard = ({ card, width }: { card: CardDef; width: number }) => (
  <Pressable
    style={({ pressed }) => [
      styles.card,
      card.primary && styles.cardPrimary,
      { width, borderTopColor: card.color },
      pressed && styles.cardPressed,
    ]}
  >
    <View style={styles.iconWrap}>
      <View style={[styles.glow, { backgroundColor: card.color + "26" }]} />
      <Ionicons name={card.icon} size={webMs(card.primary ? 15 : 14)} color={card.color} />
    </View>

    <View style={styles.valueRow}>
      <Text
        allowFontScaling={false}
        style={[styles.value, card.primary && styles.valuePrimary]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {card.value}
      </Text>
      {card.trend ? <TrendChip trend={card.trend} /> : null}
    </View>
    <Text allowFontScaling={false} style={styles.label} numberOfLines={1}>
      {card.label}
    </Text>
    <Text allowFontScaling={false} style={styles.sub} numberOfLines={1}>
      {card.sub ?? " "}
    </Text>
  </Pressable>
);

export const PerformanceSnapshot = ({
  stats,
  prev,
  period,
  onPeriod,
}: {
  stats: PlayerPerformance;
  prev: PlayerPerformance | null;
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
}) => {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const gap = webSc(SPACING.sm);
  const cols = width >= 700 ? 4 : width >= 480 ? 3 : 2;
  const cardWidth = width > 0 ? (width - gap * (cols - 1)) / cols : 0;
  const primaryWidth = width > 0 ? (width - gap) / 2 : 0;

  // Trend chips vs the previous window (skipped for All Time / no prior data).
  const countTrend = (cur: number, before: number | undefined): Trend => {
    if (before == null || before <= 0) return undefined;
    const d = cur - before;
    return d === 0 ? undefined : { dir: d > 0 ? "up" : "down", text: `${Math.abs(d)}` };
  };
  const pctTrend = (): Trend => {
    if (!prev || prev.winPct == null || stats.winPct == null) return undefined;
    const d = Math.round(stats.winPct) - Math.round(prev.winPct);
    return d === 0 ? undefined : { dir: d > 0 ? "up" : "down", text: `${Math.abs(d)}%` };
  };

  const primary: CardDef[] = [
    {
      icon: "tennisball-outline",
      color: COLORS.primary,
      label: "Matches Played",
      value: String(stats.matchesPlayed),
      sub: stats.eventsEntered > 0 ? `${stats.eventsEntered} events` : undefined,
      trend: countTrend(stats.matchesPlayed, prev?.matchesPlayed),
      primary: true,
    },
    {
      icon: "stats-chart-outline",
      color: COLORS.success,
      label: "Win Rate",
      value: stats.winPct != null ? `${Math.round(stats.winPct)}%` : "—",
      sub:
        stats.matchesPlayed > 0
          ? `${stats.matchesWon}W • ${stats.matchesPlayed - stats.matchesWon}L`
          : undefined,
      trend: pctTrend(),
      primary: true,
    },
  ];

  const streakColor =
    stats.streakType === "W"
      ? COLORS.success
      : stats.streakType === "L"
        ? COLORS.error
        : COLORS.textMuted;

  const secondary: CardDef[] = [
    {
      icon: "podium-outline",
      color: COLORS.warning,
      label: "Avg Place",
      value: stats.avgPlacement != null ? stats.avgPlacement.toFixed(1) : "—",
    },
    {
      icon: "ribbon-outline",
      color: GOLD,
      label: "Best Finish",
      value: stats.bestFinish != null ? ordinal(stats.bestFinish) : "—",
      sub: monthYear(stats.bestFinishDate),
    },
    {
      icon: "ellipse-outline",
      color: PURPLE,
      label: "Most Played",
      value: stats.topGameType ?? "—",
      sub:
        stats.topGameType && stats.eventsEntered > 0
          ? `${stats.topGameEvents} of ${stats.eventsEntered} events`
          : undefined,
    },
    {
      icon: "trophy-outline",
      color: GOLD,
      label: "Wins",
      value: String(stats.tournamentWins),
      sub: stats.events > 0 ? `of ${stats.events}` : undefined,
      trend: countTrend(stats.tournamentWins, prev?.tournamentWins),
    },
    {
      icon: "medal-outline",
      color: EMERALD,
      label: "Top 3",
      value: String(stats.topThree),
      sub: stats.events > 0 ? `of ${stats.events}` : undefined,
      trend: countTrend(stats.topThree, prev?.topThree),
    },
    {
      icon: "flame-outline",
      color: streakColor,
      label: "Streak",
      value: stats.streakType
        ? `${stats.streakType === "W" ? "Won" : "Lost"} ${stats.streakCount}`
        : "—",
    },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>
          Performance Snapshot
        </Text>
        <View style={styles.periodWrap}>
          <Dropdown
            compact
            options={PERIODS.map((p) => ({ label: p.label, value: p.key }))}
            value={period}
            onSelect={(v) => onPeriod(v as PeriodKey)}
          />
        </View>
      </View>

      <View onLayout={onLayout}>
        {primaryWidth > 0 && (
          <View style={[styles.row, { gap, marginBottom: gap }]}>
            {primary.map((c) => (
              <StatCard key={c.label} card={c} width={primaryWidth} />
            ))}
          </View>
        )}
        {cardWidth > 0 && (
          <View style={[styles.grid, { gap }]}>
            {secondary.map((c) => (
              <StatCard key={c.label} card={c} width={cardWidth} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginHorizontal: webSc(SPACING.md), marginTop: webSc(SPACING.lg) },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
  title: {
    flex: 1,
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  periodWrap: { width: webSc(112) },

  row: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 2,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  cardPrimary: { paddingVertical: webSc(SPACING.md) },
  cardPressed: {
    transform: [{ scale: 1.02 }],
    borderColor: COLORS.textMuted,
  },
  iconWrap: {
    position: "absolute",
    top: webSc(SPACING.sm),
    right: webSc(SPACING.sm),
    width: webSc(26),
    height: webSc(26),
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: webSc(26),
    height: webSc(26),
    borderRadius: webSc(13),
  },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: webSc(SPACING.xs) },
  value: {
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  valuePrimary: { fontSize: webMs(FONT_SIZES.xxxl) },
  trend: { fontSize: webMs(9), fontWeight: "900", marginBottom: webSc(3) },
  label: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "700",
    marginTop: webSc(2),
  },
  sub: {
    fontSize: webMs(9),
    color: COLORS.textMuted,
    fontWeight: "600",
    marginTop: webSc(1),
  },
});
