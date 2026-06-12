import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { ActionMenu, ActionMenuItem } from "../admin/ActionMenu";

interface BarOwnerVenueCardProps {
  venue: {
    id: number;
    venue: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    status: string;
    activeTournaments: number;
    totalDirectors: number;
    totalViews: number;
  };
  onPress: () => void;
  onManageTables?: () => void;
  onManageTeam?: () => void;
  onManageDirectors?: () => void;
}

export const BarOwnerVenueCard = ({
  venue,
  onPress,
  onManageTables,
  onManageTeam,
  onManageDirectors,
}: BarOwnerVenueCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return COLORS.success;
      case "pending": return COLORS.warning;
      case "inactive": return COLORS.textSecondary;
      default: return COLORS.textSecondary;
    }
  };

  const actions: ActionMenuItem[] = [];
  if (onManageTables) actions.push({ label: "Manage Tables", onPress: onManageTables });
  if (onManageTeam) actions.push({ label: "Manage Team", onPress: onManageTeam });
  if (onManageDirectors) actions.push({ label: "Manage Directors", onPress: onManageDirectors });

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.venueName} numberOfLines={1}>{venue.venue}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(venue.status) + "20" }]}>
            <Text style={[styles.statusText, { color: getStatusColor(venue.status) }]}>
              {venue.status}
            </Text>
          </View>
        </View>
        <Text style={styles.address} numberOfLines={1}>{venue.address}</Text>
        <Text style={styles.cityState}>{venue.city}, {venue.state} {venue.zip_code}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{venue.activeTournaments}</Text>
          <Text style={styles.statLabel}>Active Events</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{venue.totalDirectors}</Text>
          <Text style={styles.statLabel}>Directors</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{venue.totalViews}</Text>
          <Text style={styles.statLabel}>Views</Text>
        </View>
      </View>

      {actions.length > 0 && (
        <View style={styles.actions}>
          <ActionMenu items={actions} />
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
  header: { marginBottom: SPACING.md },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  venueName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs / 2, borderRadius: 12 },
  statusText: { fontSize: FONT_SIZES.xs, fontWeight: "600", textTransform: "capitalize" },
  address: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  cityState: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: FONT_SIZES.lg, fontWeight: "700", color: COLORS.primary },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  actions: {},
});