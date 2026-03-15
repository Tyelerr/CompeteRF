// app/(tabs)/admin/index.tsx

import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useBarOwnerDashboard } from "../../../src/viewmodels/useBarOwnerDashboard";
import { useCompeteAdminDashboard } from "../../../src/viewmodels/useCompeteAdminDashboard";
import { useSuperAdminDashboard } from "../../../src/viewmodels/useSuperAdminDashboard";
import { useTDDashboard } from "../../../src/viewmodels/useTDDashboard";
import { Button } from "../../../src/views/components/common/button";
import { Dropdown } from "../../../src/views/components/common/dropdown";
import {
  EventTypeChart,
  PerformanceCard,
  StatCard,
} from "../../../src/views/components/dashboard";

const isWeb = Platform.OS === "web";

// ─── Root router ─────────────────────────────────────────────────────────────

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
      return <CompeteAdminDashboard />;
    case "super_admin":
      return <SuperAdminDashboard />;
    default:
      return null;
  }
}

// ─── Management Card ──────────────────────────────────────────────────────────

interface ManagementCardProps {
  icon: string;
  label: string;
  value?: number;
  subtitle?: string;
  onPress: () => void;
}

const ManagementCard = ({
  icon,
  label,
  value,
  subtitle,
  onPress,
}: ManagementCardProps) => {
  const [hovered, setHovered] = useState(false);
  return (
    <TouchableOpacity
      style={[
        styles.managementCard,
        isWeb ? styles.managementCardWeb : styles.managementCardMobile,
        // @ts-ignore — web only
        isWeb && {
          // @ts-ignore — web only
          transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
          // @ts-ignore — web only
          cursor: "pointer",
        },
        isWeb && hovered && {
          borderColor: COLORS.primary,
          transform: [{ scale: 1.02 }],
          // @ts-ignore — web only
          boxShadow: `0 8px 32px 0 ${COLORS.primary}55`,
        },
      ]}
      onPress={onPress}
      // @ts-ignore — web only
      onMouseEnter={() => isWeb && setHovered(true)}
      // @ts-ignore — web only
      onMouseLeave={() => isWeb && setHovered(false)}
    >
      <Text style={styles.managementIcon}>{icon}</Text>
      {value !== undefined && (
        <Text style={[
          styles.managementValue,
          isWeb && hovered && { color: COLORS.primary },
        ]}>{value.toLocaleString()}</Text>
      )}
      <Text style={[
        styles.managementLabel,
        isWeb && hovered && { color: COLORS.primary },
      ]}>{label}</Text>
      {subtitle && <Text style={styles.managementSubtitle}>{subtitle}</Text>}
    </TouchableOpacity>
  );
};

// ─── Shared inner wrapper ─────────────────────────────────────────────────────

const DashboardInner = ({ children }: { children: React.ReactNode }) =>
  isWeb ? <View style={styles.webInner}>{children}</View> : <>{children}</>;

// ─── TD Dashboard ─────────────────────────────────────────────────────────────

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
      contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        )
      }
    >
      <DashboardInner>
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <Text style={styles.headerTitle}>TD DASHBOARD</Text>
          <Text style={styles.headerSubtitle}>
            Manage your tournaments and venues
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon="🏆"
            value={vm.stats.myTournaments}
            label="My Tournaments"
            onPress={() =>
              router.push(
                "/(tabs)/admin/tournaments/tournament-director-manager" as any,
              )
            }
          />
          <StatCard
            icon="✅"
            value={vm.stats.activeEvents}
            label="Active Events"
            onPress={() =>
              router.push(
                "/(tabs)/admin/tournaments/tournament-director-manager?filter=active" as any,
              )
            }
          />
          <StatCard
            icon="🏢"
            value={vm.stats.venues}
            label="My Venues"
            onPress={() => router.push("/(tabs)/admin/venues/td-venues" as any)}
          />
          <StatCard
            icon="📊"
            label="Analytics"
            onPress={() =>
              router.push("/(tabs)/admin/director-analytics" as any)
            }
          />
          <StatCard
            icon="✉️"
            label="Messages"
            onPress={() => router.push("/(tabs)/admin/messages" as any)}
          />
        </View>

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

        <View style={styles.analyticsRow}>
          <EventTypeChart data={vm.eventTypeStats} />
          <PerformanceCard
            totalViews={vm.stats.totalViews}
            totalFavorites={vm.stats.totalFavorites}
            activeEvents={vm.stats.activeEvents}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </DashboardInner>
    </ScrollView>
  );
};

