// src/views/components/profile/MatchHistoryDetailModal.tsx
// A centered popup summarizing one completed match from the player's history:
// final score, outcome, and a You-vs-opponent comparison (Fargo, race group,
// race-to). Tap outside or Close to dismiss.

import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { PlayerMatchResult } from "../../../viewmodels/hooks/use.player.live.match";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

const DASH = "–"; // en dash for the score separator
const EMDASH = "—"; // placeholder for missing values

interface MatchHistoryDetailModalProps {
  result: PlayerMatchResult | null;
  myName?: string | null;
  onClose: () => void;
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Text allowFontScaling={false} style={styles.statLabel}>
      {label}
    </Text>
    <Text allowFontScaling={false} style={styles.statValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const PlayerCol = ({
  name,
  fargo,
  group,
  race,
  mine,
}: {
  name: string;
  fargo: number | null;
  group: string | null;
  race: number | null;
  mine?: boolean;
}) => (
  <View style={styles.col}>
    <Text
      allowFontScaling={false}
      style={[styles.colName, mine && styles.colNameMine]}
      numberOfLines={1}
    >
      {name}
    </Text>
    <Stat label="Fargo" value={fargo != null ? String(fargo) : "Unrated"} />
    {group != null && <Stat label="Group" value={`Group ${group}`} />}
    <Stat label="Race to" value={race != null ? String(race) : EMDASH} />
  </View>
);

export const MatchHistoryDetailModal = ({
  result,
  myName,
  onClose,
}: MatchHistoryDetailModalProps) => {
  if (!result) return null;
  const r = result;
  const oppName = r.opponentName ?? EMDASH;
  const note =
    r.result === "forfeit"
      ? " by forfeit"
      : r.result === "withdraw"
        ? " by withdrawal"
        : "";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text allowFontScaling={false} style={styles.round}>
            {r.roundLabel}
          </Text>

          <View style={[styles.chip, r.won ? styles.chipWin : styles.chipLoss]}>
            <Text allowFontScaling={false} style={styles.chipText}>
              {r.won ? "WIN" : "LOSS"}
            </Text>
          </View>

          <View style={styles.scoreRow}>
            <Text
              allowFontScaling={false}
              style={[styles.scoreNum, r.won && styles.scoreWin]}
            >
              {r.myScore}
            </Text>
            <Text allowFontScaling={false} style={styles.scoreDash}>
              {DASH}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.scoreNum, !r.won && styles.scoreWin]}
            >
              {r.oppScore}
            </Text>
          </View>
          <Text allowFontScaling={false} style={styles.outcome}>
            {r.won ? "You won" : "You lost"}
            {note}
          </Text>

          <View style={styles.compare}>
            <PlayerCol
              name={myName ? `${myName} (you)` : "You"}
              fargo={r.myFargo}
              group={r.myGroup}
              race={r.myRace}
              mine
            />
            <View style={styles.vsCol}>
              <Text allowFontScaling={false} style={styles.vs}>
                VS
              </Text>
            </View>
            <PlayerCol
              name={oppName}
              fargo={r.oppFargo}
              group={r.oppGroup}
              race={r.oppRace}
            />
          </View>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text allowFontScaling={false} style={styles.closeText}>
              Close
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: wxSc(SPACING.lg),
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: wxSc(SPACING.lg),
    alignItems: "center",
  },
  round: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  chip: {
    marginTop: wxSc(SPACING.sm),
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.xs),
    borderRadius: RADIUS.full,
  },
  chipWin: { backgroundColor: COLORS.success },
  chipLoss: { backgroundColor: COLORS.error },
  chipText: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
  },

  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.md),
    marginTop: wxSc(SPACING.md),
  },
  scoreNum: {
    fontSize: wxMs(FONT_SIZES.xxxl),
    fontWeight: "900",
    color: COLORS.textSecondary,
    minWidth: wxSc(44),
    textAlign: "center",
  },
  scoreWin: { color: COLORS.text },
  scoreDash: {
    fontSize: wxMs(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  outcome: {
    marginTop: wxSc(SPACING.xs),
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
  },

  compare: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    marginTop: wxSc(SPACING.lg),
    gap: wxSc(SPACING.sm),
  },
  col: { flex: 1, gap: wxSc(SPACING.xs) },
  colName: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: wxSc(SPACING.xs),
  },
  colNameMine: { color: COLORS.primary },
  stat: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: wxSc(SPACING.sm),
  },
  statLabel: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
  statValue: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
    flexShrink: 1,
  },
  vsCol: {
    paddingTop: wxSc(SPACING.xs),
    flexShrink: 0,
  },
  vs: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.textMuted,
    letterSpacing: 1,
  },

  closeBtn: {
    marginTop: wxSc(SPACING.lg),
    alignSelf: "stretch",
    paddingVertical: wxSc(SPACING.md),
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  closeText: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
  },
});
