import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GiveawayStats } from "../../../models/types/giveaway.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { Platform } from "react-native";
const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

interface GiveawayStatsCardProps {
  stats: GiveawayStats;
}

export function GiveawayStatsCard({ stats }: GiveawayStatsCardProps) {
  const formatValue = (value: number): string => {
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k+`;
    return `$${value}+`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.icon}>🎁</Text>
        <Text allowFontScaling={false} style={styles.title}>GIVEAWAY STATS</Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{stats.completedCount}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{formatValue(stats.totalValueGiven)}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Given Away</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{stats.activeCount}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Active</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.surface, borderRadius: wxSc(12), padding: wxSc(SPACING.md), marginBottom: wxSc(SPACING.md), borderWidth: 1, borderColor: COLORS.border },
  header: { flexDirection: "row", alignItems: "center", marginBottom: wxSc(SPACING.md) },
  icon: { fontSize: wxMs(20), marginRight: wxSc(SPACING.xs) },
  title: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.textSecondary, letterSpacing: 1 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: wxMs(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  statLabel: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted },
  divider: { width: 1, height: 40, backgroundColor: COLORS.border },
});
