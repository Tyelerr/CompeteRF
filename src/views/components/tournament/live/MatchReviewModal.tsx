// src/views/components/tournament/live/MatchReviewModal.tsx
// The TD's decision sheet for a match that has waited too long — opened from the amber/red timer
// line on an Active Tables card (Dashboard or Queue) or from a Forfeit Review alert.
//
// Nothing here is automatic: the app never decides who is absent, never applies a penalty and
// never forfeits anyone. It only offers the practical actions, and the wording changes with the
// situation — someone missing vs both present but nobody started.
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";

export interface MatchReviewView {
  matchId: string;
  matchLabel: string;
  tableLabel: string | null;
  timerLabel: string;
  /** false → someone is still not checked in; true → both present, nobody started. */
  bothCheckedIn: boolean;
  extendedMinutes: number;
  players: { slot: 1 | 2; name: string; registrationId: number | null; checkedIn: boolean }[];
}

export const EXTEND_CHOICES = [5, 10] as const;

export const MatchReviewModal = ({
  visible,
  review,
  busy,
  onMarkCheckedIn,
  onExtend,
  onStartMatch,
  onForfeitPlayer,
  onClose,
}: {
  visible: boolean;
  review: MatchReviewView | null;
  busy?: boolean;
  onMarkCheckedIn: (registrationId: number, checkedIn: boolean) => void;
  onExtend: (minutes: number) => void;
  onStartMatch: () => void;
  /** Opens the existing forfeit flow for that player — this modal never forfeits by itself. */
  onForfeitPlayer: (slot: 1 | 2) => void;
  onClose: () => void;
}) => (
  <Modal visible={visible && !!review} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        {!!review && (
          <ScrollView bounces={false}>
            <Text allowFontScaling={false} style={[styles.kicker, review.bothCheckedIn && styles.kickerWarn]}>
              {review.bothCheckedIn ? "MATCH NOT STARTED" : "FORFEIT REVIEW"}
            </Text>
            <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>
              {review.matchLabel}
            </Text>
            <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
              {[review.tableLabel, review.timerLabel].filter(Boolean).join("  ·  ")}
              {review.extendedMinutes ? `  ·  Extended +${review.extendedMinutes} min` : ""}
            </Text>

            {/* Presence — the TD can confirm a player who has no phone or is a guest. */}
            {review.players.map((p) => (
              <View key={p.slot} style={styles.playerRow}>
                <Text allowFontScaling={false} style={styles.playerName} numberOfLines={1}>
                  {p.checkedIn ? "✓" : "○"}  {p.name}
                </Text>
                {p.registrationId != null && (
                  <TouchableOpacity
                    style={styles.rowBtn}
                    disabled={busy}
                    onPress={() => onMarkCheckedIn(p.registrationId!, !p.checkedIn)}
                    activeOpacity={0.85}
                  >
                    <Text allowFontScaling={false} style={styles.rowBtnText}>
                      {p.checkedIn ? "Undo Check In" : "Mark Checked In"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {/* Both present → the obvious action is simply to start it. */}
            {review.bothCheckedIn && (
              <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={onStartMatch} activeOpacity={0.85}>
                {busy ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text allowFontScaling={false} style={styles.primaryText}>Start Match</Text>
                )}
              </TouchableOpacity>
            )}

            <Text allowFontScaling={false} style={styles.sectionLabel}>Extend Time</Text>
            <View style={styles.extendRow}>
              {EXTEND_CHOICES.map((min) => (
                <TouchableOpacity key={min} style={styles.extendBtn} disabled={busy} onPress={() => onExtend(min)} activeOpacity={0.85}>
                  <Text allowFontScaling={false} style={styles.extendText}>{`+${min} min`}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Forfeiting is a deliberate, separate decision — it opens the existing flow. */}
            <Text allowFontScaling={false} style={styles.sectionLabel}>Forfeit a player</Text>
            {review.players.map((p) => (
              <TouchableOpacity key={`ff-${p.slot}`} style={styles.danger} disabled={busy} onPress={() => onForfeitPlayer(p.slot)} activeOpacity={0.85}>
                <Text allowFontScaling={false} style={styles.dangerText} numberOfLines={1}>
                  {`Forfeit ${p.name}`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity style={styles.close} onPress={onClose} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#000000AA", alignItems: "center", justifyContent: "center", padding: webSc(SPACING.lg) },
  card: {
    width: "100%", maxWidth: webSc(420), maxHeight: "85%" as any,
    backgroundColor: COLORS.backgroundCard, borderRadius: webSc(RADIUS.lg),
    borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.lg), gap: webSc(2),
  },
  kicker: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.error, letterSpacing: 0.5, textAlign: "center" },
  kickerWarn: { color: COLORS.warning },
  title: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, textAlign: "center" },
  meta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, textAlign: "center", marginBottom: webSc(SPACING.sm) },
  playerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs),
  },
  playerName: { flex: 1, fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700" },
  rowBtn: { borderWidth: 1, borderColor: COLORS.border, borderRadius: webSc(RADIUS.sm), paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(6) },
  rowBtnText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.text, fontWeight: "800" },
  sectionLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "700", marginTop: webSc(SPACING.sm) },
  extendRow: { flexDirection: "row", gap: webSc(SPACING.sm) },
  extendBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.primary, borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm), alignItems: "center",
  },
  extendText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  primary: {
    marginTop: webSc(SPACING.sm), backgroundColor: COLORS.primary, borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm), alignItems: "center",
  },
  primaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  danger: {
    borderWidth: 1, borderColor: COLORS.error, borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm), alignItems: "center", marginTop: webSc(SPACING.xs),
  },
  dangerText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  disabled: { opacity: 0.5 },
  close: { paddingVertical: webSc(SPACING.xs), alignItems: "center" },
  closeText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
});
