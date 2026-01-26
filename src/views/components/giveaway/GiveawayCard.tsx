import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import { AdminGiveaway } from "@/src/viewmodels/useAdminGiveaways";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatDate = (dateString: string | null): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatCurrency = (value: number | null): string => {
  if (!value) return "$0";
  return `$${value.toLocaleString()}`;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case "active":
      return COLORS.success;
    case "ended":
      return COLORS.warning || "#f59e0b";
    case "awarded":
      return COLORS.primary;
    case "archived":
      return COLORS.textSecondary;
    default:
      return COLORS.textSecondary;
  }
};

// ============================================
// PROPS
// ============================================

interface GiveawayCardProps {
  giveaway: AdminGiveaway;
  daysRemaining: string;
  isProcessing: boolean;
  onEdit: () => void;
  onEnd: () => void;
  onDraw: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onViewWinner: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const GiveawayCard = ({
  giveaway,
  daysRemaining,
  isProcessing,
  onEdit,
  onEnd,
  onDraw,
  onArchive,
  onRestore,
  onViewWinner,
}: GiveawayCardProps) => {
  const statusColor = getStatusColor(giveaway.status);
  const isActive = giveaway.status === "active";
  const isEnded = giveaway.status === "ended";
  const isAwarded = giveaway.status === "awarded";
  const isArchived = giveaway.status === "archived";

  const entryCount = giveaway.entry_count || 0;
  const maxEntries = giveaway.max_entries || 0;
  const progressPercent =
    maxEntries > 0 ? Math.min((entryCount / maxEntries) * 100, 100) : 0;

  return (
    <View style={[styles.card, isArchived && styles.cardArchived]}>
      {/* Status Badge & Value */}
      <View style={styles.cardHeader}>
        <View
          style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {giveaway.status.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.prizeValue}>
          {formatCurrency(giveaway.prize_value)}
        </Text>
      </View>

      {/* Content Row */}
      <View style={styles.cardContent}>
        {/* Image */}
        <View style={styles.imageContainer}>
          {giveaway.image_url ? (
            <Image
              source={{ uri: giveaway.image_url }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>🎁</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text
            style={[styles.giveawayName, isArchived && styles.textMuted]}
            numberOfLines={1}
          >
            {giveaway.name}
          </Text>

          {giveaway.description && (
            <Text style={styles.description} numberOfLines={1}>
              {giveaway.description}
            </Text>
          )}

          <Text style={styles.entries}>
            {entryCount}/{maxEntries || "∞"} entries
          </Text>

          {/* Progress Bar */}
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

          {/* Status Info */}
          {isActive && <Text style={styles.statusInfo}>{daysRemaining}</Text>}
          {isEnded && (
            <Text style={styles.statusInfo}>
              Ended {formatDate(giveaway.ended_at)}
            </Text>
          )}
          {isAwarded && giveaway.winner_name && (
            <Text style={styles.winnerInfo}>
              🏆 Winner: {giveaway.winner_name}
            </Text>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {/* Edit - always available except archived */}
        {!isArchived && (
          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={onEdit}
            disabled={isProcessing}
          >
            <Text style={styles.editButtonText}>✏️ Edit</Text>
          </TouchableOpacity>
        )}

        {/* Active: End Early */}
        {isActive && (
          <TouchableOpacity
            style={[styles.actionButton, styles.endButton]}
            onPress={onEnd}
            disabled={isProcessing}
          >
            <Text style={styles.endButtonText}>
              {isProcessing ? "..." : "⏹️ End"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Ended: Draw Winner, Archive */}
        {isEnded && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.drawButton]}
              onPress={onDraw}
              disabled={isProcessing}
            >
              <Text style={styles.drawButtonText}>
                {isProcessing ? "..." : "🎲 Draw"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.archiveButton]}
              onPress={onArchive}
              disabled={isProcessing}
            >
              <Text style={styles.archiveButtonText}>
                {isProcessing ? "..." : "🗄️ Archive"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Awarded: View Winner, Archive */}
        {isAwarded && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.viewWinnerButton]}
              onPress={onViewWinner}
            >
              <Text style={styles.viewWinnerButtonText}>👁️ Winner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.archiveButton]}
              onPress={onArchive}
              disabled={isProcessing}
            >
              <Text style={styles.archiveButtonText}>
                {isProcessing ? "..." : "🗄️ Archive"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Archived: Restore */}
        {isArchived && (
          <TouchableOpacity
            style={[styles.actionButton, styles.restoreButton]}
            onPress={onRestore}
            disabled={isProcessing}
          >
            <Text style={styles.restoreButtonText}>
              {isProcessing ? "..." : "♻️ Restore"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardArchived: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
  },
  prizeValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.primary,
  },
  cardContent: {
    flexDirection: "row",
  },
  imageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: COLORS.background,
    marginRight: SPACING.md,
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
    fontSize: 32,
  },
  cardInfo: {
    flex: 1,
  },
  giveawayName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },
  textMuted: {
    color: COLORS.textSecondary,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  entries: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  progressContainer: {
    marginBottom: 4,
  },
  progressBackground: {
    height: 4,
    backgroundColor: COLORS.background,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  statusInfo: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  winnerInfo: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.xs,
  },
  actionButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  editButton: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  editButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  endButton: {
    backgroundColor: (COLORS.warning || "#f59e0b") + "20",
    borderColor: COLORS.warning || "#f59e0b",
  },
  endButtonText: {
    color: COLORS.warning || "#f59e0b",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  drawButton: {
    backgroundColor: COLORS.success + "20",
    borderColor: COLORS.success,
    flex: 1,
  },
  drawButtonText: {
    color: COLORS.success,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  archiveButton: {
    backgroundColor: COLORS.textSecondary + "20",
    borderColor: COLORS.textSecondary,
  },
  archiveButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  restoreButton: {
    backgroundColor: COLORS.success + "20",
    borderColor: COLORS.success,
    flex: 1,
  },
  restoreButtonText: {
    color: COLORS.success,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  viewWinnerButton: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
    flex: 1,
  },
  viewWinnerButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});
