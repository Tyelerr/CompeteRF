// src/views/components/tournament/live/MatchHistoryView.tsx
// Read-only log of every completed match in the event, in the order they finished.
// Winner highlighted, score shown, forfeit / withdraw flagged. Pure over the live
// match list.

import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";

const resultTag = (r: LiveMatch["result"]): string =>
  r === "forfeit" ? "Forfeit" : r === "withdraw" ? "Withdraw" : "";

export const MatchHistoryView = ({ matches }: { matches: LiveMatch[] }) => {
  const log = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            !m.bye &&
            !m.empty &&
            m.status === "completed" &&
            (m.winner === 1 || m.winner === 2),
        )
        .sort((a, b) => {
          const ta = a.completedAt ? Date.parse(a.completedAt) : 0;
          const tb = b.completedAt ? Date.parse(b.completedAt) : 0;
          return ta - tb;
        }),
    [matches],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text allowFontScaling={false} style={styles.title}>
        Match History ({log.length})
      </Text>
      {log.length === 0 ? (
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.empty}>
            Completed matches appear here.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {log.map((m, i) => {
            const p1Won = m.winner === 1;
            const tag = resultTag(m.result);
            return (
              <View key={m.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={styles.main}>
                    <Text allowFontScaling={false} style={styles.round} numberOfLines={1}>
                      {m.label}
                      {tag ? ` · ${tag}` : ""}
                    </Text>
                    <View style={styles.line}>
                      <Text
                        allowFontScaling={false}
                        style={[styles.name, p1Won && styles.nameWon]}
                        numberOfLines={1}
                      >
                        {p1Won ? "▸ " : ""}
                        {m.p1Name ?? "TBD"}
                      </Text>
                      <Text allowFontScaling={false} style={styles.score}>
                        {m.p1Score ?? 0}
                      </Text>
                    </View>
                    <View style={styles.line}>
                      <Text
                        allowFontScaling={false}
                        style={[styles.name, !p1Won && styles.nameWon]}
                        numberOfLines={1}
                      >
                        {!p1Won ? "▸ " : ""}
                        {m.p2Name ?? "TBD"}
                      </Text>
                      <Text allowFontScaling={false} style={styles.score}>
                        {m.p2Score ?? 0}
                      </Text>
                    </View>
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
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.sm) },
  row: { flexDirection: "row", alignItems: "center" },
  main: { flex: 1, gap: webSc(2) },
  round: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "700",
    marginBottom: webSc(2),
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
  },
  name: { flex: 1, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.textSecondary },
  nameWon: { color: COLORS.success, fontWeight: "800" },
  score: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
    minWidth: webSc(22),
    textAlign: "right",
  },
});
