// src/views/components/tournament/live/PayoutSummary.tsx
// Read-only spectator Payout Summary card (sticky on wide web, stacked on mobile).
// Pure presentation over the authoritative payout values derived in
// useTournamentSpectator (same shared prize-pool helpers the admin uses). No math here.

import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";

const money = (n: number | null): string =>
  n == null
    ? "—"
    : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export interface PayoutSummaryData {
  players: number;
  entryPool: number; // entry contribution (net of fees), WITHOUT added money
  addedMoney: number; // included added money
  totalPrizePool: number; // entryPool + addedMoney
  paidPlaces: number;
  topPrize: number | null;
  sidePots: { name: string; entrants: number; pool: number }[];
}

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
    <Text allowFontScaling={false} style={styles.rowLabel}>
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

export const PayoutSummary = ({ data }: { data: PayoutSummaryData }) => (
  <>
    <View style={styles.card}>
      <Text allowFontScaling={false} style={styles.title}>
        Payout Summary
      </Text>
      <Row label="Players" value={String(data.players)} />
      <Row label="Entry Pool" value={money(data.entryPool)} />
      <Row label="Added Money" value={money(data.addedMoney)} />
      <View style={styles.divider} />
      <Row label="Total Prize Pool" value={money(data.totalPrizePool)} strong />
      <Row label="Paid Places" value={String(data.paidPlaces)} />
      <Row label="Top Prize" value={money(data.topPrize)} />
    </View>

    {data.sidePots.length > 0 && (
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.title}>
          Side Pots
        </Text>
        {data.sidePots.map((sp, i) => (
          <View key={sp.name}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.spRow}>
              <Text allowFontScaling={false} style={styles.spName} numberOfLines={1}>
                {sp.name}
              </Text>
              <Text allowFontScaling={false} style={styles.spPool}>
                {money(sp.pool)}
              </Text>
            </View>
            <Text allowFontScaling={false} style={styles.spMeta}>
              {`${sp.entrants} entrant${sp.entrants === 1 ? "" : "s"}`}
            </Text>
          </View>
        ))}
      </View>
    )}
  </>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  title: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
  },
  rowLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  rowValue: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  rowValueStrong: { color: COLORS.success, fontSize: webMs(FONT_SIZES.md), fontWeight: "900" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.xs) },
  spRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: webSc(SPACING.xs),
  },
  spName: { flex: 1, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  spPool: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.success,
    fontVariant: ["tabular-nums"],
  },
  spMeta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: webSc(1) },
});
