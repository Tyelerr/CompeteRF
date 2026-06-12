// app/(tabs)/admin/tournament-analytics/[id].tsx
// Tournament Analytics detail: lifetime attendance, money, fees, prize pool, and
// discovery for one tournament series (recurring template or one-off).

import { moderateScale, scale } from "../../../../src/utils/scaling";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useSeriesAnalytics } from "../../../../src/viewmodels/useSeriesAnalytics";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

const money = (n: number): string =>
  `$${Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function TournamentAnalyticsDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const vm = useSeriesAnalytics(params.id);
  const title = vm.series?.name || params.name || "Tournament";

  const s = vm.series;
  const d = vm.discovery;

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
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, isWeb && styles.backBtnWeb]}
        >
          <Text allowFontScaling={false} style={styles.backText}>
            {"←"} Back
          </Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>
          Lifetime performance
        </Text>
      </View>

      {vm.loading ? (
        <Text allowFontScaling={false} style={styles.loadingText}>
          Loading...
        </Text>
      ) : !s ? (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.emptyText}>
            No data for this tournament yet.
          </Text>
        </View>
      ) : (
        <>
          {/* Attendance */}
          <Section title="Attendance">
            <Row label="Total players" value={String(s.totalPlayers)} />
            <Row label="Average attendance" value={String(s.avgAttendance)} />
            <Row label="Largest attendance" value={String(s.largestAttendance)} />
            <Row label="Lowest attendance" value={String(s.lowestAttendance)} />
            <Row label="Events / runs" value={String(s.events)} />
          </Section>

          {/* Money */}
          <Section title="Money">
            <Row label="Entry fees collected" value={money(s.entryCollected)} />
            <Row label="Side pots collected" value={money(s.sidePotsCollected)} />
            <Row label="Added money" value={money(s.addedMoney)} />
            <Row
              label="Gross tournament money"
              value={money(s.entryCollected + s.sidePotsCollected + s.addedMoney)}
              strong
            />
          </Section>

          {/* Fees */}
          <Section title="Fees">
            <Row label="TD fees" value={money(s.feesByCategory.td)} />
            <Row label="Green fees" value={money(s.feesByCategory.green)} />
            <Row label="Admin fees" value={money(s.feesByCategory.admin)} />
            <Row label="Custom fees" value={money(s.feesByCategory.custom)} />
            <Row label="Total fees collected" value={money(s.totalFees)} strong />
          </Section>

          {/* Prize pool */}
          <Section title="Prize Pool">
            <Row label="Net prize pool" value={money(s.netPrizePool)} strong />
            <Row label="Prize money paid out" value={money(s.prizePaidOut)} />
            <Row label="Average prize pool" value={money(s.avgPrizePool)} />
            <Row label="Largest prize pool" value={money(s.largestPrizePool)} />
          </Section>

          {/* Discovery */}
          <Section title="Activity / Discovery">
            <Row label="Views" value={String(d.views)} />
            <Row label="Favorites" value={String(d.favorites)} />
            <Row label="Shares" value={String(d.shares)} />
            <Row label="Calls" value={String(d.calls)} />
            <Row label="Directions" value={String(d.directions)} />
          </Section>
        </>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <>
    <View style={styles.sectionHeader}>
      <Text allowFontScaling={false} style={styles.sectionTitle}>
        {title}
      </Text>
    </View>
    <View style={styles.card}>{children}</View>
  </>
);

const Row = ({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <View style={styles.row}>
    <Text
      allowFontScaling={false}
      style={[styles.rowLabel, strong && styles.rowLabelStrong]}
    >
      {label}
    </Text>
    <Text
      allowFontScaling={false}
      style={[styles.rowValue, strong && styles.rowValueStrong]}
    >
      {value}
    </Text>
  </View>
);

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
    textAlign: "center",
    paddingHorizontal: wxSc(48),
  },
  headerSubtitle: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  loadingText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    textAlign: "center",
    padding: SPACING.lg,
  },
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
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(12),
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: wxSc(5),
  },
  rowLabel: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  rowLabelStrong: { color: COLORS.text, fontWeight: "700" },
  rowValue: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
  },
  rowValueStrong: { color: COLORS.primary, fontWeight: "700" },
  emptyText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  bottomSpacer: { height: SPACING.xl * 2 },
});
