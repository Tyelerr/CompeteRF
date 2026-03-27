import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import { moderateScale, scale } from "@/src/utils/scaling";
import { AdminGiveaway } from "@/src/viewmodels/useAdminGiveaways";
import React from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface DrawWinnerModalProps {
  visible: boolean; giveaway: AdminGiveaway | null; isProcessing: boolean; onClose: () => void; onDraw: () => void;
}

export const DrawWinnerModal = ({ visible, giveaway, isProcessing, onClose, onDraw }: DrawWinnerModalProps) => {
  if (!giveaway) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          <Text allowFontScaling={false} style={styles.title}>Draw Winner</Text>
          <Text allowFontScaling={false} style={styles.icon}>🎲</Text>
          <Text allowFontScaling={false} style={styles.giveawayName}>"{giveaway.name}"</Text>
          <Text allowFontScaling={false} style={styles.entries}>{giveaway.entry_count || 0} eligible entries</Text>
          <Text allowFontScaling={false} style={styles.warning}>Are you sure you want to draw a winner?{"\n"}This action cannot be undone.</Text>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={isProcessing}>
              <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmButton, isProcessing && styles.buttonDisabled]} onPress={onDraw} disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text allowFontScaling={false} style={styles.confirmButtonText}>Draw Winner</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "center", alignItems: "center" },
  container: { backgroundColor: COLORS.surface, marginHorizontal: scale(SPACING.lg), borderRadius: scale(16), padding: scale(SPACING.lg), alignItems: "center", width: "90%", maxWidth: 400 },
  title: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.md) },
  icon: { fontSize: moderateScale(48), marginBottom: scale(SPACING.md) },
  giveawayName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.xs), textAlign: "center" },
  entries: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: scale(SPACING.md) },
  warning: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center", marginBottom: scale(SPACING.lg) },
  buttons: { flexDirection: "row", gap: scale(SPACING.sm), width: "100%" },
  cancelButton: { flex: 1, backgroundColor: COLORS.background, paddingVertical: scale(SPACING.md), borderRadius: scale(8), alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  cancelButtonText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  confirmButton: { flex: 1, backgroundColor: COLORS.primary, paddingVertical: scale(SPACING.md), borderRadius: scale(8), alignItems: "center" },
  confirmButtonText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  buttonDisabled: { opacity: 0.6 },
});
