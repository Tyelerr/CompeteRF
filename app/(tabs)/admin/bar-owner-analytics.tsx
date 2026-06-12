// app/(tabs)/admin/bar-owner-analytics.tsx
// Bar-owner Venue Analytics. Business-first: attendance + tournament money flow
// up top, then a drill-down to per-tournament analytics, the money breakdown,
// top-tournament lists, and discovery/engagement metrics lower down.

import { moderateScale, scale } from "../../../src/utils/scaling";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
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
import { useVenueAnalytics } from "../../../src/viewmodels/useVenueAnalytics";
import { TournamentSeriesStats } from "../../../src/models/types/venue-analytics.types";
import { Dropdown } from "../../../src/views/components/common/dropdown";
import { AnimatedBar } from "../../../src/views/components/dashboard/AnimatedBar";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

const money = (n: number): string =>
  `$${Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const moneyShort = (n: number): string => {
  if (n >= 10000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

export default function BarOwnerAnalyticsScreen() {
  const router = useRouter();
  const vm = useVenueAnalytics();

  useFocusEffect(
    useCallback(() => {
      vm.onRefresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const s = vm.venueStats;
  const f = s.feesByCategory;

  const openDetail = (series: TournamentSeriesStats) =>
    router.push({
      pathname: "/(tabs)/admin/tournament-analytics/[id]",
      params: { id: series.seriesId, name: series.name },
    } as any);

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>
          Loading analytics...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        )
      }
    >
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, isWeb && styles.backBtnWeb]}
        >
          <Text allowFontScaling={false} style={styles.backText}>
            {"←"} Back
          </Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>
          {"📊"} VENUE ANALYTICS
        </Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>
          How your venue is doing overall
        </Text>
      </View>

      {/* 1. Period filter */}
      <View style={styles.filterSection}>
        <Text allowFontScaling={false} style={styles.filterLabel}>
          Period
        </Text>
        <View style={styles.filterDropdown}>
          <Dropdown
            options={vm.periodOptions}
            value={vm.period}
            onSelect={(v) => vm.setPeriod(v as typeof vm.period)}
            placeholder="Select Period"
          />
        </View>
      </View>

      {/* 2. Overview cards */}
      <SectionHeader title="Overview" />
      <View style={styles.statsGrid}>
        <StatCard icon={"👥"} value={s.totalPlayers.toLocaleString()} label="Total Players" />
        <StatCard icon={"📅"} value={String(s.totalEvents)} label="Total Events" />
        <StatCard icon={"📊"} value={String(s.avgAttendance)} label="Avg Attendance" />
        <StatCard icon={"🏆"} value={String(s.largestEvent)} label="Largest Event" />
        <StatCard icon={"💵"} value={moneyShort(s.entryCollected)} label="Entry Fees" />
        <StatCard icon={"🎱"} value={moneyShort(s.netPrizePool)} label="Prize Pools" />
      </View>

      {/* 3. Tournament Analytics drill-down */}
      <TouchableOpacity
        style={styles.drillCard}
        onPress={() => router.push("/(tabs)/admin/tournament-analytics" as any)}
        activeOpacity={0.85}
      >
        <View style={styles.drillTextWrap}>
          <Text allowFontScaling={false} style={styles.drillTitle}>
            Tournament Analytics {"→"}
          </Text>
          <Text allowFontScaling={false} style={styles.drillSub}>
            View performance by tournament
          </Text>
        </View>
        <Text allowFontScaling={false} style={styles.drillChevron}>
          {"›"}
        </Text>
      </TouchableOpacity>

      {/* 4. Money Overview */}
      <SectionHeader title="Money Overview" />
      <View style={styles.card}>
        <GroupLabel text="Gross Collected" />
        <MoneyRow label="Entry fees" value={money(s.entryCollected)} />
        <MoneyRow label="Side pots" value={money(s.sidePotsCollected)} />
        <MoneyRow label="Added money" value={money(s.addedMoney)} />

        <GroupLabel text="Fees / Deductions" />
        <MoneyRow label="TD fees" value={money(f.td)} />
        <MoneyRow label="Green fees" value={money(f.green)} />
        <MoneyRow label="Admin fees" value={money(f.admin)} />
        <MoneyRow label="Custom fees" value={money(f.custom)} />
        <MoneyRow label="Total fees" value={money(s.totalFees)} strong />

        <GroupLabel text="Net Payout" />
        <MoneyRow label="Net prize pool" value={money(s.netPrizePool)} strong />
        <MoneyRow label="Prize money paid out" value={money(s.prizePaidOut)} />
      </View>

      {/* 5-7. Top tournaments */}
      <TopList
        title="Top Attendance"
        series={vm.topAttendance}
        stat={(x) => `${x.totalPlayers} players`}
        onPress={openDetail}
      />
      <TopList
        title="Top Revenue"
        series={vm.topRevenue}
        stat={(x) => `${money(x.entryCollected)} entry`}
        onPress={openDetail}
      />
      <TopList
        title="Top Prize Pools"
        series={vm.topPrizePool}
        stat={(x) => `${money(x.netPrizePool)} pool`}
        onPress={openDetail}
      />

      {/* 8. Activity / Discovery */}
      <SectionHeader title="Activity Breakdown" />
      {vm.discoveryBreakdown.length > 0 ? (
        <View style={styles.card}>
          {vm.discoveryBreakdown.map((item, index) => {
            const maxVal = Math.max(...vm.discoveryBreakdown.map((e) => e.value));
            const barWidth = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
            return (
              <View key={item.label} style={styles.barRow}>
                <Text allowFontScaling={false} style={styles.barLabel}>
                  {item.label}
                </Text>
                <AnimatedBar widthPercent={barWidth} color={item.color} delay={index * 80} />
                <Text allowFontScaling={false} style={styles.barValue}>
                  {item.value}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.emptyText}>
            No engagement data for this period yet
          </Text>
        </View>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ── Building blocks ───────────────────────────────────────────────────────────
const SectionHeader = ({ title }: { title: string }) => (
  <View style={styles.sectionHeader}>
    <Text allowFontScaling={false} style={styles.sectionTitle}>
      {title}
    </Text>
  </View>
);

const StatCard = ({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string;
  label: string;
}) => (
  <View style={styles.miniCard}>
    <Text allowFontScaling={false} style={styles.miniIcon}>
      {icon}
    </Text>
    <Text allowFontScaling={false} style={styles.miniValue}>
      {value}
    </Text>
    <Text allowFontScaling={false} style={styles.miniLabel}>
      {label}
    </Text>
  </View>
);

const GroupLabel = ({ text }: { text: string }) => (
  <Text allowFontScaling={false} style={styles.groupLabel}>
    {text}
  </Text>
);

const MoneyRow = ({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <View style={styles.moneyRow}>
    <Text
      allowFontScaling={false}
      style={[styles.moneyLabel, strong && styles.moneyLabelStrong]}
    >
      {label}
    </Text>
    <Text
      allowFontScaling={false}
      style={[styles.moneyValue, strong && styles.moneyValueStrong]}
    >
      {value}
    </Text>
  </View>
);

const TopList = ({
  title,
  series,
  stat,
  onPress,
}: {
  title: string;
  series: TournamentSeriesStats[];
  stat: (s: TournamentSeriesStats) => string;
  onPress: (s: TournamentSeriesStats) => void;
}) => (
  <>
    <SectionHeader title={title} />
    {series.length > 0 ? (
      <View style={styles.card}>
        {series.map((item, index) => (
          <TouchableOpacity
            key={item.seriesId}
            style={[styles.rankRow, index < series.length - 1 && styles.rankRowBorder]}
            onPress={() => onPress(item)}
            activeOpacity={0.7}
          >
            <Text allowFontScaling={false} style={styles.rankNumber}>
              #{index + 1}
            </Text>
            <View style={styles.rankNameWrap}>
              <Text allowFontScaling={false} style={styles.rankName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text allowFontScaling={false} style={styles.rankSub}>
                {item.events} {item.events === 1 ? "event" : "events"} {"·"}{" "}
                {item.avgAttendance} avg
              </Text>
            </View>
            <Text allowFontScaling={false} style={styles.rankStat}>
              {stat(item)}
            </Text>
            <Text allowFontScaling={false} style={styles.rankChevron}>
              {"›"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    ) : (
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.emptyText}>
          No tournament data for this period yet
        </Text>
      </View>
    )}
  </>
);

const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any },
    }),
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
  loadingText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.textSecondary },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: { paddingTop: SPACING.lg },
  backBtn: {
    position: "absolute",
    left: SPACING.md,
    top: SPACING.xl + SPACING.lg,
    zIndex: 1,
  },
  backBtnWeb: { top: SPACING.lg },
  backText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: wxMs(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: wxMs(FONT_SIZES.sm),
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
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  filterDropdown: { flex: 1, maxWidth: wxSc(180), marginLeft: SPACING.md },
  sectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: wxMs(FONT_SIZES.md),
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
    width: "31%",
    flexGrow: 1,
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(12),
    padding: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: wxSc(86),
  },
  miniIcon: { fontSize: wxMs(20), marginBottom: wxSc(2) },
  miniValue: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
  },
  miniLabel: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: wxSc(2),
    textAlign: "center",
  },
  // Drill-down card
  drillCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary + "15",
    borderRadius: wxSc(12),
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  drillTextWrap: { flex: 1 },
  drillTitle: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.primary,
  },
  drillSub: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: wxSc(2),
  },
  drillChevron: { fontSize: wxMs(FONT_SIZES.xl), color: COLORS.primary },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(12),
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // Money rows
  groupLabel: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "700",
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: SPACING.sm,
    marginBottom: wxSc(2),
  },
  moneyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: wxSc(5),
  },
  moneyLabel: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  moneyLabelStrong: { color: COLORS.text, fontWeight: "700" },
  moneyValue: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
  },
  moneyValueStrong: { color: COLORS.primary, fontWeight: "700" },
  // Bars
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm },
  barLabel: {
    width: wxSc(80),
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  barValue: {
    width: wxSc(40),
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },
  // Rank rows
  rankRow: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.sm },
  rankRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rankNumber: {
    width: wxSc(28),
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.primary,
  },
  rankNameWrap: { flex: 1, marginRight: SPACING.sm },
  rankName: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
  },
  rankSub: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: wxSc(1),
  },
  rankStat: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
  },
  rankChevron: {
    fontSize: wxMs(FONT_SIZES.lg),
    color: COLORS.textMuted,
    marginLeft: SPACING.xs,
  },
  emptyText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  bottomSpacer: { height: SPACING.xl * 2 },
});
