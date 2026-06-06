// src/views/components/tournament/live/MatchNode.tsx
// Compact match node for the Bracket View. Same status language as MatchCard:
// per-match timer (red when over time), green pulsing dot when live, red outline
// + LIVE label for stream-table matches. Tapping opens the match's actions.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { formatClock, LiveMatch } from "../../../../utils/match.utils";
import { LiveDot } from "./LiveDot";
import { useMatchTimer } from "./useMatchTimer";

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 78;

export const MatchNode = ({
  match,
  onPress,
}: {
  match: LiveMatch;
  onPress: (m: LiveMatch) => void;
}) => {
  const running = match.status === "in_progress";
  const { elapsedSeconds, isOvertime } = useMatchTimer(
    match.startedAt,
    match.allowedSeconds,
    running,
  );

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(match)}
      style={[
        styles.node,
        match.isStream && styles.nodeStream,
        running && styles.nodeLive,
      ]}
    >
      <View style={styles.top}>
        <Text allowFontScaling={false} style={styles.num}>
          M{match.matchNumber}
        </Text>
        <View style={styles.topRight}>
          {match.isStream && (
            <View style={styles.liveBadge}>
              <Text allowFontScaling={false} style={styles.liveBadgeText}>
                LIVE
              </Text>
            </View>
          )}
          {running && <LiveDot size={7} />}
        </View>
      </View>

      <Text
        allowFontScaling={false}
        style={[styles.name, match.winner === 1 && styles.won]}
        numberOfLines={1}
      >
        {match.p1Name ?? (match.bye ? "—" : "TBD")}
      </Text>
      <Text
        allowFontScaling={false}
        style={[styles.name, match.winner === 2 && styles.won]}
        numberOfLines={1}
      >
        {match.bye ? "(bye)" : (match.p2Name ?? "TBD")}
      </Text>

      <View style={styles.bottom}>
        {running ? (
          <Text
            allowFontScaling={false}
            style={[styles.timer, isOvertime && styles.timerOver]}
          >
            {formatClock(elapsedSeconds)}
          </Text>
        ) : (
          <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
            {match.status === "completed"
              ? "Final"
              : match.tableLabel ?? match.raceLabel}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  node: {
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    justifyContent: "space-between",
  },
  nodeStream: { borderColor: COLORS.error, borderWidth: 2 },
  nodeLive: { backgroundColor: "#16241B" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  num: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.primary },
  liveBadge: {
    backgroundColor: COLORS.error,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.xs),
  },
  liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  name: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "600" },
  won: { color: COLORS.success, fontWeight: "800" },
  bottom: { flexDirection: "row", alignItems: "center" },
  timer: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  timerOver: { color: COLORS.error },
  meta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
});
