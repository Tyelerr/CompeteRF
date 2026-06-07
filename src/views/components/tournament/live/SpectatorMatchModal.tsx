// src/views/components/tournament/live/SpectatorMatchModal.tsx
// Read-only match detail popup for spectators (no management actions). Shows both
// players with Fargo / race group / race-to, the score, status and result. Used by
// the spectator Matches/Bracket views when a card or bracket node is tapped.

import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RaceGroup } from "../../../../models/types/tournament-settings.types";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { groupForFargo } from "../../../../utils/bracket.utils";
import { LiveMatch } from "../../../../utils/match.utils";
import { moderateScale, scale } from "../../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

interface SpectatorMatchModalProps {
  match: LiveMatch | null;
  groups?: RaceGroup[];
  onClose: () => void;
}

const statusText = (m: LiveMatch): string => {
  if (m.bye) return "Bye";
  if (m.status === "in_progress") return "Live";
  if (m.status === "completed") return "Final";
  return "Not started";
};

const PlayerLine = ({
  name,
  fargo,
  group,
  race,
  score,
  won,
  lost,
  result,
  dash,
}: {
  name: string | null;
  fargo: number | null;
  group: string | null;
  race: number | null;
  score: number | null;
  won: boolean;
  lost: boolean;
  result: "normal" | "forfeit" | "withdraw" | null;
  dash: boolean;
}) => {
  const scoreLabel = dash
    ? "–"
    : lost && result === "forfeit"
      ? "FF"
      : lost && result === "withdraw"
        ? "WD"
        : String(score ?? 0);
  const meta = [
    fargo != null ? `Fargo ${fargo}` : "Unrated",
    group != null ? `Group ${group}` : null,
    race != null ? `Race ${race}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <View style={styles.pRow}>
      <View style={styles.pInfo}>
        <Text
          allowFontScaling={false}
          style={[styles.pName, won && styles.pNameWon, lost && styles.pNameLost]}
          numberOfLines={1}
        >
          {name ?? "TBD"}
          {won ? "  ✓" : ""}
        </Text>
        <Text allowFontScaling={false} style={styles.pMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={[styles.scoreBox, won && styles.scoreBoxWon]}>
        <Text
          allowFontScaling={false}
          style={[styles.scoreNum, won && styles.scoreNumWon]}
        >
          {scoreLabel}
        </Text>
      </View>
    </View>
  );
};

export const SpectatorMatchModal = ({
  match,
  groups,
  onClose,
}: SpectatorMatchModalProps) => {
  if (!match) return null;
  const m = match;
  const grp = (f: number | null) =>
    groups && groups.length > 0 ? (groupForFargo(f, groups)?.label ?? null) : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.head}>
            <Text allowFontScaling={false} style={styles.label}>
              {m.label}
            </Text>
            <View
              style={[
                styles.chip,
                m.status === "in_progress" && styles.chipLive,
                m.status === "completed" && styles.chipDone,
              ]}
            >
              <Text allowFontScaling={false} style={styles.chipText}>
                {statusText(m).toUpperCase()}
              </Text>
            </View>
          </View>

          {m.tableLabel && (
            <Text allowFontScaling={false} style={styles.sub}>
              {m.tableLabel}
            </Text>
          )}

          <View style={styles.players}>
            <PlayerLine
              name={m.p1Name}
              fargo={m.p1Fargo}
              group={grp(m.p1Fargo)}
              race={m.p1Race}
              score={m.p1Score}
              won={m.winner === 1}
              lost={m.winner === 2}
              result={m.result}
              dash={m.bye}
            />
            <View style={styles.vsDivider}>
              <Text allowFontScaling={false} style={styles.vsText}>
                VS
              </Text>
            </View>
            <PlayerLine
              name={m.bye ? "Bye" : m.p2Name}
              fargo={m.bye ? null : m.p2Fargo}
              group={m.bye ? null : grp(m.p2Fargo)}
              race={m.bye ? null : m.p2Race}
              score={m.p2Score}
              won={m.winner === 2}
              lost={m.winner === 1}
              result={m.result}
              dash={m.bye}
            />
          </View>

          {m.result && m.result !== "normal" && (
            <Text allowFontScaling={false} style={styles.resultNote}>
              Ended by {m.result}
            </Text>
          )}

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
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: wxSc(SPACING.sm),
  },
  label: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
    flex: 1,
  },
  chip: {
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(2),
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipLive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  chipDone: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  sub: {
    marginTop: wxSc(SPACING.xs),
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
  },
  players: { marginTop: wxSc(SPACING.md) },
  pRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: wxSc(SPACING.sm),
  },
  pInfo: { flex: 1 },
  pName: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
  pNameWon: { color: COLORS.success },
  pNameLost: { color: COLORS.textMuted },
  pMeta: {
    marginTop: wxSc(2),
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
  scoreBox: {
    minWidth: wxSc(48),
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.xs),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  scoreBoxWon: { borderColor: COLORS.success },
  scoreNum: {
    fontSize: wxMs(FONT_SIZES.xxl),
    fontWeight: "900",
    color: COLORS.primary,
    fontVariant: ["tabular-nums"],
  },
  scoreNumWon: { color: COLORS.success },
  vsDivider: { alignItems: "center", paddingVertical: wxSc(SPACING.xs) },
  vsText: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.textMuted,
    letterSpacing: 1,
  },
  resultNote: {
    marginTop: wxSc(SPACING.sm),
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.warning,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "capitalize",
  },
  closeBtn: {
    marginTop: wxSc(SPACING.lg),
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
