// src/views/components/tournament/live/TournamentActionsModal.tsx
// "Tournament Actions" — the Live-phase control center. PLACEHOLDER ONLY: this is
// the reserved, permanent home for future TD power commands (start all ready
// matches, auto-assign tables, pause/resume, etc.). No logic yet — every action
// shows "Coming soon" when tapped. Wiring lands in a later phase.

import { useState } from "react";
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

// Built at runtime so no raw emoji lives in source (toolchain-safe).
const BOLT = String.fromCodePoint(0x26a1);

interface ActionItem {
  label: string;
  danger?: boolean;
  action?: "finish"; // wired actions; the rest are still placeholders
}

const SECTIONS: { title: string; items: ActionItem[] }[] = [
  {
    title: "RUN",
    items: [
      { label: "Start All Ready Matches" },
      { label: "Auto Run Tournament" },
    ],
  },
  {
    title: "TABLES",
    items: [{ label: "Auto Assign Tables" }, { label: "Clear Table Assignments" }],
  },
  {
    title: "PLAYERS",
    items: [{ label: "Call Next Matches" }, { label: "Send Tournament Announcement" }],
  },
  {
    title: "CONTROL",
    items: [{ label: "Pause Tournament" }, { label: "Resume Tournament" }],
  },
  {
    title: "TOURNAMENT",
    items: [
      { label: "Export Results" },
      { label: "Finish Tournament", danger: true, action: "finish" },
    ],
  },
];

export const TournamentActionsModal = ({
  visible,
  onClose,
  onFinish,
  finishing,
}: {
  visible: boolean;
  onClose: () => void;
  // Marks the tournament completed (unlocks the Results phase). When absent, the
  // Finish action falls back to the "coming soon" placeholder.
  onFinish?: () => void;
  finishing?: boolean;
}) => {
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  const close = () => {
    setComingSoon(null);
    onClose();
  };

  const onItemPress = (item: ActionItem) => {
    if (item.action === "finish" && onFinish) {
      onFinish();
      return;
    }
    setComingSoon(item.label);
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>
              {BOLT} Tournament Actions
            </Text>
            <TouchableOpacity onPress={close} hitSlop={10}>
              <Text allowFontScaling={false} style={styles.closeX}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          {comingSoon ? (
            <View style={styles.banner}>
              <Text allowFontScaling={false} style={styles.bannerText} numberOfLines={1}>
                {comingSoon} · Coming soon
              </Text>
            </View>
          ) : (
            <Text allowFontScaling={false} style={styles.subtitle}>
              Operational commands for running the event. Coming soon.
            </Text>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text allowFontScaling={false} style={styles.sectionTitle}>
                  {section.title}
                </Text>
                <View style={styles.card}>
                  {section.items.map((item, i) => (
                    <View key={item.label}>
                      {i > 0 && <View style={styles.divider} />}
                      <TouchableOpacity
                        style={styles.row}
                        activeOpacity={0.7}
                        disabled={item.action === "finish" && finishing}
                        onPress={() => onItemPress(item)}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[styles.rowLabel, item.danger && styles.rowLabelDanger]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                        {item.action === "finish" && onFinish ? (
                          <Text allowFontScaling={false} style={styles.rowChevron}>
                            {finishing ? "…" : "›"}
                          </Text>
                        ) : (
                          <View style={styles.soonTag}>
                            <Text allowFontScaling={false} style={styles.soonText}>
                              Soon
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={close}>
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
  title: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", color: COLORS.text },
  closeX: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.textSecondary },
  subtitle: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.sm),
  },
  banner: {
    marginTop: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
    backgroundColor: COLORS.primary + "22",
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: webSc(RADIUS.md),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
  },
  bannerText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.primary },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: webSc(SPACING.xs) },
  section: { marginTop: webSc(SPACING.md) },
  sectionTitle: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
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
  rowLabel: { fontSize: webMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "600", flex: 1 },
  rowLabelDanger: { color: COLORS.error },
  soonTag: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.full),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  soonText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "700" },
  rowChevron: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.error, fontWeight: "800" },
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
