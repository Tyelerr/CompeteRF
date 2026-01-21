import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface PerformanceCardProps {
  totalViews: number;
  totalFavorites: number;
  activeEvents: number;
}

export const PerformanceCard = ({
  totalViews,
  totalFavorites,
  activeEvents,
}: PerformanceCardProps) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Performance</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Total Views</Text>
        <Text style={styles.value}>{totalViews}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Total Favorites</Text>
        <Text style={styles.value}>{totalFavorites}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Active Events</Text>
        <Text style={[styles.value, styles.valueHighlight]}>
          {activeEvents}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  valueHighlight: {
    color: COLORS.primary,
  },
});
