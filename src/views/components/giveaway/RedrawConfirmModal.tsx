import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import {
  AdminGiveaway,
  CurrentWinner,
} from "@/src/viewmodels/useAdminGiveaways";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// PROPS
// ============================================

interface RedrawConfirmModalProps {
  visible: boolean;
  giveaway: AdminGiveaway | null;
  currentWinner: CurrentWinner | null;
  eligibleCount: number;
  reason: string;
  onReasonChange: (text: string) => void;
  isRedrawing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const RedrawConfirmModal = ({
  visible,
  giveaway,
  currentWinner,
  eligibleCount,
  reason,
  onReasonChange,
  isRedrawing,
  onClose,
  onConfirm,
}: RedrawConfirmModalProps) => {
  if (!giveaway) return null;

  const canConfirm = reason.trim().length > 0 && !isRedrawing;
  const winnerName = currentWinner?.name || "Current winner";

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.container}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: SPACING.lg }}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.title}>Confirm Redraw</Text>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.description}>
                Are you sure you want to redraw?
              </Text>

              <Text style={styles.winnerInfo}>
                Current winner "{winnerName}" will be marked as disqualified and
                a new winner will be randomly selected from remaining eligible
                entries.
              </Text>

              <Text style={styles.eligibleCount}>
                Remaining eligible: {eligibleCount} entries
              </Text>

              {/* Reason Input */}
              <View style={styles.inputSection}>
                <View style={styles.divider} />
                <Text style={styles.inputLabel}>
                  Reason for disqualification *
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., No response after 7 days"
                  placeholderTextColor={COLORS.textMuted}
                  value={reason}
                  onChangeText={onReasonChange}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isRedrawing}
                />
              </View>
            </View>

            {/* Buttons */}
            <View style={styles.buttons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={isRedrawing}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  !canConfirm && styles.buttonDisabled,
                ]}
                onPress={onConfirm}
                disabled={!canConfirm}
              >
                {isRedrawing ? (
                  <ActivityIndicator color={COLORS.text} size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Redraw</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Helper Text */}
            {!reason.trim() && (
              <Text style={styles.helperText}>
                Enter a reason to enable the Redraw button
              </Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    borderRadius: 16,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  header: {
    alignItems: "center",
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  warningIcon: {
    fontSize: 40,
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  content: {
    paddingHorizontal: SPACING.lg,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  winnerInfo: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  eligibleCount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.primary,
    textAlign: "center",
    marginTop: SPACING.md,
  },
  inputSection: {
    marginTop: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    minHeight: 80,
  },
  buttons: {
    flexDirection: "row",
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.warning || "#f59e0b",
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  helperText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: "center",
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
    fontStyle: "italic",
  },
});
