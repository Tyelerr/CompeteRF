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
import { EmptyState } from "../../../../src/views/components/dashboard";
import { TDVenueCard } from "../../../../src/views/components/venues/TDVenueCard";

const StatusTab = ({
  label,
  count,
  isActive,
  onPress,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    style={[styles.statusTab, isActive && styles.statusTabActive]}
    onPress={onPress}
  >
    <Text
      style={[styles.statusTabText, isActive && styles.statusTabTextActive]}
    >
      {label}
    </Text>
    <Text
      style={[styles.statusTabCount, isActive && styles.statusTabCountActive]}
    >
      {count}
    </Text>
  </TouchableOpacity>
);

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
      onPress={() => vm.handleVenuePress(item)}
      onCreateTournament={() => vm.handleCreateTournament(item)}
      isProcessing={false}
      showActions={true}
      canCreateTournaments={vm.canCreateTournaments}
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
        <Text style={styles.headerTitle}>My Venues</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{vm.stats.totalVenues}</Text>
            <Text style={styles.statLabel}>Total Venues</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{vm.stats.totalTournaments}</Text>
            <Text style={styles.statLabel}>Total Tournaments</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{vm.stats.activeTournaments}</Text>
            <Text style={styles.statLabel}>Active Events</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by venue name, city, or state..."
          placeholderTextColor={COLORS.textMuted}
          value={vm.filters.search}
          onChangeText={vm.updateSearch}
        />
      </View>

      {/* Status Tabs */}
      <View style={styles.statusTabs}>
        <StatusTab
          label="Active"
          count={vm.statusCounts.active}
          isActive={vm.filters.status === "active"}
          onPress={() => vm.updateStatusFilter("active")}
        />
        <StatusTab
          label="Archived"
          count={vm.statusCounts.archived}
          isActive={vm.filters.status === "archived"}
          onPress={() => vm.updateStatusFilter("archived")}
        />
        <StatusTab
          label="All"
          count={vm.statusCounts.all}
          isActive={vm.filters.status === "all"}
          onPress={() => vm.updateStatusFilter("all")}
        />
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerIcon}>ℹ️</Text>
        <Text style={styles.infoBannerText}>
          These are venues where you have been assigned as a tournament
          director. You can create tournaments at these locations.
        </Text>
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
          <EmptyState
            message={
              vm.filters.status === "active"
                ? "No active venue assignments"
                : vm.filters.status === "archived"
                  ? "No archived venue assignments"
                  : "No venue assignments found"
            }
            submessage={
              vm.filters.search
                ? "Try adjusting your search terms"
                : "Venue assignments will appear here when added by venue owners or admins"
            }
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Help Text */}
      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>Need access to a venue?</Text>
        <Text style={styles.helpText}>
          Contact the venue owner or an administrator to request tournament
          director access.
        </Text>
      </View>
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
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  placeholder: {
    width: 50,
  },
  statsContainer: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
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
  statusTabs: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: 8,
    padding: SPACING.xs,
    gap: SPACING.xs,
  },
  statusTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 6,
    alignItems: "center",
  },
  statusTabActive: {
    backgroundColor: COLORS.primary,
  },
  statusTabText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  statusTabTextActive: {
    color: COLORS.white,
  },
  statusTabCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusTabCountActive: {
    color: COLORS.white,
    opacity: 0.8,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.primary + "10",
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  infoBannerIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
  },
  infoBannerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    flex: 1,
    lineHeight: 20,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 3,
  },
  helpSection: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  helpTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  helpText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
});
