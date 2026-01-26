import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";
import {
  AdminGiveaway,
  GiveawaySortOption,
  GiveawayStatusFilter,
  useAdminGiveaways,
} from "@/src/viewmodels/useAdminGiveaways";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  DrawWinnerModal,
  GiveawayCard,
  RedrawConfirmModal,
  WinnerDetailsModal,
  WinnerResultModal,
} from "../../../src/views/components/giveaway";

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatCurrency = (value: number | null): string => {
  if (!value) return "$0";
  return `$${value.toLocaleString()}`;
};

// ============================================
// GIVEAWAYS TAB CONTENT
// ============================================

interface GiveawaysTabProps {
  vm: ReturnType<typeof useAdminGiveaways>;
  onEdit: (giveaway: AdminGiveaway) => void;
  onEnd: (giveaway: AdminGiveaway) => void;
  onArchive: (giveaway: AdminGiveaway) => void;
  onRestore: (giveaway: AdminGiveaway) => void;
}

const GiveawaysTab = ({
  vm,
  onEdit,
  onEnd,
  onArchive,
  onRestore,
}: GiveawaysTabProps) => {
  return (
    <View style={styles.tabContent}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search giveaways..."
            placeholderTextColor={COLORS.textMuted}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
          />
        </View>
      </View>

      {/* Status Tabs */}
      <View style={styles.statusTabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusTabsContent}
        >
          {(
            [
              "active",
              "ended",
              "awarded",
              "archived",
              "all",
            ] as GiveawayStatusFilter[]
          ).map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusTab,
                vm.statusFilter === status && styles.statusTabActive,
              ]}
              onPress={() => vm.setStatusFilter(status)}
            >
              <Text
                style={[
                  styles.statusTabText,
                  vm.statusFilter === status && styles.statusTabTextActive,
                ]}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                {vm.statusCounts[status] > 0
                  ? ` (${vm.statusCounts[status]})`
                  : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {(["date", "name", "entries"] as GiveawaySortOption[]).map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.sortPill,
              vm.sortOption === option && styles.sortPillActive,
            ]}
            onPress={() => vm.setSortOption(option)}
          >
            <Text
              style={[
                styles.sortPillText,
                vm.sortOption === option && styles.sortPillTextActive,
              ]}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Giveaway List */}
      <FlatList
        data={vm.giveaways}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        }
        renderItem={({ item }) => (
          <GiveawayCard
            giveaway={item}
            daysRemaining={vm.getDaysRemaining(item.end_date)}
            isProcessing={vm.processing === item.id}
            onEdit={() => onEdit(item)}
            onEnd={() => onEnd(item)}
            onDraw={() => vm.openDrawModal(item)}
            onArchive={() => onArchive(item)}
            onRestore={() => onRestore(item)}
            onViewWinner={() => vm.openWinnerDetailsModal(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎁</Text>
            <Text style={styles.emptyText}>No giveaways found</Text>
            <Text style={styles.emptySubtext}>
              Switch to the Manage tab to create one!
            </Text>
          </View>
        }
      />
    </View>
  );
};

// ============================================
// MANAGE TAB CONTENT
// ============================================

interface ManageTabProps {
  vm: ReturnType<typeof useAdminGiveaways>;
  router: ReturnType<typeof useRouter>;
}

const ManageTab = ({ vm, router }: ManageTabProps) => {
  return (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.manageContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push("/(tabs)/admin/create-giveaway" as any)}
        >
          <Text style={styles.actionCardIcon}>+</Text>
          <Text style={styles.actionCardText}>Create New Giveaway</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() =>
            router.push("/(tabs)/admin/giveaway-participants" as any)
          }
        >
          <Text style={styles.actionCardIcon}>👥</Text>
          <Text style={styles.actionCardText}>View All Participants</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push("/(tabs)/admin/giveaway-winners" as any)}
        >
          <Text style={styles.actionCardIcon}>🏆</Text>
          <Text style={styles.actionCardText}>Past Winners</Text>
        </TouchableOpacity>
      </View>

      {/* Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{vm.stats.activeCount}</Text>
            <Text style={styles.statLabel}>Active{"\n"}Giveaways</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{vm.stats.totalEntries}</Text>
            <Text style={styles.statLabel}>Total{"\n"}Entries</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {formatCurrency(vm.stats.totalPrizeValue)}
            </Text>
            <Text style={styles.statLabel}>Active Prize{"\n"}Value</Text>
          </View>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{vm.stats.totalGiveaways}</Text>
            <Text style={styles.statLabel}>Total{"\n"}Giveaways</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {formatCurrency(vm.stats.totalAwarded)}
            </Text>
            <Text style={styles.statLabel}>Total{"\n"}Awarded</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{vm.stats.frequency}</Text>
            <Text style={styles.statLabel}>Giveaway{"\n"}Frequency</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

// ============================================
// MAIN SCREEN
// ============================================

export default function GiveawayManagementScreen() {
  const router = useRouter();
  const vm = useAdminGiveaways();

  // ============================================
  // HANDLERS
  // ============================================

  const handleEdit = (giveaway: AdminGiveaway) => {
    Alert.alert("Edit", `Edit ${giveaway.name} - Coming soon!`);
  };

  const handleEnd = (giveaway: AdminGiveaway) => {
    Alert.alert(
      "End Giveaway",
      `Are you sure you want to end "${giveaway.name}" early?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End",
          style: "destructive",
          onPress: async () => {
            const success = await vm.endGiveaway(giveaway.id);
            if (success) {
              Alert.alert("Success", "Giveaway ended successfully.");
            } else {
              Alert.alert("Error", "Failed to end giveaway.");
            }
          },
        },
      ],
    );
  };

  const handleArchive = (giveaway: AdminGiveaway) => {
    Alert.alert(
      "Archive Giveaway",
      `Are you sure you want to archive "${giveaway.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          onPress: async () => {
            const success = await vm.archiveGiveaway(giveaway.id);
            if (success) {
              Alert.alert("Success", "Giveaway archived successfully.");
            } else {
              Alert.alert("Error", "Failed to archive giveaway.");
            }
          },
        },
      ],
    );
  };

  const handleRestore = (giveaway: AdminGiveaway) => {
    Alert.alert(
      "Restore Giveaway",
      `Are you sure you want to restore "${giveaway.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            const success = await vm.restoreGiveaway(giveaway.id);
            if (success) {
              Alert.alert("Success", "Giveaway restored successfully.");
            } else {
              Alert.alert("Error", "Failed to restore giveaway.");
            }
          },
        },
      ],
    );
  };

  const handleDrawWinner = async () => {
    if (!vm.selectedGiveaway) return;

    if ((vm.selectedGiveaway.entry_count || 0) === 0) {
      Alert.alert("No Entries", "This giveaway has no entries yet.");
      vm.closeDrawModal();
      return;
    }

    const success = await vm.drawWinner(vm.selectedGiveaway.id);
    if (!success) {
      Alert.alert("Error", "Failed to draw winner. Please try again.");
    }
  };

  const handleRedrawWinner = async () => {
    const success = await vm.handleRedrawWinner();
    if (success) {
      Alert.alert("Success", "New winner has been drawn successfully!");
    } else {
      Alert.alert("Error", "Failed to redraw winner. Please try again.");
    }
  };

  // ============================================
  // LOADING STATE
  // ============================================

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading giveaways...</Text>
      </View>
    );
  }

  // ============================================
  // RENDER
  // ============================================

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
        <Text style={styles.headerTitle}>GIVEAWAY MANAGEMENT</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Main Tabs */}
      <View style={styles.mainTabs}>
        <TouchableOpacity
          style={[
            styles.mainTab,
            vm.activeTab === "giveaways" && styles.mainTabActive,
          ]}
          onPress={() => vm.setActiveTab("giveaways")}
        >
          <Text
            style={[
              styles.mainTabText,
              vm.activeTab === "giveaways" && styles.mainTabTextActive,
            ]}
          >
            Giveaways
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.mainTab,
            vm.activeTab === "manage" && styles.mainTabActive,
          ]}
          onPress={() => vm.setActiveTab("manage")}
        >
          <Text
            style={[
              styles.mainTabText,
              vm.activeTab === "manage" && styles.mainTabTextActive,
            ]}
          >
            Manage
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {vm.activeTab === "giveaways" ? (
        <GiveawaysTab
          vm={vm}
          onEdit={handleEdit}
          onEnd={handleEnd}
          onArchive={handleArchive}
          onRestore={handleRestore}
        />
      ) : (
        <ManageTab vm={vm} router={router} />
      )}

      {/* ============================================ */}
      {/* MODALS */}
      {/* ============================================ */}

      {/* Draw Winner Modal */}
      <DrawWinnerModal
        visible={vm.drawModalVisible}
        giveaway={vm.selectedGiveaway}
        isProcessing={vm.processing === vm.selectedGiveaway?.id}
        onClose={vm.closeDrawModal}
        onDraw={handleDrawWinner}
      />

      {/* Winner Result Modal (shown after initial draw) */}
      <WinnerResultModal
        visible={vm.winnerModalVisible}
        winner={vm.drawnWinner}
        giveaway={vm.selectedGiveaway}
        onClose={vm.closeWinnerModal}
      />

      {/* Winner Details Modal (viewing existing winner + redraw option) */}
      <WinnerDetailsModal
        visible={vm.winnerDetailsModalVisible}
        giveaway={vm.selectedGiveaway}
        currentWinner={vm.currentWinner}
        winnerHistory={vm.winnerHistory}
        eligibleCount={vm.eligibleCount}
        loading={vm.loadingWinnerDetails}
        onClose={vm.closeWinnerDetailsModal}
        onRedraw={vm.openRedrawModal}
      />

      {/* Redraw Confirm Modal */}
      {(() => {
        console.log("About to render RedrawConfirmModal:", {
          visible: vm.redrawModalVisible,
          giveaway: vm.selectedGiveaway?.name,
          currentWinner: vm.currentWinner?.name,
        });
        return null;
      })()}
      <RedrawConfirmModal
        visible={vm.redrawModalVisible}
        giveaway={vm.selectedGiveaway}
        currentWinner={vm.currentWinner}
        eligibleCount={vm.eligibleCount}
        reason={vm.redrawReason}
        onReasonChange={vm.setRedrawReason}
        isRedrawing={vm.redrawing}
        onClose={vm.closeRedrawModal}
        onConfirm={handleRedrawWinner}
      />
    </View>
  );
}

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
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  placeholder: {
    width: 50,
  },

  // Main Tabs
  mainTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mainTab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  mainTabActive: {
    borderBottomColor: COLORS.primary,
  },
  mainTabText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  mainTabTextActive: {
    color: COLORS.primary,
  },

  // Tab Content
  tabContent: {
    flex: 1,
  },

  // Search
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: SPACING.sm,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    height: 40,
  },

  // Status Tabs
  statusTabsWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statusTabsContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  statusTab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  statusTabActive: {
    borderBottomColor: COLORS.primary,
  },
  statusTabText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  statusTabTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },

  // Sort
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  sortLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  sortPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortPillActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  sortPillText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  sortPillTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },

  // List
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },

  // Empty state
  emptyContainer: {
    alignItems: "center",
    padding: SPACING.xl,
    marginTop: SPACING.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  // Manage Tab
  manageContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionCardIcon: {
    fontSize: 20,
    marginRight: SPACING.md,
  },
  actionCardText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
});
