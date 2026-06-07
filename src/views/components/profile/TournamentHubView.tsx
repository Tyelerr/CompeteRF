// src/views/components/profile/TournamentHubView.tsx
// Profile "Tournament View" hub — shown when the player is in a live tournament.
// Focuses on the match that matters now (the player's current/next match) plus a
// read-only history of their completed matches in this event.
//
// While the current match is live, the match card shows +/- score steppers under
// each player; changes persist to the shared matchState so the bracket and every
// view reflect them. (The write currently needs tournament-update rights — a
// participant-scoped RPC is the production path for non-TD players.)

import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import {
  PlayerMatchResult,
  PlayerTournamentHub,
} from "../../../viewmodels/hooks/use.player.live.match";
import { ProfileMatchCenter } from "./ProfileMatchCenter";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

interface TournamentHubViewProps {
  hub: PlayerTournamentHub;
  onOpenTournament: (tournamentId: number) => void;
  // Adjust a side's score by +/-1 (only used while the match is live).
  onAdjustScore: (matchId: string, slot: 1 | 2, delta: number) => void;
  isScoring: boolean;
}

const resultNote = (r: PlayerMatchResult): string | null => {
  if (r.result === "forfeit") return "Forfeit";
  if (r.result === "withdraw") return "Withdrew";
  return null;
};

const HistoryRow = ({ r }: { r: PlayerMatchResult }) => {
  const note = resultNote(r);
  return (
    <View style={styles.histRow}>
      <View style={[styles.wl, r.won ? styles.wlWin : styles.wlLoss]}>
        <Text allowFontScaling={false} style={styles.wlText}>
          {r.won ? "W" : "L"}
        </Text>
      </View>
      <View style={styles.histMid}>
        <Text allowFontScaling={false} style={styles.histOpp} numberOfLines={1}>
          vs {r.opponentName ?? "—"}
        </Text>
        <Text allowFontScaling={false} style={styles.histRound} numberOfLines={1}>
          {r.roundLabel}
          {note ? `  ·  ${note}` : ""}
        </Text>
      </View>
      <Text allowFontScaling={false} style={styles.histScore}>
        {r.myScore}-{r.oppScore}
      </Text>
    </View>
  );
};

export const TournamentHubView = ({
  hub,
  onOpenTournament,
  onAdjustScore,
  isScoring,
}: TournamentHubViewProps) => {
  const open = () => onOpenTournament(hub.tournamentId);
  const current = hub.current;

  return (
    <View style={styles.root}>
      {current ? (
        <ProfileMatchCenter
          data={current}
          onPress={open}
          onAdjustScore={(slot, delta) => onAdjustScore(current.matchId, slot, delta)}
          busy={isScoring}
        />
      ) : (
        <TouchableOpacity style={styles.idle} activeOpacity={0.85} onPress={open}>
          <View style={styles.idleHead}>
            <View style={styles.idleDot} />
            <Text allowFontScaling={false} style={styles.idleKicker}>
              LIVE TOURNAMENT
            </Text>
          </View>
          <Text allowFontScaling={false} style={styles.idleName} numberOfLines={1}>
            {hub.tournamentName}
          </Text>
          <Text allowFontScaling={false} style={styles.idleSub}>
            No active match right now. Tap to view the bracket.
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>
          MATCH HISTORY
        </Text>
        {hub.history.length === 0 ? (
          <View style={styles.histEmpty}>
            <Text allowFontScaling={false} style={styles.histEmptyText}>
              No completed matches yet.
            </Text>
          </View>
        ) : (
          <View style={styles.histCard}>
            {hub.history.map((r, i) => (
              <View key={r.id}>
                {i > 0 && <View style={styles.histDivider} />}
                <HistoryRow r={r} />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { width: "100%" },

  // Idle (no active match) card
  idle: {
    marginHorizontal: wxSc(SPACING.md),
    marginTop: wxSc(SPACING.sm),
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.md),
  },
  idleHead: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.xs) },
  idleDot: {
    width: wxSc(8),
    height: wxSc(8),
    borderRadius: wxSc(4),
    backgroundColor: COLORS.warning,
  },
  idleKicker: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  idleName: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    marginTop: wxSc(SPACING.xs),
  },
  idleSub: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: wxSc(2),
  },

  // Match history
  section: { marginTop: wxSc(SPACING.lg), paddingHorizontal: wxSc(SPACING.md) },
  sectionTitle: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: 1,
    marginBottom: wxSc(SPACING.sm),
  },
  histEmpty: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    paddingVertical: wxSc(SPACING.xl),
    alignItems: "center",
  },
  histEmptyText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textMuted },
  histCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    paddingHorizontal: wxSc(SPACING.md),
  },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.sm),
  },
  wl: {
    width: wxSc(26),
    height: wxSc(26),
    borderRadius: wxSc(13),
    alignItems: "center",
    justifyContent: "center",
  },
  wlWin: { backgroundColor: COLORS.success },
  wlLoss: { backgroundColor: COLORS.error },
  wlText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "900", color: "#fff" },
  histMid: { flex: 1 },
  histOpp: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  histRound: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: wxSc(1),
  },
  histScore: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
  },
  histDivider: { height: 1, backgroundColor: COLORS.border },
});
