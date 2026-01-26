import React from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Giveaway } from "../../../models/types/giveaway.types";

interface GiveawayDetailModalProps {
  visible: boolean;
  giveaway: Giveaway | null;
  isEntered: boolean;
  daysRemaining: string;
  onClose: () => void;
  onEnter: () => void;
}

export function GiveawayDetailModal({
  visible,
  giveaway,
  isEntered,
  daysRemaining,
  onClose,
  onEnter,
}: GiveawayDetailModalProps) {
  if (!giveaway) return null;

  const entryCount = giveaway.entry_count || 0;
  const maxEntries = giveaway.max_entries || 0;
  const progressPercent =
    maxEntries > 0 ? Math.min((entryCount / maxEntries) * 100, 100) : 0;

  const formatValue = (value: number | null): string => {
    if (!value) return "";
    return `$${value.toLocaleString()}`;
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "No end date";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Giveaway Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Image */}
            <View style={styles.imageContainer}>
              {giveaway.image_url ? (
                <Image
                  source={{ uri: giveaway.image_url }}
                  style={styles.image}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.imagePlaceholderText}>🎁</Text>
                </View>
              )}
            </View>

            {/* Title & Value */}
            <View style={styles.titleRow}>
              <Text style={styles.name}>{giveaway.name}</Text>
              {giveaway.prize_value && (
                <Text style={styles.value}>
                  {formatValue(giveaway.prize_value)} Value
                </Text>
              )}
            </View>

            {/* Description */}
            {giveaway.description && (
              <Text style={styles.description}>{giveaway.description}</Text>
            )}

            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Entries:</Text>
                <Text style={styles.statValue}>
                  {entryCount} / {maxEntries || "Unlimited"}
                </Text>
              </View>

              {maxEntries > 0 && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBackground}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progressPercent}%` },
                      ]}
                    />
                  </View>
                </View>
              )}

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Ends:</Text>
                <Text style={styles.statValue}>{formatDate(giveaway.end_date)}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Status:</Text>
                <Text style={[styles.statValue, styles.statusText]}>
                  {daysRemaining}
                </Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Min Age:</Text>
                <Text style={styles.statValue}>{giveaway.min_age}+</Text>
              </View>
            </View>

            {/* Rules Preview */}
            {giveaway.rules_text && (
              <View style={styles.rulesPreview}>
                <Text style={styles.rulesTitle}>Official Rules</Text>
                <Text style={styles.rulesText} numberOfLines={6}>
                  {giveaway.rules_text}
                </Text>
                <Text style={styles.rulesMore}>
                  Full rules shown when entering...
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Buttons */}
          <View style={styles.bottomButtons}>
            <TouchableOpacity
              style={[styles.enterButton, isEntered && styles.enteredButton]}
              onPress={onEnter}
              disabled={isEntered}
            >
              <Text
                style={[
                  styles.enterButtonText,
                  isEntered && styles.enteredButtonText,
                ]}
              >
                {isEntered ? "Already Entered ✓" : "Enter Giveaway"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeButtonText: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.textSecondary,
  },
  scrollView: {
    padding: SPACING.md,
  },
  imageContainer: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.md,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: {
    fontSize: 60,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  name: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  value: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.primary,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 22,
  },
  statsContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
  },
  statValue: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "500",
  },
  statusText: {
    color: COLORS.primary,
  },
  progressContainer: {
    marginBottom: SPACING.sm,
  },
  progressBackground: {
    height: 8,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  rulesPreview: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  rulesTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  rulesText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  rulesMore: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    fontStyle: "italic",
  },
  bottomButtons: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: "row",
    gap: SPACING.sm,
  },
  enterButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
  },
  enteredButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  enterButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  enteredButtonText: {
    color: COLORS.textMuted,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
