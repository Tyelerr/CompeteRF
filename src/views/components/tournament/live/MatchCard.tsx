// src/views/components/tournament/live/MatchCard.tsx
// A compact, dashboard-style live match card. Big player names, prominent timer
// (always shown; red when over time), compact race, live + stream indicators,
// status-based primary actions, and an overflow menu for everything else.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import {
  formatClock,
  LiveMatch,
  MatchActionStep,
} from "../../../../utils/match.utils";
import { LiveDot } from "./LiveDot";
import { useMatchTimer } from "./useMatchTimer";

// Built at runtime so no raw emoji lives in source (toolchain-safe).
const GLYPH = { cam: String.fromCodePoint(0x1f4f9) };

export const MatchCard = ({
  match,
  onAction,
  busy,
}: {
  match: LiveMatch;
  onAction: (m: LiveMatch, step: MatchActionStep) => void;
  busy?: boolean;
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
          ? formatClock(elapsedSeconds)
          : "Completed";
  const timerStyle = [
    styles.timer,
    m.status === "scheduled" && styles.timerIdle,
    running && isOvertime && styles.timerOver,
    m.status === "completed" && styles.timerDone,
  ];

  return (
    <View
      style={[
        styles.card,
        running && styles.cardLive,
        m.isLiveActive && styles.cardStream,
      ]}
    >
      {/* Top meta row */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text allowFontScaling={false} style={styles.matchNum}>
            M{m.matchNumber}
          </Text>
          <Text allowFontScaling={false} style={styles.race}>
            {m.raceLabel}
          </Text>
          {m.tableLabel && (
            <Text allowFontScaling={false} style={styles.table} numberOfLines={1}>
              · {m.tableLabel}
            </Text>
          )}
        </View>
        <View style={styles.topRight}>
          {m.isLiveActive && (
            <View style={styles.liveBadge}>
              <Text allowFontScaling={false} style={styles.liveBadgeText}>
                {GLYPH.cam} LIVE
              </Text>
            </View>
          )}
          {running && <LiveDot />}
        </View>
      </View>

      {/* Players (name + race) with a Fargo-style score box each */}
      {m.bye ? (
        <Text allowFontScaling={false} style={styles.bye}>
          {m.p1Name ?? m.p2Name ?? "TBD"} advances (bye)
        </Text>
      ) : (
        <>
          <View style={styles.players}>
            <PlayerRow
              name={m.p1Name}
              race={m.p1Race}
              score={m.p1Score}
              won={m.winner === 1}
              lost={m.winner === 2}
            />
            <PlayerRow
              name={m.p2Name}
              race={m.p2Race}
              score={m.p2Score}
              won={m.winner === 2}
              lost={m.winner === 1}
            />
          </View>
          <View style={styles.timerRow}>
            <Text allowFontScaling={false} style={timerStyle}>
              {timerText}
            </Text>
            {m.result && m.result !== "normal" && (
              <Text allowFontScaling={false} style={styles.resultTag}>
                {m.result}
              </Text>
            )}
          </View>
        </>
      )}

      {/* Actions */}
      {!m.bye && (
        <View style={styles.actions}>
          {m.status === "scheduled" && (
            <>
              <Btn label="Start Match" primary onPress={() => onAction(m, "table")} busy={busy} />
              <Btn label="Assign Table" onPress={() => onAction(m, "table")} busy={busy} />
            </>
          )}
          {running && (
            <>
              <Btn label="End Match" primary onPress={() => onAction(m, "winner")} busy={busy} />
              <Btn label="Edit Score" onPress={() => onAction(m, "score")} busy={busy} />
            </>
          )}
          {m.status === "completed" && (
            <>
              <Btn label="View Details" primary onPress={() => onAction(m, "details")} busy={busy} />
              <Btn label="Reopen" onPress={() => onAction(m, "menu")} busy={busy} />
            </>
          )}
          <TouchableOpacity
            style={styles.overflow}
            onPress={() => onAction(m, "menu")}
            disabled={busy}
            hitSlop={6}
          >
            <Text allowFontScaling={false} style={styles.overflowText}>
              ⋯
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const PlayerRow = ({
  name,
  race,
  score,
  won,
  lost,
}: {
  name: string | null;
  race: number | null;
  score: number | null;
  won: boolean;
  lost: boolean;
}) => (
  <View style={styles.playerRow}>
    <Text
      allowFontScaling={false}
      style={[styles.name, won && styles.nameWon, lost && styles.nameLost]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {name ?? "TBD"}
      {race != null ? ` (${race})` : ""}
      {won ? "  ✓" : ""}
    </Text>
    <View style={[styles.scoreBox, won && styles.scoreBoxWon]}>
      <Text
        allowFontScaling={false}
        style={[styles.scoreNum, won && styles.scoreNumWon]}
      >
        {score ?? 0}
      </Text>
    </View>
  </View>
);

const Btn = ({
  label,
  onPress,
  primary,
  busy,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
}) => (
  <TouchableOpacity
    style={[styles.btn, primary ? styles.btnPrimary : styles.btnGhost, busy && styles.btnDisabled]}
    onPress={onPress}
    disabled={busy}
  >
    <Text allowFontScaling={false} style={primary ? styles.btnPrimaryText : styles.btnGhostText}>
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  cardLive: { backgroundColor: "#16241B" },
  cardStream: { borderColor: COLORS.error, borderWidth: 2 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topLeft: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs), flex: 1 },
  matchNum: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.primary },
  race: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700" },
  table: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, flexShrink: 1 },
  topRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  liveBadge: {
    backgroundColor: COLORS.error,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.xs),
    paddingVertical: 1,
  },
  liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  bye: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    fontWeight: "600",
    paddingVertical: webSc(SPACING.sm),
  },
  players: {
    marginTop: webSc(SPACING.sm),
    gap: webSc(SPACING.sm),
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
  },
  name: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    flex: 1,
  },
  nameWon: { color: COLORS.success },
  nameLost: { color: COLORS.textMuted },
  scoreBox: {
    minWidth: webSc(46),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBoxWon: { borderColor: COLORS.success },
  scoreNum: {
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.primary,
    fontVariant: ["tabular-nums"],
  },
  scoreNumWon: { color: COLORS.success },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: webSc(SPACING.md),
  },
  timer: {
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  timerIdle: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, fontWeight: "600" },
  timerOver: { color: COLORS.error },
  timerDone: { fontSize: webMs(FONT_SIZES.md), color: COLORS.success },
  resultTag: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.warning,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.sm),
  },
  btn: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },
  btnGhost: { borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.textSecondary, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },
  overflow: {
    width: webSc(38),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  overflowText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900" },
});
