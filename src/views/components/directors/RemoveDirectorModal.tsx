import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Director } from "../../../models/types/director.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface RemoveDirectorModalProps {
  visible: boolean;
  director: Director | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export const RemoveDirectorModal: React.FC<RemoveDirectorModalProps> = ({
  visible,
  director,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  isProcessing = false,
}) => {
  if (!director) return null;

  const handleConfirm = () => {
    if (!reason.trim()) {
      // You could add validation here or make reason optional
    }
    onConfirm();
  };

  const handleCancel = () => {
    onReasonChange("");
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Remove Director</Text>
            <Text style={styles.subtitle}>
              Are you sure you want to remove this director?
            </Text>
          </View>

          {/* Director Info */}
          <View style={styles.directorInfo}>
            <View style={styles.directorRow}>
              <Text style={styles.directorLabel}>Director:</Text>
              <Text style={styles.directorValue}>
                {director.profiles?.name || director.profiles?.user_name}
              </Text>
            </View>
            <View style={styles.directorRow}>
              <Text style={styles.directorLabel}>Email:</Text>
              <Text style={styles.directorValue}>
                {director.profiles?.email}
              </Text>
            </View>
            <View style={styles.directorRow}>
              <Text style={styles.directorLabel}>Venue:</Text>
              <Text style={styles.directorValue}>{director.venues?.venue}</Text>
            </View>
            <View style={styles.directorRow}>
              <Text style={styles.directorLabel}>Tournaments:</Text>
              <Text style={styles.directorValue}>
                {director.tournament_count || 0} tournaments
              </Text>
            </View>
          </View>

          {/* Warning */}
          <View style={styles.warning}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Important</Text>
              <Text style={styles.warningText}>
                The director will no longer be able to create tournaments at
                this venue. This action can be reversed later if needed.
              </Text>
            </View>
          </View>

          {/* Reason Input (Optional) */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>
              Removal Reason <Text style={styles.optional}>(Optional)</Text>
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="Why are you removing this director?"
              placeholderTextColor={COLORS.textMuted}
              value={reason}
              onChangeText={onReasonChange}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={isProcessing}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmButton,
                isProcessing && styles.buttonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={isProcessing}
            >
              <Text style={styles.confirmButtonText}>
                {isProcessing ? "Removing..." : "Remove Director"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    width: "100%",
    maxWidth: 400,
  },
  header: {
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  directorInfo: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  directorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.xs,
  },
  directorLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "500",
    flex: 1,
  },
  directorValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "600",
    flex: 2,
    textAlign: "right",
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fef3c7", // Yellow background
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b", // Orange border
  },
  warningIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: "#92400e", // Dark orange text
    marginBottom: SPACING.xs,
  },
  warningText: {
    fontSize: FONT_SIZES.xs,
    color: "#92400e", // Dark orange text
    lineHeight: 16,
  },
  inputSection: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  optional: {
    color: COLORS.textMuted,
    fontWeight: "400",
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    minHeight: 80,
  },
  buttonRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: "#ef4444", // Red
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: "#ffffff",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
