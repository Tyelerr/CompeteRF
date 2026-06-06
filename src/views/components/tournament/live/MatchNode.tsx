// src/views/components/tournament/live/MatchNode.tsx
// Bracket node — a compact sibling of MatchCard so the two views share one visual
// language: same rounded corners, name (race), winner highlight, timer styling
// (red over time), green pulsing dot when live, LIVE badge + red border only for
// an actively-streamed live match, result tags, and the bye display. Tapping
// opens the shared match action modal.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { formatClock, LiveMatch } from "../../../../utils/match.utils";
import { LiveDot } from "./LiveDot";
import { useMatchTimer } from "./useMatchTimer";

export const NODE_WIDTH = 184;
export const NODE_HEIGHT = 104;

export const MatchNode = ({
  match,
  highlighted,
  onPress,
}: {
  match: LiveMatch;
  highlighted?: boolean;
  onPress: (m: LiveMatch) => void;
}) => {
  const m = match;
  const running = m.status === "in_progress";
  const { elapsedSeconds, isOvertime } = useMatchTimer(
    m.startedAt,
    m.allowedSeconds,
    running,
    m.completedAt,
  );

  const bottom = m.bye
    ? "Advances (bye)"
    : running
      ? formatClock(elapsedSeconds)
      : m.status === "completed"
        ? "Final"
        : "Not started";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(m)}
      style={[
        styles.node,
        running && styles.nodeLive,
        m.isLiveActive && styles.nodeStream,
        highlighted && styles.nodeHighlight,
      ]}
    >
      <View style={styles.top}>
        <Text allowFontScaling={false} style={styles.num}>
          M{m.matchNumber}
          {!m.bye ? `  ${m.raceLabel}` : ""}
        </Text>
        <View style={styles.topRight}>
          {m.isLiveActive && (
            <View style={styles.liveBadge}>
              <Text allowFontScaling={false} style={styles.liveBadgeText}>
                LIVE
              </Text>
            </View>
          )}
          {running && <LiveDot size={7} />}
        </View>
      </View>

      {m.bye ? (
        <Text allowFontScaling={false} style={styles.byeName} numberOfLines={1}>
          {m.p1Name ?? m.p2Name ?? "TBD"}
        </Text>
      ) : (
        <>
          <PlayerLine name={m.p1Name} race={m.p1Race} won={m.winner === 1} lost={m.winner === 2} />
          <PlayerLine name={m.p2Name} race={m.p2Race} won={m.winner === 2} lost={m.winner === 1} />
        </>
      )}

      <View style={styles.bottom}>
        <Text
          allowFontScaling={false}
          style={[
            styles.meta,
            running && styles.timer,
            running && isOvertime && styles.timerOver,
            m.status === "completed" && styles.metaDone,
          ]}
          numberOfLines={1}
        >
          {bottom}
        </Text>
        {m.result && m.result !== "normal" && (
          <Text allowFontScaling={false} style={styles.resultTag}>
            {m.result}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const PlayerLine = ({
  name,
  race,
  won,
  lost,
}: {
  name: string | null;
  race: number | null;
  won: boolean;
  lost: boolean;
}) => (
  <Text
    allowFontScaling={false}
    style={[styles.name, won && styles.won, lost && styles.lost]}
    numberOfLines={1}
  >
    {name ?? "TBD"}
    {race != null ? ` (${race})` : ""}
    {won ? "  ✓" : ""}
  </Text>
);

const styles = StyleSheet.create({
  node: {
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    justifyContent: "space-between",
  },
  nodeLive: { backgroundColor: "#16241B" },
  nodeStream: { borderColor: COLORS.error, borderWidth: 2 },
  nodeHighlight: { borderColor: COLORS.primary, borderWidth: 2 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  num: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.primary, flex: 1 },
  liveBadge: {
    backgroundColor: COLORS.error,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.xs),
    paddingVertical: 1,
  },
  liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  name: { fontSize: webMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "700" },
  won: { color: COLORS.success, fontWeight: "800" },
  lost: { color: COLORS.textMuted },
  byeName: { fontSize: webMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "700" },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "600" },
  metaDone: { color: COLORS.success, fontWeight: "700" },
  timer: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.text,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timerOver: { color: COLORS.error },
  resultTag: {
    fontSize: 9,
    color: COLORS.warning,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
