// src/views/components/profile/MatchCheckInModal.tsx
// The player's match acknowledgement, opened by a "Table Assigned" notification tap and from the
// YOU PLAY NEXT / MATCH READY cards. Two actions only: Check In and Contact TD (no "Need more
// time"). Race text comes from the same helper the live match and the push use.
import { useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { MATCH_ISSUE_REASONS, MatchIssueReason, issueReasonLabel } from "../../../models/types/match-checkin.types";
import { PlayerMatchContext } from "../../../viewmodels/hooks/use.player.match.actions";

export const MatchCheckInModal = ({
  visible,
  context,
  checkedIn,
  issueReason,
  busy,
  notice,
  onCheckIn,
  onContactTd,
  onClose,
}: {
  visible: boolean;
  context: PlayerMatchContext | null;
  checkedIn: boolean;
  issueReason: MatchIssueReason | null;
  busy: boolean;
  // e.g. "This match is no longer active." after a stale notification tap.
  notice?: string | null;
  onCheckIn: () => Promise<void> | void;
  onContactTd: (reason: MatchIssueReason, message?: string | null) => Promise<void> | void;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<"match" | "contact">("match");
  const [reason, setReason] = useState<MatchIssueReason>("running_late");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const close = () => {
    setStep("match");
    setMessage("");
    setSent(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {step === "match" ? (
            <>
              <Text allowFontScaling={false} style={styles.tournament} numberOfLines={1}>
                {context?.tournamentName ?? "Your match"}
              </Text>
              {!!notice && (
                <Text allowFontScaling={false} style={styles.notice}>
                  {notice}
                </Text>
              )}
              {!!context && (
                <>
                  {!!context.tableLabel && (
                    <Text allowFontScaling={false} style={styles.table}>
                      {context.tableLabel}
                    </Text>
                  )}
                  <Text allowFontScaling={false} style={styles.vs} numberOfLines={1}>
                    {context.opponentName ? `vs ${context.opponentName}` : context.roundLabel}
                  </Text>
                  <Text allowFontScaling={false} style={styles.race}>
                    {context.raceText}
                  </Text>
                </>
              )}
              {checkedIn && (
                <Text allowFontScaling={false} style={styles.checkedIn}>
                  {"✓ You're checked in"}
                </Text>
              )}
              {/* Independent of the ✓ above: contacting the TD never clears a check-in. */}
              {!!issueReason && (
                <Text allowFontScaling={false} style={styles.issue}>
                  {`✉ TD contacted — ${issueReasonLabel(issueReason)}`}
                </Text>
              )}

              {!!context && (
                <TouchableOpacity
                  style={[styles.primary, (busy || checkedIn) && styles.disabled]}
                  disabled={busy || checkedIn}
                  onPress={async () => {
                    await onCheckIn();
                    close();
                  }}
                  activeOpacity={0.85}
                >
                  {busy ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text allowFontScaling={false} style={styles.primaryText}>
                      {checkedIn ? "Checked In" : "Check In"}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {!!context && (
                <TouchableOpacity style={styles.secondary} onPress={() => setStep("contact")} activeOpacity={0.85}>
                  <Text allowFontScaling={false} style={styles.secondaryText}>
                    Contact TD
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.close} onPress={close} activeOpacity={0.7}>
                <Text allowFontScaling={false} style={styles.closeText}>
                  Close
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text allowFontScaling={false} style={styles.tournament}>
                Contact Tournament Director
              </Text>
              {sent ? (
                <Text allowFontScaling={false} style={styles.checkedIn}>
                  ✓ Sent — the tournament director has been notified
                </Text>
              ) : (
                <>
                  <ScrollView style={styles.reasons} bounces={false}>
                    {MATCH_ISSUE_REASONS.map((r) => (
                      <TouchableOpacity
                        key={r.value}
                        style={[styles.reason, reason === r.value && styles.reasonOn]}
                        onPress={() => setReason(r.value)}
                        activeOpacity={0.8}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: reason === r.value }}
                      >
                        <Text allowFontScaling={false} style={[styles.reasonText, reason === r.value && styles.reasonTextOn]}>
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput
                    style={styles.input}
                    value={message}
                    onChangeText={(t) => setMessage(t.slice(0, 280))}
                    placeholder="Add a short message (optional)"
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    maxLength={280}
                  />
                  <TouchableOpacity
                    style={[styles.primary, busy && styles.disabled]}
                    disabled={busy}
                    onPress={async () => {
                      await onContactTd(reason, message);
                      setSent(true);
                    }}
                    activeOpacity={0.85}
                  >
                    {busy ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <Text allowFontScaling={false} style={styles.primaryText}>
                        Send
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={styles.close} onPress={sent ? close : () => setStep("match")} activeOpacity={0.7}>
                <Text allowFontScaling={false} style={styles.closeText}>
                  {sent ? "Close" : "Back"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

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
    gap: webSc(SPACING.xs),
  },
  tournament: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, textAlign: "center" },
  notice: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.warning, fontWeight: "700", textAlign: "center" },
  table: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.primaryLight, textAlign: "center" },
  vs: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700", textAlign: "center" },
  race: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center" },
  checkedIn: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.success, fontWeight: "800", textAlign: "center", marginTop: webSc(SPACING.xs) },
  issue: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.warning, fontWeight: "700", textAlign: "center" },
  primary: {
    marginTop: webSc(SPACING.sm),
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
  reasons: { maxHeight: webSc(180) },
  reason: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    marginBottom: webSc(SPACING.xs),
  },
  reasonOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "1A" },
  reasonText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  reasonTextOn: { color: COLORS.primaryLight },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    padding: webSc(SPACING.sm),
    color: COLORS.text,
    fontSize: webMs(FONT_SIZES.sm),
    minHeight: webSc(64),
    textAlignVertical: "top",
  },
});
