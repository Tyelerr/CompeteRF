import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import { moderateScale, scale } from "@/src/utils/scaling";
import { AdminGiveaway } from "@/src/viewmodels/useAdminGiveaways";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const formatCurrency = (value: number | null): string => {
  if (!value) return "$0";
  return `$${value.toLocaleString()}`;
};

interface WinnerResultModalProps {
  visible: boolean;
  winner: { name: string; email: string; phone: string } | null;
  giveaway: AdminGiveaway | null;
  onClose: () => void;
}

export const WinnerResultModal = ({ visible, winner, giveaway, onClose }: WinnerResultModalProps) => {
  if (!winner || !giveaway) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          <Text allowFontScaling={false} style={styles.title}>🎉 Winner Selected!</Text>
          <Text allowFontScaling={false} style={styles.icon}>🏆</Text>
          <Text allowFontScaling={false} style={styles.winnerName}>{winner.name}</Text>
          <Text allowFontScaling={false} style={styles.winnerDetail}>{winner.email}</Text>
          <Text allowFontScaling={false} style={styles.winnerDetail}>{winner.phone}</Text>
          <Text allowFontScaling={false} style={styles.prize}>Prize: {giveaway.name} ({formatCurrency(giveaway.prize_value)})</Text>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Text allowFontScaling={false} style={styles.doneButtonText}>Done</Text>
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
  winnerName: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  winnerDetail: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: 4 },
  prize: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, marginTop: scale(SPACING.md), fontWeight: "500" },
  buttons: { marginTop: scale(SPACING.lg), width: "100%" },
  doneButton: { backgroundColor: COLORS.background, paddingVertical: scale(SPACING.md), borderRadius: scale(8), alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  doneButtonText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
});
