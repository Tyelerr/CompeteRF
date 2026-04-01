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
import { moderateScale, scale } from "../../../src/utils/scaling";
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

// --- Root router -----------------------------------------------------------

export default function AdminScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuthContext();

  if (authLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.emoji}>{"\uD83D\uDD12"}</Text>
        <Text allowFontScaling={false} style={styles.title}>Login Required</Text>
        <Text allowFontScaling={false} style={styles.subtitle}>
          Please log in to access your dashboard.
        </Text>
        <Button title="Log In" onPress={() => router.push("/auth/login")} />
      </View>
    );
  }

  if (profile?.role === "basic_user") {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.emoji}>{"\uD83C\uDFB1"}</Text>
        <Text allowFontScaling={false} style={styles.title}>No Dashboard Access</Text>
        <Text allowFontScaling={false} style={styles.subtitle}>
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

// --- Management Card -------------------------------------------------------

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
        // @ts-ignore - web only
        isWeb && {
          // @ts-ignore - web only
          transition:
            "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
          // @ts-ignore - web only
          cursor: "pointer",
        },
        isWeb &&
          hovered && {
            borderColor: COLORS.primary,
            transform: [{ scale: 1.02 }],
            // @ts-ignore - web only
            boxShadow: `0 8px 32px 0 ${COLORS.primary}55`,
          },
      ]}
      onPress={onPress}
      // @ts-ignore - web only
      onMouseEnter={() => isWeb && setHovered(true)}
      // @ts-ignore - web only
      onMouseLeave={() => isWeb && setHovered(false)}
    >
      <Text allowFontScaling={false} style={styles.managementIcon}>{icon}</Text>
      {value !== undefined && (
        <Text
          allowFontScaling={false}
          style={[
            styles.managementValue,
            isWeb && hovered && { color: COLORS.primary },
          ]}
        >
          {value.toLocaleString()}
        </Text>
      )}
      <Text
        allowFontScaling={false}
        style={[
          styles.managementLabel,
          isWeb && hovered && { color: COLORS.primary },
        ]}
      >
        {label}
      </Text>
      {subtitle && (
        <Text allowFontScaling={false} style={styles.managementSubtitle}>
          {subtitle}
        </Text>
      )}
    </TouchableOpacity>
  );
};

// --- Shared inner wrapper --------------------------------------------------

const DashboardInner = ({ children }: { children: React.ReactNode }) =>
  isWeb ? <View style={styles.webInner}>{children}</View> : <>{children}</>;

// --- TD Dashboard ----------------------------------------------------------

const TDDashboard = () => {
  const router = useRouter();
  const vm = useTDDashboard();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading dashboard...</Text>
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
          <Text allowFontScaling={false} style={styles.headerTitle}>TD DASHBOARD</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>
            Manage your tournaments and venues
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon={"\uD83C\uDFC6"}
            value={vm.stats.myTournaments}
            label="My Tournaments"
            onPress={() =>
              router.push(
                "/(tabs)/admin/tournaments/tournament-director-manager" as any,
              )
            }
          />
          <StatCard
            icon={"\u2705"}
            value={vm.stats.activeEvents}
            label="Active Events"
            onPress={() =>
              router.push(
                "/(tabs)/admin/tournaments/tournament-director-manager?filter=active" as any,
              )
            }
          />
          <StatCard
            icon={"\uD83C\uDFE2"}
            value={vm.stats.venues}
            label="My Venues"
            onPress={() => router.push("/(tabs)/admin/venues/td-venues" as any)}
          />
          <StatCard
            icon={"\uD83D\uDCCA"}
            label="Analytics"
            onPress={() =>
              router.push("/(tabs)/admin/director-analytics" as any)
            }
          />
          <StatCard
            icon={"\u2709\uFE0F"}
            label="Messages"
            onPress={() => router.push("/(tabs)/admin/messages" as any)}
          />
        </View>

        <View style={styles.quickStatsSection}>
          <Text allowFontScaling={false} style={styles.quickStatsTitle}>Quick Stats</Text>
          <Text allowFontScaling={false} style={styles.quickStatsSubtitle}>{"Today's performance"}</Text>
          <View style={styles.quickStatsCard}>
            <View style={styles.quickStatRow}>
              <View style={[styles.quickStatIconWrap, { backgroundColor: "#1E3A5F" }]}>
                <Text allowFontScaling={false} style={styles.quickStatIcon}>{"\uD83D\uDC41"}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.quickStatLabel}>Views</Text>
              <Text allowFontScaling={false} style={[styles.quickStatNumber, { color: "#4A9EFF" }]}>
                {vm.stats.todayViews}
              </Text>
            </View>
            <View style={styles.quickStatRow}>
              <View style={[styles.quickStatIconWrap, { backgroundColor: "#5F1E1E" }]}>
                <Text allowFontScaling={false} style={styles.quickStatIcon}>{"\u2764\uFE0F"}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.quickStatLabel}>Favorites</Text>
              <Text allowFontScaling={false} style={[styles.quickStatNumber, { color: "#FF6B6B" }]}>
                {vm.stats.todayFavorites}
              </Text>
            </View>
            <View style={[styles.quickStatRow, { marginBottom: 0 }]}>
              <View style={[styles.quickStatIconWrap, { backgroundColor: "#1E4D2B" }]}>
                <Text allowFontScaling={false} style={styles.quickStatIcon}>{"\uD83C\uDFAF"}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.quickStatLabel}>Active Events</Text>
              <Text allowFontScaling={false} style={[styles.quickStatNumber, { color: "#4ADE80" }]}>
                {vm.stats.activeEvents}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </DashboardInner>
    </ScrollView>
  );
};

