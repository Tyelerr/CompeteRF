import { useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useTournamentDirectorVenues } from "../../../../src/viewmodels/useTournamentDirectorVenues";

// TD Venue Card Component (bar owner style but read-only)
const TDVenueCard = ({
  venue,
  onPress,
}: {
  venue: any;
  onPress: () => void;
}) => {
  if (!venue.venues) return null;

  const venueData = venue.venues;

  return (
    <TouchableOpacity
      style={styles.venueCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.venueName}>{venueData.venue}</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>TD</Text>
        </View>
      </View>

      {/* Address */}
      <Text style={styles.address}>{venueData.address}</Text>
      <Text style={styles.location}>
        {venueData.city}, {venueData.state} {venueData.zip_code}
      </Text>

      {/* Stats Row - Black background like bar owner cards */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{venue.tournament_count || 0}</Text>
          <Text style={styles.statLabel}>Tournaments</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{venue.active_tournaments || 0}</Text>
          <Text style={styles.statLabel}>Active Events</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{venue.total_views || 0}</Text>
          <Text style={styles.statLabel}>Views</Text>
        </View>
      </View>

      {/* Assignment Info */}
      <View style={styles.roleSection}>
        <Text style={styles.roleText}>
          🎯 Tournament Director - Assigned{" "}
          {new Date(venue.assigned_at).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default function TDVenuesScreen() {
  const router = useRouter();
  const vm = useTournamentDirectorVenues();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading venues...</Text>
      </View>
    );
  }

  const renderVenue = ({ item }: { item: any }) => (
    <TDVenueCard
      venue={item}
      onPress={() => {
        // Navigate to venue details (read-only)
        console.log("View venue details:", item);
      }}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Venues</Text>
          <Text style={styles.headerSubtitle}>
            Venues where you're assigned as TD
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search venues..."
          placeholderTextColor={COLORS.textMuted}
          value={vm.filters.search}
          onChangeText={vm.updateSearch}
        />
      </View>

      {/* Venues List */}
      <FlatList
        data={vm.venues}
        renderItem={renderVenue}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏢</Text>
            <Text style={styles.emptyTitle}>No venue assignments</Text>
            <Text style={styles.emptyText}>
              Venue assignments will appear here when added by venue owners or
              admins
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  placeholder: {
    width: 50,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  venueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  venueName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  statusBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.white,
  },
  address: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  location: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  statsRow: {
    backgroundColor: "#000000",
    borderRadius: 8,
    flexDirection: "row",
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.white,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.white,
    opacity: 0.7,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.white,
    opacity: 0.2,
    marginVertical: SPACING.xs,
  },
  roleSection: {
    backgroundColor: COLORS.primary + "10",
    borderRadius: 6,
    padding: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  roleText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "500",
    textAlign: "center",
  },
  emptyState: {
    alignItems: "center",
    padding: SPACING.xl * 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
