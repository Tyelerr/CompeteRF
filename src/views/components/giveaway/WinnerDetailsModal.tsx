import { WinnerHistoryRecord } from "@/src/models/types/giveaway.types";
import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import { moderateScale, scale } from "@/src/utils/scaling";
import { AdminGiveaway, CurrentWinner } from "@/src/viewmodels/useAdminGiveaways";
import React from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

const formatCurrency = (value: number | null): string => {
  if (!value) return "$0";
  return `$${value.toLocaleString()}`;
};

interface WinnerDetailsModalProps {
  visible: boolean;
  giveaway: AdminGiveaway | null;
  currentWinner: CurrentWinner | null;
  winnerHistory: WinnerHistoryRecord[];
  eligibleCount: number;
  loading: boolean;
  onClose: () => void;
  onRedraw: () => void;
}

export const WinnerDetailsModal = ({ visible, giveaway, currentWinner, winnerHistory, eligibleCount, loading, onClose, onRedraw }: WinnerDetailsModalProps) => {
  if (!giveaway) return null;
  const hasHistory = winnerHistory.length > 1;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>🏆 Winner Details</Text>
            <Text allowFontScaling={false} style={styles.giveawayName}>{giveaway.name}</Text>
            <Text allowFontScaling={false} style={styles.prizeValue}>{formatCurrency(giveaway.prize_value)}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text allowFontScaling={false} style={styles.loadingText}>Loading winner details...</Text>
            </View>
          ) : (
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {currentWinner && (
                <View style={styles.winnerSection}>
                  <Text allowFontScaling={false} style={styles.winnerName}>{currentWinner.name}</Text>
                  <Text allowFontScaling={false} style={styles.winnerDetail}>{currentWinner.email}</Text>
                  <Text allowFontScaling={false} style={styles.winnerDetail}>{currentWinner.phone}</Text>
                  <Text allowFontScaling={false} style={styles.drawnAt}>Drawn: {formatDateTime(currentWinner.drawn_at)}</Text>
                </View>
              )}

              {hasHistory && (
                <View style={styles.historySection}>
                  <View style={styles.divider} />
                  <Text allowFontScaling={false} style={styles.historyTitle}>Draw History</Text>
                  <View style={styles.divider} />
                  {winnerHistory.map((record, index) => (
                    <View key={record.id} style={styles.historyItem}>
                      <View style={styles.historyNumber}>
                        <Text allowFontScaling={false} style={styles.historyNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.historyContent}>
                        <View style={styles.historyHeader}>
                          <Text allowFontScaling={false} style={styles.historyName}>{record.user_name}</Text>
                          {record.status === "disqualified" ? (
                            <View style={styles.disqualifiedBadge}><Text allowFontScaling={false} style={styles.disqualifiedBadgeText}>DISQUALIFIED</Text></View>
                          ) : (
                            <View style={styles.winnerBadge}><Text allowFontScaling={false} style={styles.winnerBadgeText}>WINNER ✓</Text></View>
                          )}
                        </View>
                        <Text allowFontScaling={false} style={styles.historyDate}>Drawn: {formatDateTime(record.drawn_at)}</Text>
                        {record.status === "disqualified" && record.disqualified_reason && (
                          <Text allowFontScaling={false} style={styles.historyReason}>Reason: {record.disqualified_reason}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {eligibleCount > 0 && (
                <View style={styles.redrawSection}>
                  <View style={styles.redrawWarning}>
                    <Text allowFontScaling={false} style={styles.redrawWarningIcon}>⚠️</Text>
                    <View style={styles.redrawWarningContent}>
                      <Text allowFontScaling={false} style={styles.redrawWarningTitle}>Winner not responding?</Text>
                      <Text allowFontScaling={false} style={styles.redrawWarningText}>You can redraw a new winner. Previous winner will be marked as "disqualified".</Text>
                      <Text allowFontScaling={false} style={styles.eligibleCount}>Remaining eligible: {eligibleCount} entries</Text>
                    </View>
                  </View>
                </View>
              )}

              {eligibleCount === 0 && (
                <View style={styles.noEligibleSection}>
                  <Text allowFontScaling={false} style={styles.noEligibleText}>No more eligible entries for redraw.</Text>
                </View>
              )}
            </ScrollView>
          )}

          <View style={styles.buttons}>
            {eligibleCount > 0 && !loading && (
              <TouchableOpacity style={styles.redrawButton} onPress={onRedraw}>
                <Text allowFontScaling={false} style={styles.redrawButtonText}>🎲 Redraw Winner</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text allowFontScaling={false} style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "center", alignItems: "center" },
  container: { backgroundColor: COLORS.surface, marginHorizontal: scale(SPACING.lg), borderRadius: scale(16), width: "90%", maxWidth: 400, maxHeight: "80%" },
  header: { alignItems: "center", padding: scale(SPACING.lg), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  giveawayName: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center" },
  prizeValue: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.primary, marginTop: scale(SPACING.xs) },
  loadingContainer: { padding: scale(SPACING.xl), alignItems: "center" },
  loadingText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(SPACING.md) },
  scrollContent: { maxHeight: 400 },
  winnerSection: { alignItems: "center", padding: scale(SPACING.lg) },
  winnerName: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  winnerDetail: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: 2 },
  drawnAt: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, marginTop: scale(SPACING.sm) },
  historySection: { paddingHorizontal: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: scale(SPACING.sm) },
  historyTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.textSecondary, textAlign: "center", marginVertical: scale(SPACING.xs) },
  historyItem: { flexDirection: "row", marginTop: scale(SPACING.md) },
  historyNumber: { width: scale(24), height: scale(24), borderRadius: scale(12), backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center", marginRight: scale(SPACING.sm) },
  historyNumberText: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.textSecondary },
  historyContent: { flex: 1 },
  historyHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: scale(SPACING.xs) },
  historyName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  disqualifiedBadge: { backgroundColor: COLORS.error + "20", paddingHorizontal: scale(SPACING.xs), paddingVertical: 2, borderRadius: 4 },
  disqualifiedBadgeText: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.error },
  winnerBadge: { backgroundColor: COLORS.success + "20", paddingHorizontal: scale(SPACING.xs), paddingVertical: 2, borderRadius: 4 },
  winnerBadgeText: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.success },
  historyDate: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: 2 },
  historyReason: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, fontStyle: "italic", marginTop: 2 },
  redrawSection: { padding: scale(SPACING.lg), paddingTop: 0 },
  redrawWarning: { flexDirection: "row", backgroundColor: (COLORS.warning || "#f59e0b") + "15", borderRadius: scale(12), padding: scale(SPACING.md), borderWidth: 1, borderColor: (COLORS.warning || "#f59e0b") + "30" },
  redrawWarningIcon: { fontSize: moderateScale(20), marginRight: scale(SPACING.sm) },
  redrawWarningContent: { flex: 1 },
  redrawWarningTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginBottom: 4 },
  redrawWarningText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: moderateScale(18) },
  eligibleCount: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.primary, marginTop: scale(SPACING.sm) },
  noEligibleSection: { padding: scale(SPACING.lg), paddingTop: 0 },
  noEligibleText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center", fontStyle: "italic" },
  buttons: { padding: scale(SPACING.lg), paddingTop: scale(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.border, gap: scale(SPACING.sm) },
  redrawButton: { backgroundColor: (COLORS.warning || "#f59e0b") + "20", paddingVertical: scale(SPACING.md), borderRadius: scale(8), alignItems: "center", borderWidth: 1, borderColor: COLORS.warning || "#f59e0b" },
  redrawButtonText: { color: COLORS.warning || "#f59e0b", fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  closeButton: { backgroundColor: COLORS.background, paddingVertical: scale(SPACING.md), borderRadius: scale(8), alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  closeButtonText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
});
