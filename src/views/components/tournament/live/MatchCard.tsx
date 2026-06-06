// src/views/components/tournament/live/MatchCard.tsx
// One match rendered as a clean card for the Matches "Card View". Shows the two
// players + race, a live per-match timer (red when over the allowed time), a
// green pulsing dot when in progress, and a red outline + LIVE label when the
// assigned table is a stream table. Actions (Start / End / Reopen) are inline.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { formatClock, LiveMatch } from "../../../../utils/match.utils";
import { LiveDot } from "./LiveDot";
import { useMatchTimer } from "./useMatchTimer";

export const MatchCard = ({
  match,
  onStart,
  onEnd,
  onReopen,
  busy,
}: {
  match: LiveMatch;
  onStart: (m: LiveMatch) => void;
  onEnd: (m: LiveMatch) => void;
  onReopen: (m: LiveMatch) => void;
  busy?: boolean;
}) => {
  const running = match.status === "in_progress";
  const { elapsedSeconds, isOvertime } = useMatchTimer(
    match.startedAt,
    match.allowedSeconds,
    running,
  );

  const winnerName =
    match.winner === 1 ? match.p1Name : match.winner === 2 ? match.p2Name : null;

  return (
    <View
      style={[
        styles.card,
        match.isStream && styles.cardStream,
        running && styles.cardLive,
      ]}
    >
      {/* Header: match # + table on the left, status badges on the right */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text allowFontScaling={false} style={styles.matchNum}>
            M{match.matchNumber}
          </Text>
          {match.tableLabel && (
            <Text allowFontScaling={false} style={styles.tableLabel} numberOfLines={1}>
              {match.tableLabel}
            </Text>
          )}
        </View>
        <View style={styles.badges}>
          {match.isStream && (
            <View style={styles.liveBadge}>
              <Text allowFontScaling={false} style={styles.liveBadgeText}>
                LIVE
              </Text>
            </View>
          )}
          {running && <LiveDot />}
        </View>
      </View>

      {/* Players */}
      {match.bye ? (
        <Text allowFontScaling={false} style={styles.byeText}>
          {match.p1Name ?? match.p2Name ?? "TBD"} advances (bye)
        </Text>
      ) : (
        <View style={styles.playersBlock}>
          <PlayerRow
            name={match.p1Name}
            race={match.p1Race}
            won={match.winner === 1}
            lost={match.winner === 2}
          />
          <Text allowFontScaling={false} style={styles.vs}>
            vs
          </Text>
          <PlayerRow
            name={match.p2Name}
            race={match.p2Race}
            won={match.winner === 2}
            lost={match.winner === 1}
          />
          <Text allowFontScaling={false} style={styles.race}>
            {match.raceLabel}
          </Text>
        </View>
      )}

      {/* Timer / status line */}
      {!match.bye && (
        <View style={styles.statusRow}>
          {match.status === "scheduled" && (
            <Text allowFontScaling={false} style={styles.statusMuted}>
              Not started
            </Text>
          )}
          {running && (
            <Text
              allowFontScaling={false}
              style={[styles.timer, isOvertime && styles.timerOver]}
            >
              {formatClock(elapsedSeconds)}
              {isOvertime ? "  • OVER" : ""}
            </Text>
          )}
          {match.status === "completed" && (
            <Text allowFontScaling={false} style={styles.statusDone}>
              Final{winnerName ? ` · ${winnerName} won` : ""}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      {!match.bye && (
        <View style={styles.actions}>
          {match.status === "scheduled" && (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              onPress={() => onStart(match)}
              disabled={busy}
            >
              <Text allowFontScaling={false} style={styles.btnPrimaryText}>
                Start Match
              </Text>
            </TouchableOpacity>
          )}
          {running && (
            <TouchableOpacity
              style={[styles.btn, styles.btnEnd, busy && styles.btnDisabled]}
              onPress={() => onEnd(match)}
              disabled={busy}
            >
              <Text allowFontScaling={false} style={styles.btnEndText}>
                End Match
              </Text>
            </TouchableOpacity>
          )}
          {match.status === "completed" && (
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost, busy && styles.btnDisabled]}
              onPress={() => onReopen(match)}
              disabled={busy}
            >
              <Text allowFontScaling={false} style={styles.btnGhostText}>
                Reopen
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const PlayerRow = ({
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
  <View style={styles.playerRow}>
    <Text
      allowFontScaling={false}
      style={[styles.playerName, won && styles.playerWon, lost && styles.playerLost]}
      numberOfLines={1}
    >
      {name ?? "TBD"}
      {won ? "  ✓" : ""}
    </Text>
    {race != null && (
      <Text allowFontScaling={false} style={styles.playerRace}>
        to {race}
      </Text>
    )}
  </View>
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
  cardStream: { borderColor: COLORS.error, borderWidth: 2 },
  cardLive: { backgroundColor: "#16241B" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.sm),
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), flex: 1 },
  matchNum: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.primary,
  },
  tableLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    flexShrink: 1,
  },
  badges: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  liveBadge: {
    backgroundColor: COLORS.error,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
  },
  liveBadgeText: {
    color: "#fff",
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  byeText: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    fontWeight: "600",
    paddingVertical: webSc(SPACING.sm),
  },
  playersBlock: { gap: webSc(SPACING.xs) },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerName: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
  },
  playerWon: { color: COLORS.success },
  playerLost: { color: COLORS.textMuted },
  playerRace: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginLeft: webSc(SPACING.sm),
  },
  vs: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  race: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.xs),
  },
  statusRow: {
    marginTop: webSc(SPACING.sm),
    flexDirection: "row",
    alignItems: "center",
  },
  statusMuted: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted },
  statusDone: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.success,
    fontWeight: "700",
  },
  timer: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  timerOver: { color: COLORS.error },
  actions: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.md),
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
  btnEnd: { backgroundColor: COLORS.success },
  btnEndText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },
  btnGhost: { borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: {
    color: COLORS.textSecondary,
    fontWeight: "700",
    fontSize: webMs(FONT_SIZES.sm),
  },
});
