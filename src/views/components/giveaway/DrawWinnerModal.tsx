import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import { AdminGiveaway } from "@/src/viewmodels/useAdminGiveaways";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// PROPS
// ============================================

interface DrawWinnerModalProps {
  visible: boolean;
  giveaway: AdminGiveaway | null;
  isProcessing: boolean;
  onClose: () => void;
  onDraw: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const DrawWinnerModal = ({
  visible,
  giveaway,
  isProcessing,
  onClose,
  onDraw,
}: DrawWinnerModalProps) => {
  if (!giveaway) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Draw Winner</Text>
          <Text style={styles.icon}>🎲</Text>
          <Text style={styles.giveawayName}>"{giveaway.name}"</Text>
          <Text style={styles.entries}>
            {giveaway.entry_count || 0} eligible entries
          </Text>
          <Text style={styles.warning}>
            Are you sure you want to draw a winner?{"\n"}This action cannot be
            undone.
          </Text>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isProcessing}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                isProcessing && styles.buttonDisabled,
              ]}
              onPress={onDraw}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color={COLORS.text} size="small" />
              ) : (
                <Text style={styles.confirmButtonText}>Draw Winner</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    padding: SPACING.lg,
    alignItems: "center",
    width: "90%",
    maxWidth: 400,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  icon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  giveawayName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
    textAlign: "center",
  },
  entries: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  warning: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.sm,
    width: "100%",
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
    backgroundColor: COLORS.primary,
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
    opacity: 0.6,
  },
});
