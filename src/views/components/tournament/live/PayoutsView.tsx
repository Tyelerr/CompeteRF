// src/views/components/tournament/live/PayoutsView.tsx
// Read-only payouts for the Results phase: the entry prize pool (and any side
// pots) split per place, with the entry-pool places mapped to the player who
// finished there from the final standings. Pure over the saved prize-pool config,
// the derived pools and the live match list.

import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import { PrizePoolConfig } from "../../../../models/types/tournament-settings.types";
import { computeBreakdown, sidePotPayoutViews } from "../../../../utils/prize-pool";
import { computeStandings } from "../../../../utils/tournament.stats";

const money = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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

export const PayoutsView = ({
  matches,
  config,
  entryPool,
  sidePotPools,
  sidePotEntrants,
}: {
  matches: LiveMatch[];
  config: PrizePoolConfig | null;
  entryPool: number;
  sidePotPools: Record<string, number>;
  // Side pot name -> standings keys (r<registrationId>) of the players who entered.
  sidePotEntrants?: Record<string, string[]>;
}) => {
  const standings = useMemo(() => computeStandings(matches), [matches]);
  // Side pots pay the BEST-finishing entrants, which isn't known until the event
  // is over (a champion exists). Before that, leave side-pot winners blank so we
  // don't award a pot to whoever happens to sit atop the partial standings.
  const finished = useMemo(
    () => standings.some((s) => s.place === 1),
    [standings],
  );
  const nameAtPlace = (place: number): string => {
    const at = standings.filter((s) => s.place === place);
    return at.length ? at.map((s) => s.name).join(", ") : "—";
  };

  const entry = useMemo(
    () => (config ? computeBreakdown(entryPool, config.entryPlaces) : null),
    [config, entryPool],
  );

  if (!config) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.empty}>
            No prize pool configured for this tournament.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Entry prize pool */}
      <View style={styles.card}>
        <View style={styles.head}>
          <Text allowFontScaling={false} style={styles.cardTitle}>
            Prize Pool
          </Text>
          <Text allowFontScaling={false} style={styles.poolTotal}>
            {money(entry?.pool ?? 0)}
          </Text>
        </View>
        {entry?.places.map((pl, i) => (
          <View key={pl.place}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.row}>
              <View style={styles.placeChip}>
                <Text allowFontScaling={false} style={styles.placeText}>
                  {ordinal(pl.place)}
                </Text>
              </View>
              <Text allowFontScaling={false} style={styles.payName} numberOfLines={1}>
                {nameAtPlace(pl.place)}
              </Text>
              <Text allowFontScaling={false} style={styles.payAmount}>
                {money(pl.amount)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Side pots — only the players who ENTERED the pot are eligible, ordered by
          their overall finish, so a higher-placing non-entrant is skipped and the
          money falls to the next entrant. */}
      {sidePotPayoutViews(config, sidePotPools).map((sp) => {
        const entered = new Set(sidePotEntrants?.[sp.name] ?? []);
        const finishers = standings.filter((s) => entered.has(s.key));
        return (
          <View key={sp.name} style={styles.card}>
            <View style={styles.head}>
              <Text allowFontScaling={false} style={styles.cardTitle} numberOfLines={1}>
                {sp.name}
              </Text>
              <Text allowFontScaling={false} style={styles.poolTotal}>
                {money(sp.pool)}
              </Text>
            </View>
            {sp.places.map((pl, i) => {
              const winner = finished ? finishers[i] : undefined;
              return (
                <View key={pl.place}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={styles.placeChip}>
                      <Text allowFontScaling={false} style={styles.placeText}>
                        {ordinal(pl.place)}
                      </Text>
                    </View>
                    <Text allowFontScaling={false} style={styles.payName} numberOfLines={1}>
                      {winner ? winner.name : "—"}
                    </Text>
                    <Text allowFontScaling={false} style={styles.payAmount}>
                      {money(pl.amount)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.xl * 2),
    ...Platform.select({
      web: { maxWidth: 760, width: "100%" as any, alignSelf: "center" as any },
    }),
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.sm),
  },
  cardTitle: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text, flexShrink: 1 },
  poolTotal: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "900",
    color: COLORS.success,
    fontVariant: ["tabular-nums"],
  },
  empty: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.xs) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
  },
  placeChip: {
    minWidth: webSc(40),
    alignItems: "center",
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(4),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "900", color: COLORS.textSecondary },
  payName: { flex: 1, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  payAmount: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
});
