import { useRouter } from "expo-router";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useTournamentDirectorDashboard } from "../../../src/viewmodels/useTournamentDirectorDashboard";

// Stats Card Component
const StatsCard = ({
  icon,
  title,
  value,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  value: number | string;
  subtitle?: string;
  onPress?: () => void;
}) => (
  <TouchableOpacity
    style={styles.statsCard}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={styles.statsIcon}>{icon}</Text>
    <Text style={styles.statsValue}>{value}</Text>
    <Text style={styles.statsTitle}>{title}</Text>
    {subtitle && <Text style={styles.statsSubtitle}>{subtitle}</Text>}
  </TouchableOpacity>
);

// Event Type Bar Component
const EventTypeBar = ({
  eventType,
}: {
  eventType: {
    gameType: string;
    count: number;
    percentage: number;
  };
}) => (
  <View style={styles.eventTypeRow}>
    <View style={styles.eventTypeInfo}>
      <Text style={styles.eventTypeName}>
        {eventType.gameType.replace("_", " ")}
      </Text>
      <Text style={styles.eventTypeCount}>{eventType.count}</Text>
    </View>
    <View style={styles.progressBarContainer}>
      <View
        style={[styles.progressBar, { width: `${eventType.percentage}%` }]}
      />
    </View>
  </View>
);

// Time Filter Dropdown Component
const TimeFilterDropdown = ({
  selectedFilter,
  options,
  onSelect,
}: {
  selectedFilter: { label: string; value: string };
  options: { label: string; value: string }[];
  onSelect: (filter: any) => void;
}) => (
  <View style={styles.filterDropdown}>
    <Text style={styles.filterLabel}>Analytics Period</Text>
    <View style={styles.filterButton}>
      <Text style={styles.filterText}>{selectedFilter.label}</Text>
      <Text style={styles.filterArrow}>▼</Text>
    </View>
    {/* Note: In real implementation, this would be a proper dropdown */}
  </View>
);

export default function TDDashboardScreen() {
  const router = useRouter();
  const vm = useTournamentDirectorDashboard();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  const renderContent = () => (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={vm.refreshing}
          onRefresh={vm.onRefresh}
          tintColor={COLORS.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>TD DASHBOARD</Text>
          <Text style={styles.headerSubtitle}>
            Manage your tournaments and venues
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatsCard
          icon="🏆"
          title="My Tournaments"
          value={vm.stats.totalTournaments}
          onPress={() => router.push(vm.navigateToTournaments() as any)}
        />
        <StatsCard
          icon="✅"
          title="Active Events"
          value={vm.stats.activeEvents}
          onPress={() => router.push(vm.navigateToActiveEvents() as any)}
        />
        <StatsCard
          icon="🏢"
          title="My Venues"
          value={vm.stats.totalVenues}
          onPress={() => router.push(vm.navigateToVenues() as any)}
        />
        <StatsCard
          icon="❤️"
          title="Favorites"
          value={vm.performanceMetrics.totalFavorites}
        />
      </View>

      {/* Analytics Period Filter */}
      <TimeFilterDropdown
        selectedFilter={vm.selectedTimeFilter}
        options={vm.timeFilterOptions}
        onSelect={vm.updateTimeFilter}
      />

      {/* Analytics Section */}
      <View style={styles.analyticsSection}>
        <View style={styles.analyticsRow}>
          {/* Event Types */}
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>Event Types</Text>
            <View style={styles.eventTypesList}>
              {vm.eventTypeStats.slice(0, 6).map(
                (
                  eventType: {
                    gameType: string;
                    count: number;
                    percentage: number;
                  },
                  index: number,
                ) => (
                  <EventTypeBar key={index} eventType={eventType} />
                ),
              )}
            </View>
          </View>

          {/* Performance */}
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>Performance</Text>
            <View style={styles.performanceStats}>
              <View style={styles.performanceRow}>
                <Text style={styles.performanceLabel}>Total Views</Text>
                <Text style={styles.performanceValue}>
                  {vm.performanceMetrics.totalViews}
                </Text>
              </View>
              <View style={styles.performanceRow}>
                <Text style={styles.performanceLabel}>Total Favorites</Text>
                <Text style={styles.performanceValue}>
                  {vm.performanceMetrics.totalFavorites}
                </Text>
              </View>
              <View style={styles.performanceRow}>
                <Text style={styles.performanceLabel}>Active Events</Text>
                <Text style={[styles.performanceValue, styles.activeValue]}>
                  {vm.performanceMetrics.activeEvents}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Text style={styles.quickActionsTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push("/(tabs)/submit")}
          >
            <Text style={styles.quickActionIcon}>➕</Text>
            <Text style={styles.quickActionText}>Create Tournament</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push(vm.navigateToTournaments() as any)}
          >
            <Text style={styles.quickActionIcon}>📊</Text>
            <Text style={styles.quickActionText}>Manage Tournaments</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push(vm.navigateToVenues() as any)}
          >
            <Text style={styles.quickActionIcon}>🏢</Text>
            <Text style={styles.quickActionText}>View Venues</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push("/(tabs)/profile")}
          >
            <Text style={styles.quickActionIcon}>👤</Text>
            <Text style={styles.quickActionText}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  return renderContent();
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
    paddingBottom: SPACING.lg,
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
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  placeholder: {
    width: 50,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: SPACING.md,
    gap: SPACING.md,
  },
  statsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    width: "47%",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statsIcon: {
    fontSize: 32,
    marginBottom: SPACING.xs,
  },
  statsValue: {
    fontSize: FONT_SIZES.xl * 1.5,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  statsTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "center",
  },
  statsSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  filterDropdown: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  filterLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: SPACING.xs,
  },
  filterButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  filterText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "600",
  },
  filterArrow: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  analyticsSection: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  analyticsRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  analyticsCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  analyticsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  eventTypesList: {
    gap: SPACING.sm,
  },
  eventTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  eventTypeInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minWidth: 80,
    marginRight: SPACING.sm,
  },
  eventTypeName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    textTransform: "capitalize",
  },
  eventTypeCount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  progressBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  performanceStats: {
    gap: SPACING.md,
  },
  performanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  performanceLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  performanceValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  activeValue: {
    color: COLORS.primary,
  },
  quickActions: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xl * 2,
  },
  quickActionsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },
  quickActionButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    width: "47%",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  quickActionText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "center",
  },
});
