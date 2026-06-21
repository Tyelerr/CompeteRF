// src/views/components/tournament/TournamentSoftwareModal.tsx
// Shown when a TD/owner taps "New Tournament": choose whether to run the event on
// Compete's live bracket engine or just list a tournament run in other software.

import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";

export type BracketSource = "compete" | "external";

export const TournamentSoftwareModal = ({
  visible,
  onClose,
  onSelect,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: BracketSource) => void;
  busy?: boolean;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.title}>
          Which software are you using?
        </Text>
        <Text allowFontScaling={false} style={styles.subtitle}>
          You can run the bracket here, or just list a tournament you&apos;re
          running in other software.
        </Text>

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={COLORS.primary} />
            <Text allowFontScaling={false} style={styles.busyText}>
              Creating tournament…
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.option, styles.optionPrimary]}
              onPress={() => onSelect("compete")}
              activeOpacity={0.85}
            >
              <Text allowFontScaling={false} style={styles.optionTitle}>
                {"🎱"} Use Compete Tournament Software
              </Text>
              <Text allowFontScaling={false} style={styles.optionDesc}>
                Run the full live bracket — players, check-in, queue, scoring,
                results.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              onPress={() => onSelect("external")}
              activeOpacity={0.85}
            >
              <Text allowFontScaling={false} style={styles.optionTitle}>
                {"🔗"} Using Other Software
              </Text>
              <Text allowFontScaling={false} style={styles.optionDesc}>
                List it on Billiards with a link to your external bracket.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text allowFontScaling={false} style={styles.cancelText}>
                Cancel
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: webSc(SPACING.lg),
  },
  card: {
    width: "100%" as any,
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
  },
  title: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.lg),
    lineHeight: webMs(FONT_SIZES.sm) * 1.5,
  },
  option: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
  },
  optionPrimary: { borderColor: COLORS.primary },
  optionTitle: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
  },
  optionDesc: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(4),
    lineHeight: webMs(FONT_SIZES.xs) * 1.5,
  },
  cancel: { alignItems: "center", paddingVertical: webSc(SPACING.sm), marginTop: webSc(SPACING.xs) },
  cancelText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600" },
  busy: { alignItems: "center", paddingVertical: webSc(SPACING.lg), gap: webSc(SPACING.sm) },
  busyText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
});
