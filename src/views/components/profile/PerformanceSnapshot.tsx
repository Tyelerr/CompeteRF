// src/views/components/profile/PerformanceSnapshot.tsx
// Profile "Performance Snapshot": a dense, sports-app-style dashboard. Pill time
// filters, compact stat cards where the value is the hero (value → label →
// supporting text), small low-opacity corner icons, primary stats slightly
// larger. Responsive grid: 2 columns on mobile, 3–4 on wider screens.

import { ComponentProps, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
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

type IconName = ComponentProps<typeof Ionicons>["name"];

interface CardDef {
  icon: IconName;
  color: string;
  label: string;
  value: string;
  sub?: string;
  primary?: boolean;
}

const StatCard = ({ card, width }: { card: CardDef; width: number }) => (
  <View style={[styles.card, { width }]}>
    <Ionicons
      name={card.icon}
      size={webMs(14)}
      color={card.color}
      style={styles.cardIcon}
    />
    <Text
      allowFontScaling={false}
      style={[styles.value, card.primary && styles.valuePrimary]}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {card.value}
    </Text>
    <Text allowFontScaling={false} style={styles.label} numberOfLines={1}>
      {card.label}
    </Text>
    {card.sub ? (
      <Text allowFontScaling={false} style={styles.sub} numberOfLines={1}>
        {card.sub}
      </Text>
    ) : (
      <Text allowFontScaling={false} style={styles.sub}>
        {" "}
      </Text>
    )}
  </View>
);

export const PerformanceSnapshot = ({
  stats,
  period,
  onPeriod,
}: {
  stats: PlayerPerformance;
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
}) => {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const gap = webSc(SPACING.sm);
  const cols = width >= 700 ? 4 : width >= 480 ? 3 : 2;
  const cardWidth = width > 0 ? (width - gap * (cols - 1)) / cols : 0;

  const cards: CardDef[] = [
    {
      icon: "tennisball-outline",
      color: COLORS.primary,
      label: "Matches Played",
      value: String(stats.matchesPlayed),
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
      primary: true,
    },
    {
      icon: "podium-outline",
      color: COLORS.warning,
      label: "Avg Place",
      value: stats.avgPlacement != null ? stats.avgPlacement.toFixed(1) : "—",
    },
    {
      icon: "ribbon-outline",
      color: COLORS.warning,
      label: "Best Finish",
      value: stats.bestFinish != null ? ordinal(stats.bestFinish) : "—",
    },
    {
      icon: "ellipse-outline",
      color: COLORS.primary,
      label: "Most Played",
      value: stats.topGameType ?? "—",
    },
    {
      icon: "trophy-outline",
      color: COLORS.warning,
      label: "Wins",
      value: String(stats.tournamentWins),
      sub: stats.events > 0 ? `of ${stats.events}` : undefined,
    },
    {
      icon: "medal-outline",
      color: COLORS.success,
      label: "Top 3",
      value: String(stats.topThree),
      sub: stats.events > 0 ? `of ${stats.events}` : undefined,
    },
    {
      icon: "flame-outline",
      color: COLORS.error,
      label: "Streak",
      value: stats.streakType ? `${stats.streakType}${stats.streakCount}` : "—",
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

      <View style={[styles.grid, { gap }]} onLayout={onLayout}>
        {cardWidth > 0 &&
          cards.map((c) => <StatCard key={c.label} card={c} width={cardWidth} />)}
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
  periodWrap: { width: webSc(132) },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
  },
  cardIcon: {
    position: "absolute",
    top: webSc(SPACING.sm),
    right: webSc(SPACING.sm),
    opacity: 0.4,
  },
  value: {
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  valuePrimary: { fontSize: webMs(FONT_SIZES.xxl) },
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