// --- Bar Owner Dashboard ---------------------------------------------------

const BarOwnerDashboard = () => {
  const router = useRouter();
  const vm = useBarOwnerDashboard();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading dashboard...</Text>
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
          <Text allowFontScaling={false} style={styles.headerTitle}>BAR OWNER DASHBOARD</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>
            Manage your venues and directors
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon={"\uD83C\uDFE2"}
            value={vm.stats.totalVenues}
            label="Venue Manager"
            onPress={() => router.push("/(tabs)/admin/bar-owner-venues" as any)}
          />
          <StatCard
            icon={"\uD83D\uDC64"}
            value={vm.stats.totalDirectors}
            label="Directors"
            onPress={() =>
              router.push("/(tabs)/admin/directors/bar-owner-directors" as any)
            }
          />
          <StatCard
            icon={"\uD83C\uDFC6"}
            value={vm.stats.activeTournaments}
            label="Tournament Manager"
            onPress={() =>
              router.push(
                "/(tabs)/admin/tournaments/bar-tournament-manager" as any,
              )
            }
          />
          <StatCard
            icon={"\uD83D\uDCCA"}
            label="Analytics"
            onPress={() =>
              router.push("/(tabs)/admin/bar-owner-analytics" as any)
            }
          />
          <StatCard
            icon={"\u2709\uFE0F"}
            label="Messages"
            onPress={() => router.push("/(tabs)/admin/messages" as any)}
          />
          <StatCard
            icon={"\uD83D\uDCB3"}
            label="Billing"
            onPress={() =>
              router.push("/(tabs)/admin/bar-owner-billing" as any)
            }
          />
        </View>

        <View style={styles.quickStatsSection}>
          <Text allowFontScaling={false} style={styles.quickStatsTitle}>Quick Stats</Text>
          <Text allowFontScaling={false} style={styles.quickStatsSubtitle}>{"Today's performance"}</Text>
          <View style={styles.quickStatsCard}>
            <View style={styles.quickStatRow}>
              <View style={[styles.quickStatIconWrap, { backgroundColor: "#1E3A5F" }]}>
                <Text allowFontScaling={false} style={styles.quickStatIcon}>{"\uD83D\uDC41"}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.quickStatLabel}>Views</Text>
              <Text allowFontScaling={false} style={[styles.quickStatNumber, { color: "#4A9EFF" }]}>
                {vm.stats.todayViews}
              </Text>
            </View>
            <View style={styles.quickStatRow}>
              <View style={[styles.quickStatIconWrap, { backgroundColor: "#5F1E1E" }]}>
                <Text allowFontScaling={false} style={styles.quickStatIcon}>{"\u2764\uFE0F"}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.quickStatLabel}>Favorites</Text>
              <Text allowFontScaling={false} style={[styles.quickStatNumber, { color: "#FF6B6B" }]}>
                {vm.stats.todayFavorites}
              </Text>
            </View>
            <View style={[styles.quickStatRow, { marginBottom: 0 }]}>
              <View style={[styles.quickStatIconWrap, { backgroundColor: "#1E4D2B" }]}>
                <Text allowFontScaling={false} style={styles.quickStatIcon}>{"\uD83C\uDFAF"}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.quickStatLabel}>Active Events</Text>
              <Text allowFontScaling={false} style={[styles.quickStatNumber, { color: "#4ADE80" }]}>
                {vm.stats.activeTournaments}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </DashboardInner>
    </ScrollView>
  );
};

// --- Compete Admin Dashboard -----------------------------------------------

