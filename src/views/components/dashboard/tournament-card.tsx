import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TournamentWithStats } from "../../../models/dashboard-types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface TournamentCardProps {
  tournament: TournamentWithStats;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export const TournamentCard = ({
  tournament,
  onPress,
  onEdit,
  onDelete,
  showActions = false,
}: TournamentCardProps) => {
  const getStatusStyle = () => {
    switch (tournament.status) {
      case "active":
        return styles.statusActive;
      case "completed":
        return styles.statusCompleted;
      case "cancelled":
        return styles.statusCancelled;
      default:
        return {};
    }
  };

  const getStatusLabel = () => {
    if (tournament.status === "cancelled") return "Deleted";
    return tournament.status;
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {/* Header Row */}
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {tournament.name}
        </Text>
        <View style={[styles.statusBadge, getStatusStyle()]}>
          <Text style={styles.statusText}>{getStatusLabel()}</Text>
        </View>
      </View>

      {/* Venue */}
      <Text style={styles.venue}>{tournament.venue_name}</Text>

      {/* Date & Time */}
      <View style={styles.dateTimeRow}>
        <Text style={styles.dateTime}>📅 {tournament.tournament_date}</Text>
        <Text style={styles.dateTime}>🕐 {tournament.start_time}</Text>
      </View>

      {/* Game Info */}
      <View style={styles.gameInfoRow}>
        <View style={styles.gameTypeBadge}>
          <Text style={styles.gameTypeText}>🎱 {tournament.game_type}</Text>
        </View>
        <View style={styles.formatBadge}>
          <Text style={styles.formatText}>{tournament.tournament_format}</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statsLeft}>
          <View style={styles.stat}>
            <Text style={styles.statIcon}>👁</Text>
            <Text style={styles.statValue}>{tournament.views_count}</Text>
            <Text style={styles.statLabel}>views</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statIcon}>❤️</Text>
            <Text style={styles.statValue}>{tournament.favorites_count}</Text>
            <Text style={styles.statLabel}>favorites</Text>
          </View>
        </View>

        {/* Action Icons - Bottom Right */}
        {showActions && tournament.status !== "cancelled" && (
          <View style={styles.actionIcons}>
            {onEdit && (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onEdit();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.icon}>✏️</Text>
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onDelete();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.icon}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  name: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.border,
  },
  statusActive: {
    backgroundColor: COLORS.primary,
  },
  statusCompleted: {
    backgroundColor: COLORS.info,
  },
  statusCancelled: {
    backgroundColor: COLORS.error,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.white,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  venue: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: SPACING.lg,
    marginBottom: SPACING.md,
  },
  dateTime: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  gameInfoRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  gameTypeBadge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  gameTypeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  formatBadge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  formatText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  statsLeft: {
    flexDirection: "row",
    gap: SPACING.xl,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  statIcon: {
    fontSize: 16,
  },
  statValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  actionIcons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  iconButton: {
    padding: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
  },
  icon: {
    fontSize: 22,
  },
});
