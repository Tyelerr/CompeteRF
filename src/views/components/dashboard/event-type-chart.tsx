import { StyleSheet, Text, View } from "react-native";
import { EventTypeStats } from "../../../models/dashboard-types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface EventTypeChartProps {
  data: EventTypeStats[];
}

export const EventTypeChart = ({ data }: EventTypeChartProps) => {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Event Types</Text>
      {data.length > 0 ? (
        data.map((item) => (
          <View key={item.game_type} style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{item.game_type}</Text>
              <Text style={styles.count}>{item.count}</Text>
            </View>
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.bar,
                  { width: `${(item.count / maxCount) * 100}%` },
                ]}
              />
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No tournaments yet</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    minHeight: 250,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  row: {
    marginBottom: SPACING.md,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  count: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  barContainer: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
  },
  bar: {
    height: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  empty: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    textAlign: "center",
    paddingVertical: SPACING.lg,
  },
});
