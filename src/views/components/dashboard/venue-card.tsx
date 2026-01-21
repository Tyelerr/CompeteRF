import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { VenueWithStats } from "../../../models/dashboard-types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface VenueCardProps {
  venue: VenueWithStats;
  onPress?: () => void;
}

export const VenueCard = ({ venue, onPress }: VenueCardProps) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.info}>
        <Text style={styles.name}>{venue.venue}</Text>
        <Text style={styles.address}>
          {venue.address}, {venue.city}, {venue.state}
        </Text>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{venue.activeTournaments}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{venue.totalFavorites}</Text>
          <Text style={styles.statLabel}>Favs</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  address: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  stats: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  stat: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
});
