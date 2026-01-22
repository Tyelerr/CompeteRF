import { useRouter } from "expo-router";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { useBarOwnerDashboard } from "../../src/viewmodels/useBarOwnerDashboard";
import { useTDDashboard } from "../../src/viewmodels/useTDDashboard";
import { Button } from "../../src/views/components/common/button";
import { Dropdown } from "../../src/views/components/common/dropdown";
import {
  EventTypeChart,
  PerformanceCard,
  StatCard,
} from "../../src/views/components/dashboard";

export default function AdminScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuthContext();

  if (authLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.title}>Login Required</Text>
        <Text style={styles.subtitle}>
          Please log in to access your dashboard.
        </Text>
        <Button title="Log In" onPress={() => router.push("/auth/login")} />
      </View>
    );
  }

  if (profile?.role === "basic_user") {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🎱</Text>
        <Text style={styles.title}>No Dashboard Access</Text>
        <Text style={styles.subtitle}>
          Dashboards are available for Tournament Directors, Bar Owners, and
          Admins.
        </Text>
        <Button
          title="Become a TD"
          onPress={() => router.push("/(tabs)/faq")}
        />
      </View>
    );
  }

  switch (profile?.role) {
    case "tournament_director":
      return <TDDashboard />;
    case "bar_owner":
      return <BarOwnerDashboard />;
    case "compete_admin":
    case "super_admin":
      return <PlaceholderDashboard title="ADMIN DASHBOARD" emoji="⚙️" />;
    default:
      return null;
  }
}

// ============================================
// TD DASHBOARD (CLEAN MVVM VIEW)
// ============================================
const TDDashboard = () => {
  const router = useRouter();
  const vm = useTDDashboard();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={vm.refreshing}
          onRefresh={vm.onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TD DASHBOARD</Text>
        <Text style={styles.headerSubtitle}>
          Manage your tournaments and venues
        </Text>
      </View>

      {/* Stats Grid - Clickable Cards */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="🏆"
          value={vm.stats.myTournaments}
          label="My Tournaments"
          onPress={() => router.push("/admin/my-tournaments")}
        />
        <StatCard
          icon="✅"
          value={vm.stats.activeEvents}
          label="Active Events"
          onPress={() => router.push("/admin/my-tournaments?filter=active")}
        />
        <StatCard
          icon="🏢"
          value={vm.stats.venues}
          label="My Venues"
          onPress={() => router.push("/admin/my-venues")}
        />
        <StatCard icon="❤️" value={vm.stats.totalFavorites} label="Favorites" />
      </View>

      {/* Analytics Time Filter */}
      <View style={styles.section}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Analytics Period</Text>
          <View style={styles.filterDropdown}>
            <Dropdown
              options={vm.timePeriodOptions}
              value={vm.timePeriod.value}
              onSelect={vm.handleTimePeriodChange}
              placeholder="Select Period"
            />
          </View>
        </View>
      </View>

      {/* Analytics Row */}
      <View style={styles.analyticsRow}>
        <EventTypeChart data={vm.eventTypeStats} />
        <PerformanceCard
          totalViews={vm.stats.totalViews}
          totalFavorites={vm.stats.totalFavorites}
          activeEvents={vm.stats.activeEvents}
        />
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};

// ============================================
// BAR OWNER DASHBOARD
// ============================================
const BarOwnerDashboard = () => {
  const router = useRouter();
  const vm = useBarOwnerDashboard();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={vm.refreshing}
          onRefresh={vm.onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BAR OWNER DASHBOARD</Text>
        <Text style={styles.headerSubtitle}>
          Manage your venues and directors
        </Text>
      </View>

      {/* Stats Grid - Clickable Cards */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="🏢"
          value={vm.stats.totalVenues}
          label="My Venues"
          onPress={() => router.push("/admin/bar-owner-venues" as any)}
        />
        <StatCard
          icon="👤"
          value={vm.stats.totalDirectors}
          label="Directors"
          onPress={() => router.push("/admin/my-directors" as any)}
        />
        <StatCard
          icon="🏆"
          value={vm.stats.activeTournaments}
          label="Active Events"
        />
        <StatCard icon="👁️" value={vm.stats.totalViews} label="Total Views" />
      </View>

      {/* Analytics will go here in future */}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};

// ============================================
// PLACEHOLDER
// ============================================
const PlaceholderDashboard = ({
  title,
  emoji,
}: {
  title: string;
  emoji: string;
}) => (
  <View style={styles.container}>
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{title}</Text>
      <Text style={styles.headerSubtitle}>Coming soon...</Text>
    </View>
    <View style={styles.centerContainer}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.subtitle}>This dashboard is under construction</Text>
    </View>
  </View>
);

// ============================================
// STYLES
// ============================================
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
    padding: SPACING.lg,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  emoji: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  seeAllText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  filterDropdown: {
    flex: 1,
    maxWidth: 160,
    marginLeft: SPACING.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  analyticsRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  quickActions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
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
  },
  venueItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  venueLocation: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  venueStats: {
    alignItems: "flex-end",
  },
  venueStatText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