// ─── Bar Owner Dashboard ──────────────────────────────────────────────────────

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
      contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        )
      }
    >
      <DashboardInner>
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <Text style={styles.headerTitle}>BAR OWNER DASHBOARD</Text>
          <Text style={styles.headerSubtitle}>
            Manage your venues and directors
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon="🏢"
            value={vm.stats.totalVenues}
            label="Venue Manager"
            onPress={() => router.push("/(tabs)/admin/bar-owner-venues" as any)}
          />
          <StatCard
            icon="👤"
            value={vm.stats.totalDirectors}
            label="Directors"
            onPress={() => router.push("/(tabs)/admin/my-directors" as any)}
          />
          <StatCard
            icon="🏆"
            value={vm.stats.activeTournaments}
            label="Tournament Manager"
            onPress={() =>
              router.push(
                "/(tabs)/admin/tournaments/bar-tournament-manager" as any,
              )
            }
          />
          <StatCard
            icon="📊"
            label="Analytics"
            onPress={() =>
              router.push("/(tabs)/admin/bar-owner-analytics" as any)
            }
          />
          <StatCard
            icon="✉️"
            label="Messages"
            onPress={() => router.push("/(tabs)/admin/messages" as any)}
          />
        </View>

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

        <View style={styles.analyticsRow}>
          <EventTypeChart data={vm.eventTypeStats} />
          <PerformanceCard
            totalViews={vm.stats.totalViews}
            totalFavorites={vm.stats.totalFavorites}
            activeEvents={vm.stats.activeTournaments}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </DashboardInner>
    </ScrollView>
  );
};

// ─── Compete Admin Dashboard ──────────────────────────────────────────────────

const CompeteAdminDashboard = () => {
  const router = useRouter();
  const vm = useCompeteAdminDashboard();

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
      contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        )
      }
    >
      <DashboardInner>
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <Text style={styles.headerTitle}>COMPETE ADMIN</Text>
          <Text style={styles.headerSubtitle}>Platform management</Text>
        </View>

        <View style={styles.managementGrid}>
          <ManagementCard
            icon="👥"
            label="Users"
            value={vm.stats.totalUsers}
            onPress={() => router.push("/(tabs)/admin/user-management" as any)}
          />
          <ManagementCard
            icon="🏆"
            label="Tournaments"
            value={vm.stats.totalTournaments}
            subtitle={`${vm.stats.activeTournaments} active`}
            onPress={() =>
              router.push(
                "/(tabs)/admin/tournaments/admin-tournament-manager" as any,
              )
            }
          />
          <ManagementCard
            icon="🏢"
            label="Venues"
            value={vm.stats.totalVenues}
            onPress={() => router.push("/(tabs)/admin/venue-management" as any)}
          />
          <ManagementCard
            icon="📊"
            label="Analytics"
            value={vm.stats.totalViews}
            subtitle="total views"
            onPress={() =>
              router.push("/(tabs)/admin/super-admin-analytics" as any)
            }
          />
          <ManagementCard
            icon="🚩"
            label="Reports"
            subtitle="Content reports"
            onPress={() =>
              router.push("/(tabs)/admin/report-management" as any)
            }
          />
          <ManagementCard
            icon="📋"
            label="Activity Log"
            subtitle="Recent changes"
            onPress={() => router.push("/(tabs)/admin/activity-log" as any)}
          />
          <ManagementCard
            icon="✉️"
            label="Messages"
            subtitle="Broadcasts"
            onPress={() => router.push("/(tabs)/admin/messages" as any)}
          />
        </View>

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

        <View style={styles.analyticsRow}>
          <EventTypeChart data={vm.eventTypeStats} />
          <PerformanceCard
            totalViews={vm.stats.totalViews}
            totalFavorites={0}
            activeEvents={vm.stats.activeTournaments}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </DashboardInner>
    </ScrollView>
  );
};

