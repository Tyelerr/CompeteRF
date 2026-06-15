// src/views/components/profile/ProfileMatchCenter.tsx
// Profile "Match Center" card. When the player is in a live tournament it shows
// the match that matters right now — the one they're playing, or the next one
// they're scheduled into — with opponent, table, race, round and (while playing)
// the live score + a race-progress bar. Tapping opens the tournament/bracket.

import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { PlayerLiveMatch } from "../../../viewmodels/hooks/use.player.live.match";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

interface ProfileMatchCenterProps {
  data: PlayerLiveMatch;
  onPress: () => void;
  // When provided and the match is live, score steppers render under each player.
  onAdjustScore?: (slot: 1 | 2, delta: number) => void;
  busy?: boolean;
}

// "You lead 3-2" / "Carlo leads 3-2" / "Tied 2-2"
const scoreLine = (
  isPlaying: boolean,
  myScore: number,
  oppScore: number,
  opponentName: string | null,
): string => {
  if (!isPlaying && myScore === 0 && oppScore === 0) return "";
  const hi = Math.max(myScore, oppScore);
  const lo = Math.min(myScore, oppScore);
  if (myScore === oppScore) return `Tied ${myScore}-${oppScore}`;
  if (myScore > oppScore) return `You lead ${hi}-${lo}`;
  const opp = (opponentName ?? "Opponent").split(" ")[0];
  return `${opp} leads ${hi}-${lo}`;
};

const Avatar = ({
  label,
  mine,
  score,
  onMinus,
  onPlus,
  busy,
}: {
  label: string;
  mine?: boolean;
  score?: number;
  onMinus?: () => void;
  onPlus?: () => void;
  busy?: boolean;
}) => (
  <View style={styles.player}>
    <View style={[styles.avatar, mine && styles.avatarMine]}>
      <Ionicons
        name="person"
        size={wxMs(20)}
        color={mine ? COLORS.primary : COLORS.textSecondary}
      />
    </View>
    <Text allowFontScaling={false} style={styles.playerName} numberOfLines={1}>
      {label}
    </Text>
    {onMinus && onPlus && (
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepBtn}
          activeOpacity={0.6}
          disabled={busy}
          onPress={onMinus}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
        >
          <Ionicons name="remove" size={wxMs(20)} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.stepScoreBox}>
          <Text allowFontScaling={false} style={styles.stepScore}>
            {score ?? 0}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.stepBtn}
          activeOpacity={0.6}
          disabled={busy}
          onPress={onPlus}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
        >
          <Ionicons name="add" size={wxMs(20)} color={COLORS.text} />
        </TouchableOpacity>
      </View>
    )}
  </View>
);

export const ProfileMatchCenter = ({
  data,
  onPress,
  onAdjustScore,
  busy,
}: ProfileMatchCenterProps) => {
  const { isPlaying, opponentName, myScore, oppScore, table, raceTo, roundLabel } =
    data;
  const editable = isPlaying && !!onAdjustScore;
  const oppSlot: 1 | 2 = data.mySlot === 1 ? 2 : 1;
  const score = scoreLine(isPlaying, myScore, oppScore, opponentName);
  const progress =
    raceTo && raceTo > 0
      ? Math.min(1, Math.max(myScore, oppScore) / raceTo)
      : 0;

  const meta = [
    table ?? "Table TBD",
    raceTo ? `Race to ${raceTo}` : null,
    roundLabel,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    // Plain View — the card itself is NOT tappable so rapid / slightly-off taps on
    // the score steppers can't accidentally open the bracket. Use the explicit
    // "View Bracket" button below.
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.dot, !isPlaying && styles.dotIdle]} />
          <Text allowFontScaling={false} style={styles.kicker}>
            {isPlaying ? "CURRENT MATCH" : "YOU PLAY NEXT"}
          </Text>
        </View>
        <Text allowFontScaling={false} style={styles.tourney} numberOfLines={1}>
          {data.tournamentName}
        </Text>
      </View>

      <View style={styles.matchup}>
        <Avatar
          label={data.myName ?? "You"}
          mine
          score={editable ? myScore : undefined}
          onMinus={editable ? () => onAdjustScore!(data.mySlot, -1) : undefined}
          onPlus={editable ? () => onAdjustScore!(data.mySlot, 1) : undefined}
          busy={busy}
        />
        <View style={styles.vsWrap}>
          <Text allowFontScaling={false} style={styles.vs}>
            VS
          </Text>
        </View>
        <Avatar
          label={opponentName ?? "TBD"}
          score={editable ? oppScore : undefined}
          onMinus={editable ? () => onAdjustScore!(oppSlot, -1) : undefined}
          onPlus={editable ? () => onAdjustScore!(oppSlot, 1) : undefined}
          busy={busy}
        />
      </View>

      <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
        {meta}
      </Text>

      {isPlaying && (
        <View style={styles.progressBlock}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          {!!score && (
            <Text allowFontScaling={false} style={styles.scoreText}>
              {score}
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity
        style={styles.footer}
        activeOpacity={0.6}
        onPress={onPress}
        hitSlop={{ top: 4, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="git-network-outline" size={wxMs(15)} color={COLORS.primary} />
        <Text allowFontScaling={false} style={styles.footerText}>
          View Bracket
        </Text>
        <Ionicons name="chevron-forward" size={wxMs(15)} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: wxSc(SPACING.md),
    marginTop: wxSc(SPACING.sm),
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.md),
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: wxSc(SPACING.sm),
  },
  headLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.xs),
    flexShrink: 0,
  },
  dot: {
    width: wxSc(8),
    height: wxSc(8),
    borderRadius: wxSc(4),
    backgroundColor: COLORS.error,
  },
  dotIdle: { backgroundColor: COLORS.warning },
  kicker: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.error,
    letterSpacing: 1,
  },
  tourney: {
    flex: 1,
    textAlign: "right",
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "700",
    color: COLORS.textSecondary,
  },

  matchup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: wxSc(SPACING.md),
    gap: wxSc(SPACING.sm),
  },
  player: { flex: 1, alignItems: "center", gap: wxSc(SPACING.xs) },
  avatar: {
    width: wxSc(48),
    height: wxSc(48),
    borderRadius: wxSc(24),
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMine: { borderColor: COLORS.primary },
  playerName: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
    maxWidth: "100%",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.xs),
    marginTop: wxSc(SPACING.xs),
  },
  stepBtn: {
    width: wxSc(36),
    height: wxSc(36),
    borderRadius: wxSc(10),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepScoreBox: { minWidth: wxSc(34), alignItems: "center" },
  stepScore: {
    fontSize: wxMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.text,
  },
  vsWrap: { flexShrink: 0, paddingHorizontal: wxSc(SPACING.xs) },
  vs: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },

  meta: {
    marginTop: wxSc(SPACING.md),
    textAlign: "center",
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.textSecondary,
  },

  progressBlock: { marginTop: wxSc(SPACING.sm), gap: wxSc(SPACING.xs) },
  track: {
    height: wxSc(6),
    borderRadius: wxSc(3),
    backgroundColor: COLORS.background,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: wxSc(3), backgroundColor: COLORS.primary },
  scoreText: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: wxSc(SPACING.xs),
    marginTop: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerText: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.primary,
  },
});
