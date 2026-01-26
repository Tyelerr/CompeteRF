import { WinnerHistoryRecord } from "@/src/models/types/giveaway.types";
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
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatCurrency = (value: number | null): string => {
  if (!value) return "$0";
  return `$${value.toLocaleString()}`;
};

// ============================================
// PROPS
// ============================================

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

// ============================================
// COMPONENT
// ============================================

export const WinnerDetailsModal = ({
  visible,
  giveaway,
  currentWinner,
  winnerHistory,
  eligibleCount,
  loading,
  onClose,
  onRedraw,
}: WinnerDetailsModalProps) => {
  if (!giveaway) return null;

  const hasHistory = winnerHistory.length > 1;
  // DEBUG
  console.log("WinnerDetailsModal data:", {
    eligibleCount,
    hasHistory,
    currentWinner,
    winnerHistoryLength: winnerHistory.length,
    loading,
  });

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>🏆 Winner Details</Text>
            <Text style={styles.giveawayName}>{giveaway.name}</Text>
            <Text style={styles.prizeValue}>
              {formatCurrency(giveaway.prize_value)}
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading winner details...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Current Winner */}
              {currentWinner && (
                <View style={styles.winnerSection}>
                  <Text style={styles.winnerName}>{currentWinner.name}</Text>
                  <Text style={styles.winnerDetail}>{currentWinner.email}</Text>
                  <Text style={styles.winnerDetail}>{currentWinner.phone}</Text>
                  <Text style={styles.drawnAt}>
                    Drawn: {formatDateTime(currentWinner.drawn_at)}
                  </Text>
                </View>
              )}

              {/* Draw History */}
              {hasHistory && (
                <View style={styles.historySection}>
                  <View style={styles.divider} />
                  <Text style={styles.historyTitle}>Draw History</Text>
                  <View style={styles.divider} />

                  {winnerHistory.map((record, index) => (
                    <View key={record.id} style={styles.historyItem}>
                      <View style={styles.historyNumber}>
                        <Text style={styles.historyNumberText}>
                          {index + 1}
                        </Text>
                      </View>
                      <View style={styles.historyContent}>
                        <View style={styles.historyHeader}>
                          <Text style={styles.historyName}>
                            {record.user_name}
                          </Text>
                          {record.status === "disqualified" ? (
                            <View style={styles.disqualifiedBadge}>
                              <Text style={styles.disqualifiedBadgeText}>
                                DISQUALIFIED
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.winnerBadge}>
                              <Text style={styles.winnerBadgeText}>
                                WINNER ✓
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.historyDate}>
                          Drawn: {formatDateTime(record.drawn_at)}
                        </Text>
                        {record.status === "disqualified" &&
                          record.disqualified_reason && (
                            <Text style={styles.historyReason}>
                              Reason: {record.disqualified_reason}
                            </Text>
                          )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Redraw Option */}
              {eligibleCount > 0 && (
                <View style={styles.redrawSection}>
                  <View style={styles.redrawWarning}>
                    <Text style={styles.redrawWarningIcon}>⚠️</Text>
                    <View style={styles.redrawWarningContent}>
                      <Text style={styles.redrawWarningTitle}>
                        Winner not responding?
                      </Text>
                      <Text style={styles.redrawWarningText}>
                        You can redraw a new winner. Previous winner will be
                        marked as "disqualified".
                      </Text>
                      <Text style={styles.eligibleCount}>
                        Remaining eligible: {eligibleCount} entries
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {eligibleCount === 0 && (
                <View style={styles.noEligibleSection}>
                  <Text style={styles.noEligibleText}>
                    No more eligible entries for redraw.
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Buttons */}
          <View style={styles.buttons}>
            {eligibleCount > 0 && !loading && (
              <TouchableOpacity style={styles.redrawButton} onPress={onRedraw}>
                <Text style={styles.redrawButtonText}>🎲 Redraw Winner</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
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
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  header: {
    alignItems: "center",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  giveawayName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  prizeValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  loadingContainer: {
    padding: SPACING.xl,
    alignItems: "center",
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  scrollContent: {
    maxHeight: 400,
  },
  winnerSection: {
    alignItems: "center",
    padding: SPACING.lg,
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
    marginBottom: 2,
  },
  drawnAt: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  historySection: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  historyTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textAlign: "center",
    marginVertical: SPACING.xs,
  },
  historyItem: {
    flexDirection: "row",
    marginTop: SPACING.md,
  },
  historyNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.sm,
  },
  historyNumberText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  historyContent: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  historyName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  disqualifiedBadge: {
    backgroundColor: COLORS.error + "20",
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  disqualifiedBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.error,
  },
  winnerBadge: {
    backgroundColor: COLORS.success + "20",
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  winnerBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.success,
  },
  historyDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  historyReason: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },
  redrawSection: {
    padding: SPACING.lg,
    paddingTop: 0,
  },
  redrawWarning: {
    flexDirection: "row",
    backgroundColor: (COLORS.warning || "#f59e0b") + "15",
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: (COLORS.warning || "#f59e0b") + "30",
  },
  redrawWarningIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  redrawWarningContent: {
    flex: 1,
  },
  redrawWarningTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
  },
  redrawWarningText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  eligibleCount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.primary,
    marginTop: SPACING.sm,
  },
  noEligibleSection: {
    padding: SPACING.lg,
    paddingTop: 0,
  },
  noEligibleText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    fontStyle: "italic",
  },
  buttons: {
    padding: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },
  redrawButton: {
    backgroundColor: (COLORS.warning || "#f59e0b") + "20",
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.warning || "#f59e0b",
  },
  redrawButtonText: {
    color: COLORS.warning || "#f59e0b",
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  closeButton: {
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
