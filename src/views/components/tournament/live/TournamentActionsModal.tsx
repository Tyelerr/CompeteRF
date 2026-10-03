// src/views/components/tournament/live/TournamentActionsModal.tsx
// Elimination (Single + Double) "Tournament Actions" — the tournament-level command modal opened
// from the header Actions button (same placement / button family as Chip's). Tournament-wide
// actions only: match-level actions (Set Winner, Reset, Reopen, Start, tables, scoring) stay on
// the match cards / match sheet. Only REAL actions are enabled; anything not built yet is shown
// disabled with a "Coming soon" tag — never a fake button.

import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";

interface ActionRow {
  key: string;
  label: string;
  detail?: string;
  danger?: boolean;
  // Enabled only when a handler is wired AND the action applies right now.
  onPress?: () => void;
  // Why it's disabled (shown as the tag): "Coming soon", "Not live yet", "Finished".
  disabledTag?: string;
}

export const TournamentActionsModal = ({
  visible,
  onClose,
  onFinish,
  finishing,
  canFinish,
  finished,
  onRecovery,
  recoveryAvailable,
}: {
  visible: boolean;
  onClose: () => void;
  // Marks the tournament completed (unlocks Results, stops live editing) — confirmation lives in
  // the caller (handleFinishTournament).
  onFinish?: () => void;
  finishing?: boolean;
  // The bracket is live (drawn / running) and not yet finished.
  canFinish?: boolean;
  finished?: boolean;
  // Opens Recovery & History (Undo / History / Restore Points). Available once a bracket exists.
  onRecovery?: () => void;
  recoveryAvailable?: boolean;
}) => {
  const sections: { title: string; rows: ActionRow[] }[] = [
    {
      title: "RECOVERY",
      rows: [
        {
          key: "recovery",
          label: "Recovery & History",
          detail: "Undo, history, restore points and revision info",
          onPress: onRecovery && recoveryAvailable ? onRecovery : undefined,
          disabledTag: !onRecovery ? "Coming soon" : !recoveryAvailable ? "No bracket yet" : undefined,
        },
      ],
    },
    {
      title: "TOURNAMENT",
      rows: [
        {
          key: "finish",
          label: "Finish Tournament",
          detail: "Mark the event completed — unlocks Results and stops live editing",
          danger: true,
          onPress: onFinish && canFinish && !finished ? onFinish : undefined,
          disabledTag: finished ? "Finished" : !canFinish ? "Not live yet" : undefined,
        },
      ],
    },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>
              Tournament Actions
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Text allowFontScaling={false} style={styles.closeX}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>
          <Text allowFontScaling={false} style={styles.subtitle}>
            Tournament-wide controls. Match actions stay on each match.
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text allowFontScaling={false} style={styles.sectionTitle}>
                  {section.title}
                </Text>
                <View style={styles.card}>
                  {section.rows.map((row, i) => {
                    const enabled = !!row.onPress && !(row.key === "finish" && finishing);
                    return (
                      <View key={row.key}>
                        {i > 0 && <View style={styles.divider} />}
                        <TouchableOpacity
                          style={[styles.row, !enabled && styles.rowDisabled]}
                          activeOpacity={0.7}
                          disabled={!enabled}
                          onPress={row.onPress}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: !enabled }}
                        >
                          <View style={styles.rowText}>
                            <Text
                              allowFontScaling={false}
                              style={[styles.rowLabel, row.danger && enabled && styles.rowLabelDanger, !enabled && styles.rowLabelDisabled]}
                              numberOfLines={1}
                            >
                              {row.label}
                            </Text>
                            {!!row.detail && (
                              <Text allowFontScaling={false} style={styles.rowDetail} numberOfLines={2}>
                                {row.detail}
                              </Text>
                            )}
                          </View>
                          {enabled ? (
                            <Text allowFontScaling={false} style={[styles.rowChevron, row.danger && styles.rowChevronDanger]}>
                              {row.key === "finish" && finishing ? "…" : "›"}
                            </Text>
                          ) : row.disabledTag ? (
                            <View style={styles.soonTag}>
                              <Text allowFontScaling={false} style={styles.soonText}>
                                {row.disabledTag}
                              </Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text allowFontScaling={false} style={styles.closeBtnText}>
              Close
            </Text>
          </TouchableOpacity>
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
    padding: webSc(SPACING.lg),
  },
  sheet: {
    width: "100%",
    maxWidth: webSc(440),
    maxHeight: "86%",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.xl),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
  closeX: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.textSecondary },
  subtitle: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.sm),
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: webSc(SPACING.xs) },
  section: { marginTop: webSc(SPACING.md) },
  sectionTitle: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: webSc(SPACING.xs),
  },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: webSc(SPACING.md),
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.md),
    gap: webSc(SPACING.sm),
  },
  rowDisabled: { opacity: 0.6 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: webMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "600" },
  rowLabelDanger: { color: COLORS.error },
  rowLabelDisabled: { color: COLORS.textSecondary },
  rowDetail: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: webSc(2) },
  soonTag: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.full),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  soonText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "700" },
  rowChevron: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.textSecondary, fontWeight: "800" },
  rowChevronDanger: { color: COLORS.error },
  closeBtn: {
    marginTop: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  closeBtnText: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
});