// ─── Super Admin Dashboard ────────────────────────────────────────────────────

const SuperAdminDashboard = () => {
  const router = useRouter();
  const vm = useSuperAdminDashboard();

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
      contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        )
      }
    >
      <DashboardInner>
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <Text style={styles.headerTitle}>SUPER ADMIN</Text>
          <Text style={styles.headerSubtitle}>Full system access</Text>
        </View>

        <View style={styles.managementGrid}>
          <ManagementCard
            icon="👥"
            label="Users"
            value={vm.stats.totalUsers}
            onPress={() => router.push("/(tabs)/admin/user-management" as any)}
          />
          <ManagementCard
            icon="🏆"
            label="Tournaments"
            value={vm.stats.totalTournaments}
            subtitle={`${vm.stats.activeTournaments} active`}
            onPress={() =>
              router.push(
                "/(tabs)/admin/tournaments/super-admin-tournament-manager" as any,
              )
            }
          />
          <ManagementCard
            icon="🏢"
            label="Venues"
            value={vm.stats.totalVenues}
            onPress={() => router.push("/(tabs)/admin/venue-management" as any)}
          />
          <ManagementCard
            icon="📊"
            label="Analytics"
            value={vm.stats.totalViews}
            subtitle="total views"
            onPress={() =>
              router.push("/(tabs)/admin/super-admin-analytics" as any)
            }
          />
          <ManagementCard
            icon="⭐"
            label="Featured"
            value={0}
            subtitle="players & bars"
            onPress={() => router.push("/(tabs)/admin/featured-content" as any)}
          />
          <ManagementCard
            icon="📩"
            label="Bar Requests"
            value={vm.stats.pendingBarRequests}
            subtitle="pending reviews"
            onPress={() => router.push("/(tabs)/admin/bar-requests" as any)}
          />
          <ManagementCard
            icon="🎁"
            label="Giveaways"
            value={vm.stats.totalGiveaways}
            onPress={() =>
              router.push("/(tabs)/admin/giveaway-management" as any)
            }
          />
          <ManagementCard
            icon="🚩"
            label="Reports"
            subtitle="Content reports"
            onPress={() =>
              router.push("/(tabs)/admin/report-management" as any)
            }
          />
          <ManagementCard
            icon="✉️"
            label="Messages"
            subtitle="Broadcasts & alerts"
            onPress={() => router.push("/(tabs)/admin/messages" as any)}
          />
          <ManagementCard
            icon="📥"
            label="Bulk Import"
            subtitle="CSV tournament upload"
            onPress={() => router.push("/(tabs)/admin/bulk-import" as any)}
          />
        </View>

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

        <View style={styles.analyticsRow}>
          <EventTypeChart data={vm.eventTypeStats} />
          <PerformanceCard
            totalViews={vm.stats.totalViews}
            totalFavorites={0}
            activeEvents={vm.stats.activeTournaments}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </DashboardInner>
    </ScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Web centering
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  webInner: {
    width: "100%" as any,
    maxWidth: 860,
  },

  // Center screen (login / no access states)
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
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

  // Header
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
  },
  headerWeb: {
    paddingTop: SPACING.lg,
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

  // Stat cards (TD / Bar Owner top row)
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: SPACING.md,
    gap: SPACING.sm,
  },

  // Management cards grid
  managementGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: SPACING.sm,
    gap: SPACING.xs,
  },

  // Management card base
  managementCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 54,
  },
  // Mobile: 2 columns (~40% smaller)
  managementCardMobile: {
    width: "48%" as any,
  },
  // Web: 3 columns within 860px container (~20% smaller)
  managementCardWeb: {
    width: "31.5%" as any,
  },
  managementIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  managementValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  managementLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.text,
    marginTop: 2,
    textAlign: "center",
  },
  managementSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },

  // Analytics / filter
  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
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
  analyticsRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },

  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});