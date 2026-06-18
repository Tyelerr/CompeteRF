// src/views/components/tournament/live/MatchNode.tsx
// Bracket node — a compact MatchCard. Shares the card's visual language: rounded
// corners, name (race) per player with a small score box, a timer line (red over
// time), green pulsing dot when live, LIVE badge + red border only for an
// actively-streamed match, result tags, and the bye display. Tap opens the modal.

import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { formatClock, LiveMatch } from "../../../../utils/match.utils";
import { LiveDot } from "./LiveDot";

export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 138;

const MatchNodeBase = ({
  match,
  highlighted,
  mine,
  onPress,
}: {
  match: LiveMatch;
  highlighted?: boolean;
  // The viewer's own matches: "win" / "loss" border their card; "mine" is a
  // not-yet-decided match of theirs.
  mine?: "win" | "loss" | "mine" | null;
  onPress: (m: LiveMatch) => void;
}) => {
  const m = match;
  const running = m.status === "in_progress";
  const completed = m.status === "completed";
  // No per-node ticking timer (it lives in the match modal). Completed shows its
  // final elapsed time, computed once.
  const finalSeconds =
    m.startedAt && m.completedAt
      ? Math.max(0, (new Date(m.completedAt).getTime() - new Date(m.startedAt).getTime()) / 1000)
      : 0;
  const timerText =
    m.status === "scheduled"
      ? "Not started"
      : running
        ? "Live"
        : m.startedAt
          ? `Final ${formatClock(finalSeconds)}`
          : "Completed";
  const timerStyle = [
    styles.timer,
    m.status === "scheduled" && styles.timerIdle,
    running && styles.timerLive,
    m.status === "completed" && styles.timerDone,
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(m)}
      style={[
        styles.node,
        running && styles.nodeLive,
        completed && styles.nodeDone,
        m.isLiveActive && styles.nodeStream,
        highlighted && styles.nodeHighlight,
        mine === "mine" && styles.nodeMine,
        mine === "win" && styles.nodeMineWin,
        mine === "loss" && styles.nodeMineLoss,
      ]}
    >
      <View style={styles.top}>
        <Text allowFontScaling={false} style={styles.num} numberOfLines={1}>
          {m.label}
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
          result={m.result}
          won={m.winner === 1}
          lost={m.winner === 2}
        />
        <PlayerRow
          name={m.bye ? "Bye" : m.p2Name}
          race={m.bye ? null : m.p2Race}
          score={m.p2Score}
          dash={m.bye}
          result={m.result}
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
        <View style={styles.bottomRight}>
          {!m.bye && m.tableLabel && (
            <Text allowFontScaling={false} style={styles.tableTag} numberOfLines={1}>
              {m.tableLabel}
            </Text>
          )}
          {!m.bye && m.result && m.result !== "normal" && (
            <Text allowFontScaling={false} style={styles.resultTag}>
              {m.result}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Memoized so panning/zooming (and another node's timer tick) doesn't re-render
// every node.
export const MatchNode = memo(MatchNodeBase);

const scoreText = (
  score: number | null,
  dash: boolean | undefined,
  lost: boolean,
  result: "normal" | "forfeit" | "withdraw" | null,
): string => {
  if (dash) return "–";
  if (lost && result === "forfeit") return "FF";
  if (lost && result === "withdraw") return "WD";
  return String(score ?? 0);
};

const PlayerRow = ({
  name,
  race,
  score,
  dash,
  result,
  won,
  lost,
}: {
  name: string | null;
  race: number | null;
  score: number | null;
  dash?: boolean;
  result?: "normal" | "forfeit" | "withdraw" | null;
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
      <Text
        allowFontScaling={false}
        style={[styles.scoreNum, won && styles.scoreNumWon]}
        numberOfLines={1}
      >
        {scoreText(score, dash, lost, result ?? null)}
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
    borderColor: COLORS.borderLight,
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    justifyContent: "space-between",
  },
  nodeLive: { backgroundColor: "#16241B" },
  // Finished matches recede (winner stays green); the viewer's own matches keep a
  // colored border on top so their path is easy to follow.
  nodeDone: { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border },
  nodeStream: { borderColor: COLORS.error, borderWidth: 2 },
  nodeHighlight: { borderColor: COLORS.primary, borderWidth: 2 },
  nodeMine: { borderColor: COLORS.primary, borderWidth: 2 },
  nodeMineWin: { borderColor: COLORS.success, borderWidth: 2 },
  nodeMineLoss: { borderColor: COLORS.error, borderWidth: 2 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  num: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.primary, flex: 1 },
  liveBadge: {},
  liveBadgeText: {
    color: COLORS.error,
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    letterSpacing: 0.5,
  },
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
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.xs) },
  bottomRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs), flexShrink: 1 },
  tableTag: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "700",
    flexShrink: 1,
  },
  timer: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.text,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timerIdle: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "600" },
  timerLive: { color: COLORS.success },
  timerDone: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "700" },
  resultTag: {
    fontSize: 9,
    color: COLORS.warning,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