const CompeteAdminDashboard = () => {
  const router = useRouter();
  const vm = useCompeteAdminDashboard();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading dashboard...</Text>
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
          <Text allowFontScaling={false} style={styles.headerTitle}>COMPETE ADMIN</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>Platform management</Text>
        </View>

        <View style={styles.managementGrid}>
          <ManagementCard
            icon={"\uD83D\uDC65"}
            label="Users"
            value={vm.stats.totalUsers}
            onPress={() => router.push("/(tabs)/admin/user-management" as any)}
          />
          <ManagementCard
            icon={"\uD83C\uDFC6"}
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
            icon={"\uD83C\uDFE2"}
            label="Venues"
            value={vm.stats.totalVenues}
            onPress={() => router.push("/(tabs)/admin/venue-management" as any)}
          />
          <ManagementCard
            icon={"\uD83D\uDCCA"}
            label="Analytics"
            value={vm.stats.totalViews}
            subtitle="total views"
            onPress={() =>
              router.push("/(tabs)/admin/super-admin-analytics" as any)
            }
          />
          <ManagementCard
            icon={"\uD83D\uDEA9"}
            label="Reports"
            subtitle="Content reports"
            onPress={() =>
              router.push("/(tabs)/admin/report-management" as any)
            }
          />
          <ManagementCard
            icon={"\uD83D\uDCCB"}
            label="Activity Log"
            subtitle="Recent changes"
            onPress={() => router.push("/(tabs)/admin/activity-log" as any)}
          />
          <ManagementCard
            icon={"\u2709\uFE0F"}
            label="Messages"
            subtitle="Broadcasts"
            onPress={() => router.push("/(tabs)/admin/messages" as any)}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.filterRow}>
            <Text allowFontScaling={false} style={styles.filterLabel}>Analytics Period</Text>
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

// --- Super Admin Dashboard -------------------------------------------------

const SuperAdminDashboard = () => {
  const router = useRouter();
  const vm = useSuperAdminDashboard();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading dashboard...</Text>
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
          <Text allowFontScaling={false} style={styles.headerTitle}>SUPER ADMIN</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>Full system access</Text>
        </View>

        <View style={styles.managementGrid}>
          <ManagementCard
            icon={"\uD83D\uDC65"}
            label="Users"
            value={vm.stats.totalUsers}
            onPress={() => router.push("/(tabs)/admin/user-management" as any)}
          />
          <ManagementCard
            icon={"\uD83C\uDFC6"}
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
            icon={"\uD83C\uDFE2"}
            label="Venues"
            value={vm.stats.totalVenues}
            onPress={() => router.push("/(tabs)/admin/venue-management" as any)}
          />
          <ManagementCard
            icon={"\uD83D\uDCCA"}
            label="Analytics"
            value={vm.stats.totalViews}
            subtitle="total views"
            onPress={() =>
              router.push("/(tabs)/admin/super-admin-analytics" as any)
            }
          />
          <ManagementCard
            icon={"\u2B50"}
            label="Featured"
            value={0}
            subtitle="players & bars"
            onPress={() => router.push("/(tabs)/admin/featured-content" as any)}
          />
          <ManagementCard
            icon={"\uD83D\uDCE9"}
            label="Bar Requests"
            value={vm.stats.pendingBarRequests}
            subtitle="pending reviews"
            onPress={() => router.push("/(tabs)/admin/bar-requests" as any)}
          />
          <ManagementCard
            icon={"\uD83C\uDF81"}
            label="Giveaways"
            value={vm.stats.totalGiveaways}
            onPress={() =>
              router.push("/(tabs)/admin/giveaway-management" as any)
            }
          />
          <ManagementCard
            icon={"\uD83D\uDEA9"}
            label="Reports"
            subtitle="Content reports"
            onPress={() =>
              router.push("/(tabs)/admin/report-management" as any)
            }
          />
          <ManagementCard
            icon={"\u2709\uFE0F"}
            label="Messages"
            subtitle="Broadcasts & alerts"
            onPress={() => router.push("/(tabs)/admin/messages" as any)}
          />
          <ManagementCard
            icon={"\uD83D\uDCE5"}
            label="Bulk Import"
            subtitle="CSV tournament upload"
            onPress={() => router.push("/(tabs)/admin/bulk-import" as any)}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.filterRow}>
            <Text allowFontScaling={false} style={styles.filterLabel}>Analytics Period</Text>
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

// --- Styles ----------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  webInner: {
    width: "100%" as any,
    maxWidth: 860,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  loadingText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
  },
  emoji: {
    fontSize: moderateScale(60),
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
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
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  managementGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  managementCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: scale(54),
  },
  managementCardMobile: {
    width: "48%" as any,
  },
  managementCardWeb: {
    width: "31.5%" as any,
  },
  managementIcon: {
    fontSize: moderateScale(18),
    marginBottom: scale(2),
  },
  managementValue: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  managementLabel: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "600",
    color: COLORS.text,
    marginTop: scale(2),
    textAlign: "center",
  },
  managementSubtitle: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: scale(2),
    textAlign: "center",
  },
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
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  filterDropdown: {
    flex: 1,
    maxWidth: scale(160),
    marginLeft: SPACING.md,
  },
  analyticsRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  quickStatsSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  quickStatsTitle: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: scale(2),
  },
  quickStatsSubtitle: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  quickStatsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  quickStatRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  quickStatIconWrap: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(10),
    alignItems: "center",
    justifyContent: "center",
  },
  quickStatIcon: {
    fontSize: moderateScale(18),
  },
  quickStatNumber: {
    fontSize: moderateScale(28),
    fontWeight: "800",
    marginLeft: "auto",
    minWidth: scale(44),
    textAlign: "right",
  },
  quickStatLabel: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
    flex: 1,
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});