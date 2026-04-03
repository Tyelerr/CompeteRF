import React from "react";
import {
  Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { GroupedDirector } from "../../../models/types/director.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Platform } from "react-native";
import { moderateScale, scale } from "../../../utils/scaling";
const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

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
    padding: wxSc(SPACING.lg),
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(RADIUS.lg),
    padding: wxSc(SPACING.lg),
    width: "100%",
    maxWidth: 420,
  },
  header: { alignItems: "center", marginBottom: wxSc(SPACING.md) },
  title: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: wxSc(SPACING.xs),
  },
  subtitle: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  directorInfo: {
    backgroundColor: COLORS.background,
    borderRadius: wxSc(RADIUS.md),
    padding: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.md),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: wxSc(SPACING.xs),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: wxSc(SPACING.sm),
  },
  rowLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
    flexShrink: 0,
  },
  rowValue: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  venuesList: { flex: 1, alignItems: "flex-end", gap: wxSc(2) },
  venueItem: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fef3c7",
    borderRadius: wxSc(RADIUS.md),
    padding: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.md),
    borderLeftWidth: wxSc(4),
    borderLeftColor: "#f59e0b",
    gap: wxSc(SPACING.sm),
  },
  warningIcon: { fontSize: wxMs(18) },
  warningTitle: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: "#92400e",
    marginBottom: wxSc(2),
  },
  warningText: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: "#92400e",
    lineHeight: wxMs(16),
  },
  inputSection: { marginBottom: wxSc(SPACING.md) },
  inputLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
    marginBottom: wxSc(SPACING.xs),
  },
  optional: { color: COLORS.textMuted, fontWeight: "400" },
  textInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: wxSc(RADIUS.md),
    padding: wxSc(SPACING.md),
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    minHeight: wxSc(80),
  },
  buttonRow: { flexDirection: "row", gap: wxSc(SPACING.sm) },
  cancelButton: {
    flex: 1,
    paddingVertical: wxSc(SPACING.md),
    borderRadius: wxSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.text,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: wxSc(SPACING.md),
    borderRadius: wxSc(RADIUS.md),
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: "#ffffff",
  },
  buttonDisabled: { opacity: 0.55 },
});
