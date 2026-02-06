import { useRouter } from "expo-router";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useAnalyticsDashboard } from "../../../src/viewmodels/useAnalyticsDashboard";
import { Dropdown } from "../../../src/views/components/common/dropdown";

export default function AnalyticsScreen() {
  const router = useRouter();
  const vm = useAnalyticsDashboard();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={vm.refreshing}
          onRefresh={vm.onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 ANALYTICS</Text>
        <Text style={styles.headerSubtitle}>App-wide event tracking</Text>
      </View>

      {/* Time Period Filter */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Period</Text>
        <View style={styles.filterDropdown}>
          <Dropdown
            options={vm.timePeriodOptions}
            value={vm.timePeriod.value}
            onSelect={vm.handleTimePeriodChange}
            placeholder="Select Period"
          />
        </View>
      </View>

      {/* ── Summary Stats Grid ───────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Overview</Text>
      </View>
      <View style={styles.statsGrid}>
        <MiniStatCard
          icon="👁️"
          value={vm.summaryStats.totalViews}
          label="Views"
        />
        <MiniStatCard
          icon="🗺️"
          value={vm.summaryStats.totalDirections}
          label="Directions"
        />
        <MiniStatCard
          icon="📞"
          value={vm.summaryStats.totalCalls}
          label="Venue Calls"
        />
        <MiniStatCard
          icon="❤️"
          value={vm.summaryStats.totalFavorites}
          label="Favorites"
        />
        <MiniStatCard
          icon="📤"
          value={vm.summaryStats.totalShares}
          label="Shares"
        />
        <MiniStatCard
          icon="🔍"
          value={vm.summaryStats.totalSearches}
          label="Searches"
        />
        <MiniStatCard
          icon="🎁"
          value={vm.summaryStats.totalGiveawayViews}
          label="Giveaway Views"
        />
        <MiniStatCard
          icon="📱"
          value={vm.summaryStats.totalAppOpens}
          label="App Opens"
        />
        <MiniStatCard
          icon="📈"
          value={vm.summaryStats.totalEvents}
          label="Total Events"
          highlight
        />
      </View>

      {/* ── Event Breakdown ──────────────────────────────────────── */}
      {vm.eventBreakdown.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Event Breakdown</Text>
          </View>
          <View style={styles.card}>
            {vm.eventBreakdown.map((item, index) => {
              const maxVal = Math.max(...vm.eventBreakdown.map((e) => e.value));
              const barWidth = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
              return (
                <View key={item.label} style={styles.barRow}>
                  <Text style={styles.barLabel}>{item.label}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${barWidth}%`, backgroundColor: item.color },
                      ]}
                    />
                  </View>
                  <Text style={styles.barValue}>{item.value}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Top Viewed Tournaments ───────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Top Viewed Tournaments</Text>
      </View>
      {vm.topViewedTournaments.length > 0 ? (
        <View style={styles.card}>
          {vm.topViewedTournaments.map((item, index) => (
            <View
              key={item.entity_id}
              style={[
                styles.rankRow,
                index < vm.topViewedTournaments.length - 1 &&
                  styles.rankRowBorder,
              ]}
            >
              <Text style={styles.rankNumber}>#{index + 1}</Text>
              <Text style={styles.rankName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rankCount}>{item.count} views</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No view data yet</Text>
        </View>
      )}

      {/* ── Top Favorited Tournaments ────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Top Favorited Tournaments</Text>
      </View>
      {vm.topFavoritedTournaments.length > 0 ? (
        <View style={styles.card}>
          {vm.topFavoritedTournaments.map((item, index) => (
            <View
              key={item.entity_id}
              style={[
                styles.rankRow,
                index < vm.topFavoritedTournaments.length - 1 &&
                  styles.rankRowBorder,
              ]}
            >
              <Text style={styles.rankNumber}>#{index + 1}</Text>
              <Text style={styles.rankName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rankCount}>{item.count} ❤️</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No favorite data yet</Text>
        </View>
      )}

      {/* ── Period Comparison (Detail Stats) ─────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Views by Period</Text>
      </View>
      <View style={styles.card}>
        <PeriodRow label="Today" value={vm.rawStats.tournamentViews.today} />
        <PeriodRow
          label="This Week"
          value={vm.rawStats.tournamentViews.thisWeek}
        />
        <PeriodRow
          label="This Month"
          value={vm.rawStats.tournamentViews.thisMonth}
        />
        <PeriodRow
          label="All Time"
          value={vm.rawStats.tournamentViews.total}
          isLast
        />
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ============================================
// SUB-COMPONENTS (View-only, no logic)
// ============================================

interface MiniStatCardProps {
  icon: string;
  value: number;
  label: string;
  highlight?: boolean;
}

const MiniStatCard = ({ icon, value, label, highlight }: MiniStatCardProps) => (
  <View style={[styles.miniCard, highlight && styles.miniCardHighlight]}>
    <Text style={styles.miniIcon}>{icon}</Text>
    <Text style={[styles.miniValue, highlight && styles.miniValueHighlight]}>
      {value.toLocaleString()}
    </Text>
    <Text style={styles.miniLabel}>{label}</Text>
  </View>
);

interface PeriodRowProps {
  label: string;
  value: number;
  isLast?: boolean;
}

const PeriodRow = ({ label, value, isLast }: PeriodRowProps) => (
  <View style={[styles.periodRow, !isLast && styles.periodRowBorder]}>
    <Text style={styles.periodLabel}>{label}</Text>
    <Text style={styles.periodValue}>{value.toLocaleString()}</Text>
  </View>
);

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: {
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
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },

  // Header
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    position: "absolute",
    left: SPACING.md,
    top: SPACING.xl + SPACING.lg,
    zIndex: 1,
  },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },

  // Filter
  filterSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  filterLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  filterDropdown: {
    flex: 1,
    maxWidth: 160,
    marginLeft: SPACING.md,
  },

  // Section
  sectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },

  // Stats grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    paddingTop: SPACING.xs,
  },

  // Mini stat cards
  miniCard: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 80,
  },
  miniCardHighlight: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  miniIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  miniValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  miniValueHighlight: {
    color: COLORS.primary,
  },
  miniLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Card container
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Bar chart rows
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  barLabel: {
    width: 80,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    marginHorizontal: SPACING.sm,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  barValue: {
    width: 40,
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },

  // Rank rows (top tournaments)
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
    width: 30,
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.primary,
  },
  rankName: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  rankCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginLeft: SPACING.sm,
  },

  // Period rows
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
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  periodValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },

  // Empty state
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },

  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
