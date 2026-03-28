import React from "react";
import {
  Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { GroupedDirector } from "../../../models/types/director.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

interface RemoveDirectorModalProps {
  visible: boolean;
  director: GroupedDirector | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export const RemoveDirectorModal: React.FC<RemoveDirectorModalProps> = ({
  visible, director, reason, onReasonChange, onCancel, onConfirm, isProcessing = false,
}) => {
  if (!director) return null;

  const activeVenues = director.assignments.filter((a) => a.status === "active");

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>Remove Director</Text>
            <Text allowFontScaling={false} style={styles.subtitle}>
              This will remove them from all {activeVenues.length} venue{activeVenues.length !== 1 ? "s" : ""}.
            </Text>
          </View>

          <View style={styles.directorInfo}>
            <View style={styles.row}>
              <Text allowFontScaling={false} style={styles.rowLabel}>Director</Text>
              <Text allowFontScaling={false} style={styles.rowValue}>
                {director.profile.name || director.profile.user_name}
              </Text>
            </View>
            <View style={styles.row}>
              <Text allowFontScaling={false} style={styles.rowLabel}>Email</Text>
              <Text allowFontScaling={false} style={styles.rowValue}>{director.profile.email}</Text>
            </View>
            <View style={styles.row}>
              <Text allowFontScaling={false} style={styles.rowLabel}>Venues</Text>
              <View style={styles.venuesList}>
                {activeVenues.map((a) => (
                  <Text allowFontScaling={false} key={a.id} style={styles.venueItem}>
                    🏢 {a.venue_name}
                  </Text>
                ))}
              </View>
            </View>
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Text allowFontScaling={false} style={styles.rowLabel}>Tournaments</Text>
              <Text allowFontScaling={false} style={styles.rowValue}>
                {director.total_tournaments} total
              </Text>
            </View>
          </View>

          <View style={styles.warning}>
            <Text allowFontScaling={false} style={styles.warningIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={styles.warningTitle}>Important</Text>
              <Text allowFontScaling={false} style={styles.warningText}>
                This director will no longer be able to create tournaments at any of your venues. This can be reversed later.
              </Text>
            </View>
          </View>

          <View style={styles.inputSection}>
            <Text allowFontScaling={false} style={styles.inputLabel}>
              Reason <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              allowFontScaling={false}
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

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={isProcessing}>
              <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, isProcessing && styles.buttonDisabled]}
              onPress={onConfirm}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.confirmButtonText}>
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: scale(SPACING.lg),
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(RADIUS.lg),
    padding: scale(SPACING.lg),
    width: "100%",
    maxWidth: 420,
  },
  header: { alignItems: "center", marginBottom: scale(SPACING.md) },
  title: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: scale(SPACING.xs),
  },
  subtitle: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  directorInfo: {
    backgroundColor: COLORS.background,
    borderRadius: scale(RADIUS.md),
    padding: scale(SPACING.md),
    marginBottom: scale(SPACING.md),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: scale(SPACING.xs),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: scale(SPACING.sm),
  },
  rowLabel: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
    flexShrink: 0,
  },
  rowValue: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  venuesList: { flex: 1, alignItems: "flex-end", gap: scale(2) },
  venueItem: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fef3c7",
    borderRadius: scale(RADIUS.md),
    padding: scale(SPACING.md),
    marginBottom: scale(SPACING.md),
    borderLeftWidth: scale(4),
    borderLeftColor: "#f59e0b",
    gap: scale(SPACING.sm),
  },
  warningIcon: { fontSize: moderateScale(18) },
  warningTitle: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
    color: "#92400e",
    marginBottom: scale(2),
  },
  warningText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: "#92400e",
    lineHeight: moderateScale(16),
  },
  inputSection: { marginBottom: scale(SPACING.md) },
  inputLabel: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
    marginBottom: scale(SPACING.xs),
  },
  optional: { color: COLORS.textMuted, fontWeight: "400" },
  textInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(RADIUS.md),
    padding: scale(SPACING.md),
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    minHeight: scale(80),
  },
  buttonRow: { flexDirection: "row", gap: scale(SPACING.sm) },
  cancelButton: {
    flex: 1,
    paddingVertical: scale(SPACING.md),
    borderRadius: scale(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.text,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: scale(SPACING.md),
    borderRadius: scale(RADIUS.md),
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
    color: "#ffffff",
  },
  buttonDisabled: { opacity: 0.55 },
});
