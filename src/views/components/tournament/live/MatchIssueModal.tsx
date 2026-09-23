// src/views/components/tournament/live/MatchIssueModal.tsx
// "Player message" — the manager's view of one unresolved Contact TD issue, opened from the red
// ✉ View Message on an Active Tables card (Dashboard or Queue) and from the Message Center. It
// reads the existing match_player_status row: no second issue store, no chat thread.
//
// Mark Resolved stamps resolved_at through the narrow manager RPC (the red indicator disappears
// and the player's check-in is untouched). Message Player hands off to the EXISTING Compete
// direct-message composer rather than building conversation infrastructure here.
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { MatchPlayerStatus, issueReasonLabel } from "../../../../models/types/match-checkin.types";

export interface MatchIssueView {
  status: MatchPlayerStatus;
  playerName: string;
  opponentName: string | null;
  tournamentName: string;
  tableLabel: string | null;
  matchLabel: string;
  checkedIn: boolean;
}

const sentAt = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

export const MatchIssueModal = ({
  visible,
  issue,
  busy,
  onResolve,
  onMessagePlayer,
  onClose,
}: {
  visible: boolean;
  issue: MatchIssueView | null;
  busy?: boolean;
  onResolve: () => void;
  // Opens the existing DM composer for this player (no new messaging system).
  onMessagePlayer?: () => void;
  onClose: () => void;
}) => (
  <Modal visible={visible && !!issue} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.kicker}>
          PLAYER MESSAGE
        </Text>
        {!!issue && (
          <>
            <Text allowFontScaling={false} style={styles.player} numberOfLines={1}>
              {issue.playerName}
              {issue.checkedIn ? <Text style={styles.checked}>{"  ✓ Checked in"}</Text> : null}
            </Text>
            <Text allowFontScaling={false} style={styles.meta} numberOfLines={2}>
              {[issue.tournamentName, issue.tableLabel, issue.opponentName ? `vs ${issue.opponentName}` : issue.matchLabel]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>

            <Text allowFontScaling={false} style={styles.label}>
              Reason
            </Text>
            <Text allowFontScaling={false} style={styles.reason}>
              {issueReasonLabel(issue.status.issue_reason)}
            </Text>

            {!!issue.status.issue_message && (
              <>
                <Text allowFontScaling={false} style={styles.label}>
                  Message
                </Text>
                <Text allowFontScaling={false} style={styles.message}>
                  {`“${issue.status.issue_message}”`}
                </Text>
              </>
            )}

            <Text allowFontScaling={false} style={styles.sent}>
              {`Sent ${sentAt(issue.status.issue_at)}`}
            </Text>

            <TouchableOpacity
              style={[styles.primary, busy && styles.disabled]}
              disabled={busy}
              onPress={onResolve}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text allowFontScaling={false} style={styles.primaryText}>
                  Mark Resolved
                </Text>
              )}
            </TouchableOpacity>
            {!!onMessagePlayer && (
              <TouchableOpacity style={styles.secondary} onPress={onMessagePlayer} activeOpacity={0.85}>
                <Text allowFontScaling={false} style={styles.secondaryText}>
                  Message Player
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <TouchableOpacity style={styles.close} onPress={onClose} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={styles.closeText}>
            Close
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#000000AA", alignItems: "center", justifyContent: "center", padding: webSc(SPACING.lg) },
  card: {
    width: "100%",
    maxWidth: webSc(420),
    backgroundColor: COLORS.backgroundCard,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
    gap: webSc(2),
  },
  kicker: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.error, letterSpacing: 0.5, textAlign: "center" },
  player: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, textAlign: "center", marginTop: webSc(SPACING.xs) },
  checked: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "800" },
  meta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, textAlign: "center", marginBottom: webSc(SPACING.sm) },
  label: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "700", marginTop: webSc(SPACING.xs) },
  reason: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "800" },
  message: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontStyle: "italic" },
  sent: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: webSc(SPACING.xs) },
  primary: {
    marginTop: webSc(SPACING.md),
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    alignItems: "center",
  },
  primaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  secondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    alignItems: "center",
  },
  secondaryText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  disabled: { opacity: 0.5 },
  close: { paddingVertical: webSc(SPACING.xs), alignItems: "center" },
  closeText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
});
