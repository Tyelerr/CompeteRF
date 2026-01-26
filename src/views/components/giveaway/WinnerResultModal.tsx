import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import { AdminGiveaway } from "@/src/viewmodels/useAdminGiveaways";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatCurrency = (value: number | null): string => {
  if (!value) return "$0";
  return `$${value.toLocaleString()}`;
};

// ============================================
// PROPS
// ============================================

interface WinnerResultModalProps {
  visible: boolean;
  winner: {
    name: string;
    email: string;
    phone: string;
  } | null;
  giveaway: AdminGiveaway | null;
  onClose: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const WinnerResultModal = ({
  visible,
  winner,
  giveaway,
  onClose,
}: WinnerResultModalProps) => {
  if (!winner || !giveaway) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          <Text style={styles.title}>🎉 Winner Selected!</Text>
          <Text style={styles.icon}>🏆</Text>
          <Text style={styles.winnerName}>{winner.name}</Text>
          <Text style={styles.winnerDetail}>{winner.email}</Text>
          <Text style={styles.winnerDetail}>{winner.phone}</Text>
          <Text style={styles.prize}>
            Prize: {giveaway.name} ({formatCurrency(giveaway.prize_value)})
          </Text>

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>Done</Text>
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
  winnerName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  winnerDetail: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  prize: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    marginTop: SPACING.md,
    fontWeight: "500",
  },
  buttons: {
    marginTop: SPACING.lg,
    width: "100%",
  },
  doneButton: {
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  doneButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
