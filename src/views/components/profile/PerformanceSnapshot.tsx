// src/views/components/profile/PerformanceSnapshot.tsx
// Profile "Performance Snapshot": time-filtered stat cards in a responsive grid
// (2 columns on mobile, more on wider screens). Dark-mode native. No Fargo stats.

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
}

const StatCard = ({
  card,
  width,
}: {
  card: CardDef;
  width: number;
}) => (
  <View style={[styles.card, { width }]}>
    <View style={[styles.cardIcon, { backgroundColor: card.color + "1F" }]}>
      <Ionicons name={card.icon} size={webMs(16)} color={card.color} />
    </View>
    <Text allowFontScaling={false} style={styles.cardValue} numberOfLines={1} adjustsFontSizeToFit>
      {card.value}
    </Text>
    <Text allowFontScaling={false} style={styles.cardLabel} numberOfLines={1}>
      {card.label}
    </Text>
    {card.sub ? (
      <Text allowFontScaling={false} style={styles.cardSub} numberOfLines={1}>
        {card.sub}
      </Text>
    ) : null}
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
  const cols = width >= 720 ? 4 : width >= 520 ? 3 : 2;
  const cardWidth = width > 0 ? (width - gap * (cols - 1)) / cols : 0;

  const cards: CardDef[] = [
    {
      icon: "tennisball-outline",
      color: COLORS.primary,
      label: "Matches Played",
      value: String(stats.matchesPlayed),
    },
    {
      icon: "stats-chart-outline",
      color: COLORS.success,
      label: "Win %",
      value: stats.winPct != null ? `${Math.round(stats.winPct)}%` : "—",
      sub:
        stats.matchesPlayed > 0
          ? `${stats.matchesWon}/${stats.matchesPlayed} matches`
          : undefined,
    },
    {
      icon: "podium-outline",
      color: COLORS.warning,
      label: "Avg Placement",
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
      label: "Tournament Wins",
      value: String(stats.tournamentWins),
      sub: stats.events > 0 ? `of ${stats.events} events` : undefined,
    },
    {
      icon: "medal-outline",
      color: COLORS.success,
      label: "Top 3 Finishes",
      value: String(stats.topThree),
      sub: stats.events > 0 ? `of ${stats.events} events` : undefined,
    },
    {
      icon: "flame-outline",
      color: COLORS.error,
      label: "Current Streak",
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
    marginBottom: webSc(SPACING.md),
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
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
  },
  cardIcon: {
    width: webSc(30),
    height: webSc(30),
    borderRadius: webSc(RADIUS.sm),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: webSc(SPACING.sm),
  },
  cardValue: {
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  cardLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "700",
    marginTop: webSc(2),
  },
  cardSub: {
    fontSize: webMs(9),
    color: COLORS.textMuted,
    fontWeight: "600",
    marginTop: webSc(2),
  },
});
