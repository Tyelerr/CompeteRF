import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { useAuth } from "../../../viewmodels/hooks/use.auth";
import { useVenuesByOwner } from "../../../viewmodels/hooks/use.venues";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";

export const BarOwnerDashboardScreen = () => {
  const { profile } = useAuth();
  const { venues, isLoading } = useVenuesByOwner(profile?.id_auto);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>BAR OWNER</Text>
        <Text style={styles.subtitle}>Dashboard</Text>
      </View>

      <View style={styles.stats}>
        <Card>
          <Text style={styles.statNumber}>{venues.length}</Text>
          <Text style={styles.statLabel}>My Venues</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>🏢 MY VENUES</Text>
      {venues.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No venues owned</Text>
        </Card>
      ) : (
        venues.map((venue) => (
          <Card key={venue.id}>
            <Text style={styles.venueName}>{venue.venue}</Text>
            <Text style={styles.venueLocation}>{venue.address}</Text>
            <Text style={styles.venueLocation}>
              {venue.city}, {venue.state} {venue.zip_code}
            </Text>
            <View style={styles.venueActions}>
              <Button
                title="Manage Directors"
                onPress={() => {}}
                variant="outline"
                size="sm"
              />
              <Button
                title="View Tournaments"
                onPress={() => {}}
                variant="outline"
                size="sm"
              />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  stats: {
    flexDirection: "row",
    padding: SPACING.md,
    gap: SPACING.md,
  },
  statNumber: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: "700",
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  venueLocation: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  venueActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
});
