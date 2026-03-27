// app/(tabs)/admin/bar-owner-analytics.tsx

import { moderateScale, scale } from "../../../src/utils/scaling";
import { useRouter } from "expo-router";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useBarOwnerAnalytics } from "../../../src/viewmodels/useBarOwnerAnalytics";
import { Dropdown } from "../../../src/views/components/common/dropdown";
import { AnimatedBar } from "../../../src/views/components/dashboard/AnimatedBar";

const isWeb = Platform.OS === "web";

export default function BarOwnerAnalyticsScreen() {
  const router = useRouter();
  const vm = useBarOwnerAnalytics();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing}
          onRefresh={vm.onRefresh}
          tintColor={COLORS.primary}/>
          )
        }
    >
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>{"\uD83D\uDCCA"} VENUE ANALYTICS</Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>
          Performance across your venues
        </Text>
      </View>

      {/* Time Period Filter */}
      <View style={styles.filterSection}>
        <Text allowFontScaling={false} style={styles.filterLabel}>Period</Text>
        <View style={styles.filterDropdown}>
          <Dropdown
            options={vm.timePeriodOptions}
            value={vm.timePeriod.value}
            onSelect={vm.handleTimePeriodChange}
            placeholder="Select Period"
          />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>Overview</Text>
      </View>
      <View style={styles.statsGrid}>
        <MiniStatCard icon={"\uD83D\uDC41\uFE0F"} value={vm.summaryStats.totalViews} label="Views" />
        <MiniStatCard icon={"\uD83D\uDDFA\uFE0F"} value={vm.summaryStats.totalDirections} label="Directions" />
        <MiniStatCard icon={"\uD83D\uDCDE"} value={vm.summaryStats.totalCalls} label="Venue Calls" />
        <MiniStatCard icon={"\u2764\uFE0F"} value={vm.summaryStats.totalFavorites} label="Favorites" />
        <MiniStatCard icon={"\uD83D\uDCE4"} value={vm.summaryStats.totalShares} label="Shares" />
        <MiniStatCard icon={"\uD83D\uDCC8"} value={vm.summaryStats.totalEvents} label="Total Events" />
      </View>

      {vm.eventBreakdown.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>Event Breakdown</Text>
          </View>
          <View style={styles.card}>
            {vm.eventBreakdown.map((item, index) => {
              const maxVal = Math.max(...vm.eventBreakdown.map((e) => e.value));
              const barWidth = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
              return (
                <View key={item.label} style={styles.barRow}>
                  <Text allowFontScaling={false} style={styles.barLabel}>{item.label}</Text>
                  <AnimatedBar widthPercent={barWidth} color={item.color} delay={index * 80} />
                  <Text allowFontScaling={false} style={styles.barValue}>{item.value}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>Top Viewed Tournaments</Text>
      </View>
      {vm.topViewedTournaments.length > 0 ? (
        <View style={styles.card}>
          {vm.topViewedTournaments.map((item, index) => (
            <View
              key={item.entity_id}
              style={[
                styles.rankRow,
                index < vm.topViewedTournaments.length - 1 && styles.rankRowBorder,
              ]}
            >
              <Text allowFontScaling={false} style={styles.rankNumber}>#{index + 1}</Text>
              <Text allowFontScaling={false} style={styles.rankName} numberOfLines={1}>{item.name}</Text>
              <Text allowFontScaling={false} style={styles.rankCount}>{item.count} views</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.emptyText}>No view data yet</Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>Top Favorited Tournaments</Text>
      </View>
      {vm.topFavoritedTournaments.length > 0 ? (
        <View style={styles.card}>
          {vm.topFavoritedTournaments.map((item, index) => (
            <View
              key={item.entity_id}
              style={[
                styles.rankRow,
                index < vm.topFavoritedTournaments.length - 1 && styles.rankRowBorder,
              ]}
            >
              <Text allowFontScaling={false} style={styles.rankNumber}>#{index + 1}</Text>
              <Text allowFontScaling={false} style={styles.rankName} numberOfLines={1}>{item.name}</Text>
              <Text allowFontScaling={false} style={styles.rankCount}>{item.count} {"\u2764\uFE0F"}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.emptyText}>No favorite data yet</Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>Views by Period</Text>
      </View>
      <View style={styles.card}>
        <PeriodRow label="Today" value={vm.rawStats.tournamentViews.today} />
        <PeriodRow label="This Week" value={vm.rawStats.tournamentViews.thisWeek} />
        <PeriodRow label="This Month" value={vm.rawStats.tournamentViews.thisMonth} />
        <PeriodRow label="All Time" value={vm.rawStats.tournamentViews.total} isLast />
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

interface MiniStatCardProps {
  icon: string;
  value: number;
  label: string;
}

const MiniStatCard = ({ icon, value, label }: MiniStatCardProps) => (
  <View style={styles.miniCard}>
    <Text allowFontScaling={false} style={styles.miniIcon}>{icon}</Text>
    <Text allowFontScaling={false} style={styles.miniValue}>{value.toLocaleString()}</Text>
    <Text allowFontScaling={false} style={styles.miniLabel}>{label}</Text>
  </View>
);

interface PeriodRowProps {
  label: string;
  value: number;
  isLast?: boolean;
}

const PeriodRow = ({ label, value, isLast }: PeriodRowProps) => (
  <View style={[styles.periodRow, !isLast && styles.periodRowBorder]}>
    <Text allowFontScaling={false} style={styles.periodLabel}>{label}</Text>
    <Text allowFontScaling={false} style={styles.periodValue}>{value.toLocaleString()}</Text>
  </View>
);

const styles = StyleSheet.create({
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  loadingText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: {
    paddingTop: SPACING.lg,
  },
  backBtn: {
    position: "absolute",
    left: SPACING.md,
    top: SPACING.xl + SPACING.lg,
    zIndex: 1,
  },
  backText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  filterSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  filterLabel: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  filterDropdown: {
    flex: 1,
    maxWidth: scale(160),
    marginLeft: SPACING.md,
  },
  sectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    paddingTop: SPACING.xs,
  },
  miniCard: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    padding: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: scale(80),
  },
  miniIcon: {
    fontSize: moderateScale(20),
    marginBottom: scale(2),
  },
  miniValue: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  miniLabel: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: scale(2),
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  barLabel: {
    width: scale(80),
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  barTrack: {
    flex: 1,
    height: scale(8),
    backgroundColor: COLORS.border,
    borderRadius: scale(4),
    marginHorizontal: SPACING.sm,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: scale(4),
  },
  barValue: {
    width: scale(40),
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  rankRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rankNumber: {
    width: scale(30),
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.primary,
  },
  rankName: {
    flex: 1,
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  rankCount: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginLeft: SPACING.sm,
  },
  periodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  periodRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  periodLabel: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  periodValue: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  emptyText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});


