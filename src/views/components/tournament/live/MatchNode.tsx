// src/views/components/tournament/live/MatchNode.tsx
// Bracket node — a compact MatchCard. Shares the card's visual language: rounded
// corners, name (race) per player with a small score box, a timer line (red over
// time), green pulsing dot when live, LIVE badge + red border only for an
// actively-streamed match, result tags, and the bye display. Tap opens the modal.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { formatClock, LiveMatch } from "../../../../utils/match.utils";
import { LiveDot } from "./LiveDot";
import { useMatchTimer } from "./useMatchTimer";

export const NODE_WIDTH = 204;
export const NODE_HEIGHT = 124;

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

  const timerText =
    m.status === "scheduled"
      ? "Not started"
      : running
        ? formatClock(elapsedSeconds)
        : m.startedAt
          ? `Final ${formatClock(elapsedSeconds)}`
          : "Completed";
  const timerStyle = [
    styles.timer,
    m.status === "scheduled" && styles.timerIdle,
    running && isOvertime && styles.timerOver,
    m.status === "completed" && styles.timerDone,
  ];

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
        <Text allowFontScaling={false} style={styles.num} numberOfLines={1}>
          M{m.matchNumber}
          {!m.bye ? `  ${m.raceLabel}` : ""}
          {m.tableLabel ? `  ·  ${m.tableLabel}` : ""}
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

      <View style={styles.players}>
        <PlayerRow
          name={m.p1Name}
          race={m.p1Race}
          score={m.p1Score}
          dash={m.bye}
          won={m.winner === 1}
          lost={m.winner === 2}
        />
        <PlayerRow
          name={m.bye ? "Bye" : m.p2Name}
          race={m.bye ? null : m.p2Race}
          score={m.p2Score}
          dash={m.bye}
          won={m.winner === 2}
          lost={m.winner === 1}
        />
      </View>

      <View style={styles.bottom}>
        <Text
          allowFontScaling={false}
          style={m.bye ? [styles.timer, styles.timerIdle] : timerStyle}
          numberOfLines={1}
        >
          {m.bye ? "Advances (bye)" : timerText}
        </Text>
        {!m.bye && m.result && m.result !== "normal" && (
          <Text allowFontScaling={false} style={styles.resultTag}>
            {m.result}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const PlayerRow = ({
  name,
  race,
  score,
  dash,
  won,
  lost,
}: {
  name: string | null;
  race: number | null;
  score: number | null;
  dash?: boolean;
  won: boolean;
  lost: boolean;
}) => (
  <View style={styles.playerRow}>
    <Text
      allowFontScaling={false}
      style={[styles.name, won && styles.won, lost && styles.lost]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {name ?? "TBD"}
      {race != null ? ` (${race})` : ""}
      {won ? "  ✓" : ""}
    </Text>
    <View style={[styles.scoreBox, won && styles.scoreBoxWon]}>
      <Text allowFontScaling={false} style={[styles.scoreNum, won && styles.scoreNumWon]}>
        {dash ? "–" : (score ?? 0)}
      </Text>
    </View>
  </View>
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
  players: { gap: webSc(SPACING.xs) },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.xs),
  },
  name: { fontSize: webMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "700", flex: 1 },
  won: { color: COLORS.success, fontWeight: "800" },
  lost: { color: COLORS.textMuted },
  scoreBox: {
    minWidth: webSc(30),
    paddingHorizontal: webSc(SPACING.xs),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  scoreBoxWon: { borderColor: COLORS.success },
  scoreNum: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "900",
    color: COLORS.primary,
    fontVariant: ["tabular-nums"],
  },
  scoreNumWon: { color: COLORS.success },
  byeName: { fontSize: webMs(FONT_SIZES.md), color: COLORS.textSecondary, fontWeight: "600" },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timer: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.text,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timerIdle: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "600" },
  timerOver: { color: COLORS.error },
  timerDone: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "700" },
  resultTag: {
    fontSize: 9,
    color: COLORS.warning,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
