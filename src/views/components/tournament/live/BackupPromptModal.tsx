// src/views/components/tournament/live/BackupPromptModal.tsx
// One-time prompt shown right after a TD's Start Tournament succeeds (Single, Double, Chip):
// offer a backup PDF in case the internet drops during the event. Never downloads on its own —
// the TD chooses (browsers block unprompted downloads; native share sheets shouldn't pop up).
// A failed backup never affects the start; Actions always has the same download.

import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";

export const BACKUP_PROMPT_TITLE = "Tournament Started";
export const BACKUP_PROMPT_HELPER = "You can download an updated backup anytime from Actions.";

export const BackupPromptModal = ({
  visible,
  format,
  busy,
  onDownload,
  onDismiss,
}: {
  visible: boolean;
  format: "elim" | "chip";
  busy: boolean;
  onDownload: () => void;
  onDismiss: () => void;
}) => (
  <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
    <Pressable style={styles.backdrop} onPress={busy ? undefined : onDismiss}>
      <Pressable style={styles.card} onPress={() => {}}>
        <Text allowFontScaling={false} style={styles.title}>
          {BACKUP_PROMPT_TITLE}
        </Text>
        <Text allowFontScaling={false} style={styles.body}>
          {format === "chip"
            ? "Save a backup packet — player lookup, chip tracker, queue and table worksheets — in case you lose internet during the event."
            : "Save a copy of the bracket in case you lose internet during the event."}
        </Text>
        <TouchableOpacity style={[styles.primary, busy && styles.disabled]} onPress={onDownload} disabled={busy} accessibilityRole="button">
          {busy ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text allowFontScaling={false} style={styles.primaryText}>
              {format === "chip" ? "Download Backup" : "Download Bracket Backup"}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={onDismiss} disabled={busy} accessibilityRole="button">
          <Text allowFontScaling={false} style={styles.secondaryText}>
            Not Now
          </Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.helper}>
          {BACKUP_PROMPT_HELPER}
        </Text>
      </Pressable>
    </Pressable>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: webSc(SPACING.lg) },
  card: {
    width: "100%",
    maxWidth: webSc(420),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
  },
  title: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "700", marginBottom: webSc(SPACING.sm) },
  body: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), lineHeight: webMs(FONT_SIZES.md) * 1.4, marginBottom: webSc(SPACING.lg) },
  primary: {
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.md),
    paddingVertical: webSc(SPACING.md),
    alignItems: "center",
    marginBottom: webSc(SPACING.sm),
  },
  primaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  disabled: { opacity: 0.7 },
  secondary: { paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  secondaryText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  helper: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), textAlign: "center", marginTop: webSc(SPACING.sm) },
});
