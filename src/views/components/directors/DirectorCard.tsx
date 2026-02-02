import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Director } from "../../../models/types/director.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface DirectorCardProps {
  director: Director;
  onPress?: () => void;
  onRemove?: () => void;
  onRestore?: () => void;
  isProcessing?: boolean;
  showActions?: boolean;
  // Role-based permissions
  canRemove?: boolean;
  canRestore?: boolean;
}

const formatDate = (dateString: string | null): string => {
  if (!dateString) return "Never";

  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

  return date.toLocaleDateString();
};

export const DirectorCard: React.FC<DirectorCardProps> = ({
  director,
  onPress,
  onRemove,
  onRestore,
  isProcessing = false,
  showActions = true,
  canRemove = false,
  canRestore = false,
}) => {
  const isArchived = director.status === "archived";
  const profile = director.profiles;
  const venue = director.venues;

  if (!profile || !venue) return null;

  return (
    <TouchableOpacity
      style={[styles.card, isArchived && styles.cardArchived]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={isProcessing}
    >
      {/* Director Info Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile.name?.charAt(0)?.toUpperCase() ||
              profile.user_name?.charAt(0)?.toUpperCase() ||
              "?"}
          </Text>
        </View>

        <View style={styles.directorInfo}>
          <Text
            style={[styles.directorName, isArchived && styles.textArchived]}
          >
            {profile.name || profile.user_name}
          </Text>
          <Text
            style={[styles.directorEmail, isArchived && styles.textArchived]}
          >
            {profile.email}
          </Text>
          <Text style={styles.directorId}>ID: {profile.id_auto}</Text>
        </View>

        {/* Role Badge */}
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{profile.role?.replace("_", " ")}</Text>
        </View>
      </View>

      {/* Venue Info */}
      <View style={styles.venueSection}>
        <View style={styles.venueHeader}>
          <Text style={styles.venueIcon}>🏢</Text>
          <Text style={[styles.venueName, isArchived && styles.textArchived]}>
            {venue.venue}
          </Text>
        </View>

        <View style={styles.venueDetails}>
          <View style={styles.venueDetailRow}>
            <Text style={styles.venueDetailIcon}>📅</Text>
            <Text style={styles.venueDetailText}>
              {formatDate(director.assigned_at)} (
              {formatDate(director.assigned_at)})
            </Text>
          </View>

          <View style={styles.venueDetailRow}>
            <Text style={styles.venueDetailIcon}>🏆</Text>
            <Text style={styles.venueDetailText}>
              {director.tournament_count || 0} tournaments
            </Text>
          </View>
        </View>
      </View>

      {/* Archived Info */}
      {isArchived && director.archived_at && (
        <View style={styles.archivedInfo}>
          <Text style={styles.archivedTitle}>📦 Archived</Text>
          <Text style={styles.archivedText}>
            On: {formatDate(director.archived_at)}
          </Text>
        </View>
      )}

      {/* Action Buttons - Bottom Right */}
      {showActions && (
        <View style={styles.bottomRow}>
          <View style={styles.statsSection}>
            <Text style={styles.lastTournament}>
              Last: {formatDate(director.last_tournament_date || null)}
            </Text>
          </View>

          <View style={styles.actionButtons}>
            {/* Remove Director Button (Red) */}
            {canRemove && !isArchived && onRemove && (
              <TouchableOpacity
                style={[styles.actionButton, styles.removeButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                disabled={isProcessing}
              >
                <Text
                  style={[styles.actionButtonText, styles.removeButtonText]}
                >
                  Remove Director
                </Text>
              </TouchableOpacity>
            )}

            {/* Restore Director Button (Green) */}
            {canRestore && isArchived && onRestore && (
              <TouchableOpacity
                style={[styles.actionButton, styles.restoreButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  onRestore();
                }}
                disabled={isProcessing}
              >
                <Text
                  style={[styles.actionButtonText, styles.restoreButtonText]}
                >
                  Restore
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

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
    opacity: 0.7,
    borderColor: COLORS.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
  },
  directorInfo: {
    flex: 1,
  },
  directorName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 2,
  },
  directorEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  directorId: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  roleBadge: {
    backgroundColor: COLORS.primary + "20",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  textArchived: {
    color: COLORS.textSecondary,
  },
  venueSection: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  venueHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  venueIcon: {
    fontSize: 16,
    marginRight: SPACING.xs,
  },
  venueName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
  },
  venueDetails: {
    gap: SPACING.xs,
  },
  venueDetailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  venueDetailIcon: {
    fontSize: 12,
    marginRight: SPACING.xs,
    width: 16,
  },
  venueDetailText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    flex: 1,
  },
  archivedInfo: {
    backgroundColor: COLORS.textSecondary + "10",
    borderRadius: 6,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.textSecondary,
  },
  archivedTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },
  archivedText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statsSection: {
    flex: 1,
  },
  lastTournament: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  actionButtons: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  actionButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
  },
  removeButton: {
    backgroundColor: "#ef4444", // Red
    borderColor: "#dc2626",
  },
  removeButtonText: {
    color: "#ffffff",
  },
  restoreButton: {
    backgroundColor: "#10b981", // Green
    borderColor: "#059669",
  },
  restoreButtonText: {
    color: "#ffffff",
  },
});
