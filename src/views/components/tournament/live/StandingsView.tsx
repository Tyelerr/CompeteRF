// src/views/components/tournament/live/StandingsView.tsx
// Final standings for a completed tournament — each player's placement derived
// from the bracket (computeStandings). Top three get a medal-tinted place chip;
// players knocked out in the same round share a place range (e.g. 5-6th).

import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import { computeStandings } from "../../../../utils/tournament.stats";

const placeColor = (place: number): string =>
  place === 1
    ? COLORS.warning
    : place === 2
      ? COLORS.textSecondary
      : place === 3
        ? COLORS.secondary
        : COLORS.border;

export const StandingsView = ({ matches }: { matches: LiveMatch[] }) => {
  const standings = useMemo(() => computeStandings(matches), [matches]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text allowFontScaling={false} style={styles.title}>
        Final Standings
      </Text>
      {standings.length === 0 ? (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.empty}>
            Standings appear here as matches finish.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {standings.map((s, i) => {
            const medal = s.place <= 3;
            const color = placeColor(s.place);
            return (
              <View key={s.key}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View
                    style={[
                      styles.placeChip,
                      medal && { borderColor: color, backgroundColor: color + "1A" },
                    ]}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[styles.placeText, medal && { color }]}
                      numberOfLines={1}
                    >
                      {s.placeLabel}
                    </Text>
                  </View>
                  <Text
                    allowFontScaling={false}
                    style={[styles.name, medal && styles.nameMedal]}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                  <View style={styles.fargoPill}>
                    <Text allowFontScaling={false} style={styles.fargoLabel}>
                      FARGO
                    </Text>
                    <Text allowFontScaling={false} style={styles.fargoVal}>
                      {s.fargo != null ? s.fargo : "—"}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
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
  title: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
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
    minWidth: webSc(52),
    alignItems: "center",
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(4),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  placeText: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  name: { flex: 1, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text },
  nameMedal: { fontWeight: "800" },
  fargoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(4),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(3),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fargoLabel: { fontSize: webMs(9), fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5 },
  fargoVal: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
});
