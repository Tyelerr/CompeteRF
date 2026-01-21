import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { useAuth } from "../../../viewmodels/hooks/use.auth";
import { useTournamentsByDirector } from "../../../viewmodels/hooks/use.tournaments";
import { useVenuesByDirector } from "../../../viewmodels/hooks/use.venues";
import { Card } from "../../components/common/card";

export const TDDashboardScreen = () => {
  const { profile } = useAuth();
  const { tournaments, isLoading: tournamentsLoading } =
    useTournamentsByDirector(profile?.id_auto);
  const { venues, isLoading: venuesLoading } = useVenuesByDirector(
    profile?.id_auto,
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TOURNAMENT DIRECTOR</Text>
        <Text style={styles.subtitle}>Dashboard</Text>
      </View>

      <View style={styles.stats}>
        <Card>
          <Text style={styles.statNumber}>{tournaments.length}</Text>
          <Text style={styles.statLabel}>Active Tournaments</Text>
        </Card>
        <Card>
          <Text style={styles.statNumber}>{venues.length}</Text>
          <Text style={styles.statLabel}>Assigned Venues</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>📋 MY TOURNAMENTS</Text>
      {tournaments.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No tournaments yet</Text>
        </Card>
      ) : (
        tournaments.map((tournament) => (
          <Card key={tournament.id}>
            <Text style={styles.tournamentName}>{tournament.name}</Text>
            <Text style={styles.tournamentDate}>
              {tournament.tournament_date}
            </Text>
          </Card>
        ))
      )}

      <Text style={styles.sectionTitle}>🏢 MY VENUES</Text>
      {venues.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No venues assigned</Text>
        </Card>
      ) : (
        venues.map((venue) => (
          <Card key={venue.id}>
            <Text style={styles.venueName}>{venue.venue}</Text>
            <Text style={styles.venueLocation}>
              {venue.city}, {venue.state}
            </Text>
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
  tournamentName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  tournamentDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  venueLocation: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
});
