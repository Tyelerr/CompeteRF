import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import { moderateScale, scale } from "@/src/utils/scaling";
import { AdminGiveaway, CurrentWinner } from "@/src/viewmodels/useAdminGiveaways";
import React from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

interface RedrawConfirmModalProps {
  visible: boolean; giveaway: AdminGiveaway | null; currentWinner: CurrentWinner | null;
  eligibleCount: number; reason: string; onReasonChange: (text: string) => void;
  isRedrawing: boolean; onClose: () => void; onConfirm: () => void;
}

export const RedrawConfirmModal = ({ visible, giveaway, currentWinner, eligibleCount, reason, onReasonChange, isRedrawing, onClose, onConfirm }: RedrawConfirmModalProps) => {
  if (!giveaway) return null;
  const canConfirm = reason.trim().length > 0 && !isRedrawing;
  const winnerName = currentWinner?.name || "Current winner";

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: scale(SPACING.lg) }}>
            <View style={styles.header}>
              <Text allowFontScaling={false} style={styles.warningIcon}>⚠️</Text>
              <Text allowFontScaling={false} style={styles.title}>Confirm Redraw</Text>
            </View>
            <View style={styles.content}>
              <Text allowFontScaling={false} style={styles.description}>Are you sure you want to redraw?</Text>
              <Text allowFontScaling={false} style={styles.winnerInfo}>Current winner "{winnerName}" will be marked as disqualified and a new winner will be randomly selected from remaining eligible entries.</Text>
              <Text allowFontScaling={false} style={styles.eligibleCount}>Remaining eligible: {eligibleCount} entries</Text>
              <View style={styles.inputSection}>
                <View style={styles.divider} />
                <Text allowFontScaling={false} style={styles.inputLabel}>Reason for disqualification *</Text>
                <TextInput allowFontScaling={false} style={styles.textInput} placeholder="e.g., No response after 7 days" placeholderTextColor={COLORS.textMuted} value={reason} onChangeText={onReasonChange} multiline numberOfLines={3} textAlignVertical="top" editable={!isRedrawing} />
              </View>
            </View>
            <View style={styles.buttons}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={isRedrawing}>
                <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmButton, !canConfirm && styles.buttonDisabled]} onPress={onConfirm} disabled={!canConfirm}>
                {isRedrawing ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text allowFontScaling={false} style={styles.confirmButtonText}>Redraw</Text>}
              </TouchableOpacity>
            </View>
            {!reason.trim() && <Text allowFontScaling={false} style={styles.helperText}>Enter a reason to enable the Redraw button</Text>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "center", alignItems: "center" },
  container: { backgroundColor: COLORS.surface, marginHorizontal: scale(SPACING.lg), borderRadius: scale(16), width: "90%", maxWidth: 400, maxHeight: "80%" },
  header: { alignItems: "center", padding: scale(SPACING.lg), paddingBottom: scale(SPACING.sm) },
  warningIcon: { fontSize: moderateScale(40), marginBottom: scale(SPACING.sm) },
  title: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text },
  content: { paddingHorizontal: scale(SPACING.lg) },
  description: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, textAlign: "center", marginBottom: scale(SPACING.md) },
  winnerInfo: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center", lineHeight: moderateScale(20) },
  eligibleCount: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.primary, textAlign: "center", marginTop: scale(SPACING.md) },
  inputSection: { marginTop: scale(SPACING.md) },
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: scale(SPACING.md) },
  inputLabel: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.sm) },
  textInput: { backgroundColor: COLORS.background, borderRadius: scale(8), borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, minHeight: 80 },
  buttons: { flexDirection: "row", padding: scale(SPACING.lg), gap: scale(SPACING.sm) },
  cancelButton: { flex: 1, backgroundColor: COLORS.background, paddingVertical: scale(SPACING.md), borderRadius: scale(8), alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  cancelButtonText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  confirmButton: { flex: 1, backgroundColor: COLORS.warning || "#f59e0b", paddingVertical: scale(SPACING.md), borderRadius: scale(8), alignItems: "center" },
  confirmButtonText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  helperText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, textAlign: "center", paddingBottom: scale(SPACING.lg), paddingHorizontal: scale(SPACING.md), fontStyle: "italic" },
});
