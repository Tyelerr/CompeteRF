import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AdminGiveaway,
  GiveawayStatusFilter,
  useAdminGiveaways,
} from "../../../src/viewmodels/useAdminGiveaways";

const COLORS = {
  background: "#000000",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  blue: "#007AFF",
  white: "#FFFFFF",
  gray: "#8E8E93",
  lightGray: "#AEAEB2",
  darkGray: "#3A3A3C",
  green: "#30D158",
  red: "#FF453A",
  orange: "#FF9F0A",
  teal: "#64D2FF",
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

const FONT_SIZES = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
};

const STATUS_FILTERS: { label: string; value: GiveawayStatusFilter }[] = [
  { label: "Active", value: "active" },
  { label: "Ended", value: "ended" },
  { label: "Awarded", value: "awarded" },
  { label: "Archived", value: "archived" },
  { label: "All", value: "all" },
];

export default function GiveawayManagementScreen() {
  const router = useRouter();
  const vm = useAdminGiveaways();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return COLORS.green;
      case "ended":
        return COLORS.orange;
      case "awarded":
        return COLORS.blue;
      case "archived":
        return COLORS.gray;
      default:
        return COLORS.gray;
    }
  };

  const renderGiveawayCard = ({ item }: { item: AdminGiveaway }) => (
    <View style={styles.giveawayCard}>
      <View style={styles.giveawayHeader}>
        <Text style={styles.giveawayName} numberOfLines={1}>
          {item.name}
        </Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) + "20" },
          ]}
        >
          <Text
            style={[styles.statusText, { color: getStatusColor(item.status) }]}
          >
            {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.giveawayInfo}>
        <Text style={styles.giveawayDetail}>
          💰 ${item.prize_value?.toLocaleString() || "0"}
        </Text>
        <Text style={styles.giveawayDetail}>
          👥 {item.entry_count || 0}
          {item.max_entries ? ` / ${item.max_entries}` : ""} entries
        </Text>
      </View>

      {item.end_date && (
        <Text style={styles.giveawayDate}>
          📅 {vm.getDaysRemaining(item.end_date)}
        </Text>
      )}

      {item.status === "awarded" && item.winner_name && (
        <View style={styles.winnerRow}>
          <Text style={styles.winnerText}>🏆 {item.winner_name}</Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <Pressable
          style={styles.actionButton}
          onPress={() =>
            router.push(`/(tabs)/admin/edit-giveaway/${item.id}` as any)
          }
        >
          <Text style={[styles.actionText, { color: COLORS.green }]}>Edit</Text>
        </Pressable>

        {item.status === "active" && (
          <Pressable
            style={styles.actionButton}
            onPress={() => vm.endGiveaway(item.id)}
            disabled={vm.processing === item.id}
          >
            <Text style={[styles.actionText, { color: COLORS.red }]}>
              {vm.processing === item.id ? "..." : "End Early"}
            </Text>
          </Pressable>
        )}

        {item.status === "ended" && (
          <>
            <Pressable
              style={styles.actionButton}
              onPress={() => vm.openDrawModal(item)}
            >
              <Text style={[styles.actionText, { color: COLORS.blue }]}>
                Draw Winner
              </Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => vm.archiveGiveaway(item.id)}
              disabled={vm.processing === item.id}
            >
              <Text style={[styles.actionText, { color: COLORS.gray }]}>
                🗄️
              </Text>
            </Pressable>
          </>
        )}

        {item.status === "awarded" && (
          <>
            <Pressable
              style={styles.actionButton}
              onPress={() => vm.openWinnerDetailsModal(item)}
            >
              <Text style={[styles.actionText, { color: COLORS.blue }]}>
                View Winner
              </Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => vm.archiveGiveaway(item.id)}
              disabled={vm.processing === item.id}
            >
              <Text style={[styles.actionText, { color: COLORS.gray }]}>
                🗄️
              </Text>
            </Pressable>
          </>
        )}

        {item.status === "archived" && (
          <Pressable
            style={styles.actionButton}
            onPress={() => vm.restoreGiveaway(item.id)}
            disabled={vm.processing === item.id}
          >
            <Text style={[styles.actionText, { color: COLORS.teal }]}>
              {vm.processing === item.id ? "..." : "Restore"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderGiveawaysTab = () => (
    <>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={COLORS.gray} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search giveaways..."
          placeholderTextColor={COLORS.gray}
          value={vm.searchQuery}
          onChangeText={vm.setSearchQuery}
        />
        {vm.searchQuery.length > 0 && (
          <Pressable onPress={() => vm.setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={COLORS.gray} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.filterRow}
      >
        {STATUS_FILTERS.map((filter) => (
          <Pressable
            key={filter.value}
            style={[
              styles.filterChip,
              vm.statusFilter === filter.value && styles.filterChipActive,
            ]}
            onPress={() => vm.setStatusFilter(filter.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                vm.statusFilter === filter.value && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
              {vm.statusCounts[filter.value] > 0
                ? ` (${vm.statusCounts[filter.value]})`
                : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {vm.loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.blue} />
        </View>
      ) : vm.giveaways.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="gift-outline" size={48} color={COLORS.darkGray} />
          <Text style={styles.emptyTitle}>No Giveaways</Text>
          <Text style={styles.emptySubtitle}>
            {vm.statusFilter === "all"
              ? "Create your first giveaway to get started"
              : `No ${vm.statusFilter} giveaways`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={vm.giveaways}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderGiveawayCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={vm.refreshing}
              onRefresh={vm.onRefresh}
              tintColor={COLORS.blue}
            />
          }
        />
      )}
    </>
  );

  const renderManageTab = () => (
    <ScrollView
      contentContainerStyle={styles.manageContent}
      refreshControl={
        <RefreshControl
          refreshing={vm.refreshing}
          onRefresh={vm.onRefresh}
          tintColor={COLORS.blue}
        />
      }
    >
      <Text style={styles.sectionTitle}>Quick Actions</Text>

      <Pressable
        style={styles.quickActionButton}
        onPress={() => router.push("/(tabs)/admin/create-giveaway" as any)}
      >
        <Text style={styles.quickActionIcon}>+</Text>
        <Text style={styles.quickActionText}>Create New Giveaway</Text>
      </Pressable>

      <Pressable
        style={styles.quickActionButton}
        onPress={() =>
          router.push("/(tabs)/admin/giveaway-participants" as any)
        }
      >
        <Text style={styles.quickActionIcon}>👥</Text>
        <Text style={styles.quickActionText}>View All Participants</Text>
      </Pressable>

      <Pressable
        style={styles.quickActionButton}
        onPress={() =>
          router.push("/(tabs)/admin/giveaway-past-winners" as any)
        }
      >
        <Text style={styles.quickActionIcon}>🏆</Text>
        <Text style={styles.quickActionText}>Past Winners</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { marginTop: SPACING.xxl }]}>
        Overview
      </Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={[styles.statCardValue, { color: COLORS.blue }]}>
            {vm.stats.activeCount}
          </Text>
          <Text style={styles.statCardLabel}>Active{"\n"}Giveaways</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statCardValue, { color: COLORS.white }]}>
            {vm.stats.totalEntries}
          </Text>
          <Text style={styles.statCardLabel}>Total{"\n"}Entries</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statCardValue, { color: COLORS.green }]}>
            ${vm.stats.totalPrizeValue?.toLocaleString() || "0"}
          </Text>
          <Text style={styles.statCardLabel}>Active Prize{"\n"}Value</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={[styles.statCardValue, { color: COLORS.white }]}>
            {vm.stats.totalGiveaways}
          </Text>
          <Text style={styles.statCardLabel}>Total{"\n"}Giveaways</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statCardValue, { color: COLORS.green }]}>
            ${vm.stats.totalAwarded?.toLocaleString() || "0"}
          </Text>
          <Text style={styles.statCardLabel}>Total{"\n"}Awarded</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statCardValue, { color: COLORS.teal }]}>
            {vm.stats.activeCount}
          </Text>
          <Text style={styles.statCardLabel}>Currently{"\n"}Active</Text>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.blue} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>GIVEAWAY MANAGEMENT</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, vm.activeTab === "giveaways" && styles.tabActive]}
          onPress={() => vm.setActiveTab("giveaways")}
        >
          <Text
            style={[
              styles.tabText,
              vm.activeTab === "giveaways" && styles.tabTextActive,
            ]}
          >
            Giveaways
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, vm.activeTab === "manage" && styles.tabActive]}
          onPress={() => vm.setActiveTab("manage")}
        >
          <Text
            style={[
              styles.tabText,
              vm.activeTab === "manage" && styles.tabTextActive,
            ]}
          >
            Manage
          </Text>
        </Pressable>
      </View>

      {vm.activeTab === "giveaways" ? renderGiveawaysTab() : renderManageTab()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  backButton: { flexDirection: "row", alignItems: "center", width: 70 },
  backText: { color: COLORS.blue, fontSize: FONT_SIZES.md },
  headerTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    textAlign: "center",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: COLORS.blue },
  tabText: { color: COLORS.gray, fontSize: FONT_SIZES.md, fontWeight: "600" },
  tabTextActive: { color: COLORS.blue },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 10,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: SPACING.sm,
  },
  searchInput: { flex: 1, color: COLORS.white, fontSize: FONT_SIZES.sm },
  filterRow: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    alignItems: "center",
  },
  filterChip: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  filterChipActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  filterChipText: { color: COLORS.lightGray, fontSize: FONT_SIZES.sm },
  filterChipTextActive: { color: COLORS.white, fontWeight: "600" },
  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: 100 },
  giveawayCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  giveawayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  giveawayName: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    flex: 1,
    marginRight: SPACING.sm,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  statusText: { fontSize: FONT_SIZES.xs, fontWeight: "700" },
  giveawayInfo: {
    flexDirection: "row",
    gap: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  giveawayDetail: { color: COLORS.lightGray, fontSize: FONT_SIZES.sm },
  giveawayDate: {
    color: COLORS.gray,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.sm,
  },
  winnerRow: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  winnerText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.md,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  actionButton: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm },
  actionText: { fontSize: FONT_SIZES.sm, fontWeight: "600" },
  manageContent: { padding: SPACING.lg, paddingBottom: 100 },
  sectionTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    marginBottom: SPACING.md,
  },
  quickActionButton: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  quickActionIcon: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.white,
    width: 30,
    textAlign: "center",
  },
  quickActionText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  statCardValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    marginBottom: SPACING.xs,
  },
  statCardLabel: {
    color: COLORS.gray,
    fontSize: FONT_SIZES.xs,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: SPACING.sm,
  },
  emptyTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    marginTop: SPACING.md,
  },
  emptySubtitle: {
    color: COLORS.gray,
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
  },
});
