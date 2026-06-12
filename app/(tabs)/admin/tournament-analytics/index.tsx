// app/(tabs)/admin/tournament-analytics/index.tsx
// Tournament Analytics list: every tournament series (recurring template or
// one-off) the owner runs, with quick attendance + money stats, plus name search
// and sort. Tap a row to open its detail.

import { moderateScale, scale } from "../../../../src/utils/scaling";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useVenueAnalytics } from "../../../../src/viewmodels/useVenueAnalytics";
import { TournamentSeriesStats } from "../../../../src/models/types/venue-analytics.types";
import { groupIntoSeries } from "../../../../src/utils/venue-analytics";
import { Dropdown } from "../../../../src/views/components/common/dropdown";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

const money = (n: number): string =>
  `$${Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

type SortKey = "attendance" | "revenue" | "prize" | "recent" | "name";
const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Sort: Attendance", value: "attendance" },
  { label: "Sort: Revenue", value: "revenue" },
  { label: "Sort: Prize Pool", value: "prize" },
  { label: "Sort: Most Recent", value: "recent" },
  { label: "Sort: A–Z", value: "name" },
];

type StatusFilter = "all" | "active" | "completed" | "cancelled" | "archived";
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Archived", value: "archived" },
];

const sortSeries = (
  list: TournamentSeriesStats[],
  key: SortKey,
): TournamentSeriesStats[] => {
  const arr = [...list];
  switch (key) {
    case "revenue":
      return arr.sort((a, b) => b.entryCollected - a.entryCollected);
    case "prize":
      return arr.sort((a, b) => b.netPrizePool - a.netPrizePool);
    case "recent":
      return arr.sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || ""));
    case "name":
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case "attendance":
    default:
      return arr.sort((a, b) => b.totalPlayers - a.totalPlayers);
  }
};

export default function TournamentAnalyticsScreen() {
  const router = useRouter();
  const vm = useVenueAnalytics();

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("attendance");
  const [status, setStatus] = useState<StatusFilter>("all");

  const series = useMemo(() => {
    // Status filter applies to the underlying runs, then we re-group: a series'
    // stats reflect only the runs in the chosen status.
    const runs =
      status === "all"
        ? vm.runs
        : vm.runs.filter((r) => r.status === status);
    const grouped = groupIntoSeries(runs);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? grouped.filter((s) => s.name.toLowerCase().includes(q))
      : grouped;
    return sortSeries(filtered, sortKey);
  }, [vm.runs, status, query, sortKey]);

  const openDetail = (item: TournamentSeriesStats) =>
    router.push({
      pathname: "/(tabs)/admin/tournament-analytics/[id]",
      params: { id: item.seriesId, name: item.name },
    } as any);

  return (
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
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
          TOURNAMENT ANALYTICS
        </Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>
          Performance by tournament
        </Text>
      </View>

      {/* Period */}
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

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text allowFontScaling={false} style={styles.searchIcon}>
          {"🔍"}
        </Text>
        <TextInput
          allowFontScaling={false}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search tournaments..."
          placeholderTextColor={COLORS.textMuted}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Text allowFontScaling={false} style={styles.searchClear}>
              {"✕"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Status + Sort, one row under the search */}
      <View style={styles.controlsRow}>
        <View style={styles.controlCol}>
          <Dropdown
            options={STATUS_OPTIONS}
            value={status}
            onSelect={(v) => setStatus(v as StatusFilter)}
            placeholder="Status"
          />
        </View>
        <View style={styles.controlCol}>
          <Dropdown
            options={SORT_OPTIONS}
            value={sortKey}
            onSelect={(v) => setSortKey(v as SortKey)}
            placeholder="Sort"
          />
        </View>
      </View>

      {vm.loading ? (
        <Text allowFontScaling={false} style={styles.loadingText}>
          Loading...
        </Text>
      ) : series.length === 0 ? (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.emptyText}>
            {query
              ? "No tournaments match your search."
              : "No tournaments with players in this period yet. Stats appear once tournaments are run on Compete."}
          </Text>
        </View>
      ) : (
        series.map((item) => (
          <TouchableOpacity
            key={item.seriesId}
            style={styles.card}
            onPress={() => openDetail(item)}
            activeOpacity={0.8}
          >
            <View style={styles.cardTop}>
              <Text allowFontScaling={false} style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text allowFontScaling={false} style={styles.cardChevron}>
                {"›"}
              </Text>
            </View>
            <Text allowFontScaling={false} style={styles.cardMeta}>
              <Text style={styles.cardMetaStrong}>{item.avgAttendance}</Text> avg
              players {"·"}{" "}
              <Text style={styles.cardMetaStrong}>{item.events}</Text>{" "}
              {item.events === 1 ? "event" : "events"}
            </Text>
            <View style={styles.cardStatsRow}>
              <View style={styles.cardStat}>
                <Text allowFontScaling={false} style={styles.cardStatValue}>
                  {money(item.entryCollected)}
                </Text>
                <Text allowFontScaling={false} style={styles.cardStatLabel}>
                  Entry Fees
                </Text>
              </View>
              <View style={styles.cardStatDivider} />
              <View style={styles.cardStat}>
                <Text allowFontScaling={false} style={styles.cardStatValue}>
                  {money(item.netPrizePool)}
                </Text>
                <Text allowFontScaling={false} style={styles.cardStatLabel}>
                  Prize Pool
                </Text>
              </View>
            </View>
            <Text allowFontScaling={false} style={styles.cardLargest}>
              Largest event: {item.largestAttendance} players
            </Text>
          </TouchableOpacity>
        ))
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any },
    }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
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
    fontSize: wxMs(FONT_SIZES.lg),
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
    paddingTop: SPACING.sm,
  },
  filterLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  filterDropdown: { flex: 1, maxWidth: wxSc(180), marginLeft: SPACING.md },
  // Search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(8),
    borderWidth: 1,
    borderColor: COLORS.border,
    height: wxSc(40),
  },
  searchIcon: { fontSize: wxMs(14), marginRight: SPACING.sm, opacity: 0.6 },
  searchInput: { flex: 1, fontSize: wxMs(FONT_SIZES.sm), color: COLORS.text },
  searchClear: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textMuted,
    paddingHorizontal: SPACING.xs,
  },
  // Status + Sort dropdown row
  controlsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    zIndex: 10,
  },
  controlCol: { flex: 1 },
  loadingText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    textAlign: "center",
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(12),
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardName: {
    flex: 1,
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  cardChevron: {
    fontSize: wxMs(FONT_SIZES.xl),
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  cardMeta: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: wxSc(2),
  },
  cardMetaStrong: { color: COLORS.text, fontWeight: "700" },
  cardLargest: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  cardStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: wxSc(8),
    paddingVertical: SPACING.sm,
  },
  cardStat: { flex: 1, alignItems: "center" },
  cardStatValue: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.primary,
  },
  cardStatLabel: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: wxSc(2),
  },
  cardStatDivider: { width: 1, height: wxSc(28), backgroundColor: COLORS.border },
  emptyText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  bottomSpacer: { height: SPACING.xl * 2 },
});
