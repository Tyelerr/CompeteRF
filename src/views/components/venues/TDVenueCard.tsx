import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { TDVenue } from "../../../viewmodels/useTournamentDirectorVenues";

interface TDVenueCardProps {
  venue: TDVenue;
  onPress?: () => void;
  onCreateTournament?: () => void;
  isProcessing?: boolean;
  showActions?: boolean;
  canCreateTournaments?: boolean;
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

export const TDVenueCard: React.FC<TDVenueCardProps> = ({
  venue,
  onPress,
  onCreateTournament,
  isProcessing = false,
  showActions = true,
  canCreateTournaments = false,
}) => {
  const isArchived = venue.status === "archived";
  const venueData = venue.venues;

  if (!venueData) return null;

  return (
    <TouchableOpacity
      style={[styles.card, isArchived && styles.cardArchived]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={isProcessing}
    >
      {/* Venue Header */}
      <View style={styles.header}>
        <View style={styles.venueIcon}>
          <Text style={styles.venueIconText}>🏢</Text>
        </View>

        <View style={styles.venueInfo}>
          <Text style={[styles.venueName, isArchived && styles.textArchived]}>
            {venueData.venue}
          </Text>
          <Text
            style={[styles.venueAddress, isArchived && styles.textArchived]}
          >
            {venueData.address}
          </Text>
          <Text style={styles.venueLocation}>
            {venueData.city}, {venueData.state} {venueData.zip_code}
          </Text>
        </View>

        {/* Status Badge */}
        {venueData.status && (
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  venueData.status === "active"
                    ? COLORS.success + "20"
                    : COLORS.textSecondary + "20",
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    venueData.status === "active"
                      ? COLORS.success
                      : COLORS.textSecondary,
                },
              ]}
            >
              {venueData.status}
            </Text>
          </View>
        )}
      </View>

      {/* Assignment Info */}
      <View style={styles.assignmentSection}>
        <View style={styles.assignmentRow}>
          <Text style={styles.assignmentLabel}>Assigned:</Text>
          <Text style={styles.assignmentValue}>
            {formatDate(venue.assigned_at)}
          </Text>
        </View>

        {venue.assigned_by_profile && (
          <View style={styles.assignmentRow}>
            <Text style={styles.assignmentLabel}>By:</Text>
            <Text style={styles.assignmentValue}>
              {venue.assigned_by_profile.name ||
                venue.assigned_by_profile.user_name}
            </Text>
          </View>
        )}
      </View>

      {/* Stats Section */}
      <View style={styles.statsSection}>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, isArchived && styles.textArchived]}>
              {venue.tournament_count || 0}
            </Text>
            <Text style={styles.statLabel}>Tournaments</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statValue, isArchived && styles.textArchived]}>
              {venue.active_tournaments || 0}
            </Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statValue, isArchived && styles.textArchived]}>
              {venue.total_views || 0}
            </Text>
            <Text style={styles.statLabel}>Views</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statValue, isArchived && styles.textArchived]}>
              {venue.total_favorites || 0}
            </Text>
            <Text style={styles.statLabel}>Favorites</Text>
          </View>
        </View>

        <View style={styles.lastTournament}>
          <Text style={styles.lastTournamentLabel}>Last Tournament:</Text>
          <Text style={styles.lastTournamentDate}>
            {formatDate(venue.last_tournament_date || null)}
          </Text>
        </View>
      </View>

      {/* Archived Info */}
      {isArchived && venue.archived_at && (
        <View style={styles.archivedInfo}>
          <Text style={styles.archivedTitle}>📦 Assignment Archived</Text>
          <Text style={styles.archivedText}>
            On: {formatDate(venue.archived_at)}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      {showActions && !isArchived && (
        <View style={styles.bottomRow}>
          <View style={styles.contactInfo}>
            {venueData.phone_number && (
              <Text style={styles.phoneNumber}>
                📞 {venueData.phone_number}
              </Text>
            )}
          </View>

          <View style={styles.actionButtons}>
            {canCreateTournaments && onCreateTournament && (
              <TouchableOpacity
                style={[styles.actionButton, styles.createButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  onCreateTournament();
                }}
                disabled={isProcessing}
              >
                <Text
                  style={[styles.actionButtonText, styles.createButtonText]}
                >
                  Create Tournament
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
  venueIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  venueIconText: {
    fontSize: 24,
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 2,
  },
  venueAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  venueLocation: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  textArchived: {
    color: COLORS.textSecondary,
  },
  assignmentSection: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  assignmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  assignmentLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  assignmentValue: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    fontWeight: "600",
  },
  statsSection: {
    marginBottom: SPACING.sm,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  lastTournament: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  lastTournamentLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  lastTournamentDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    fontWeight: "600",
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
  contactInfo: {
    flex: 1,
  },
  phoneNumber: {
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
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
  },
  createButton: {
    backgroundColor: "#10b981", // Green
    borderColor: "#059669",
  },
  createButtonText: {
    color: "#ffffff",
  },
});
