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
import { useTournamentDirectorManager } from "../../../../src/viewmodels/useTournamentDirectorManager";
import { EmptyState } from "../../../../src/views/components/dashboard";
import { TournamentCard } from "../../../../src/views/components/tournament";

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

export default function TDTournamentsScreen() {
  const router = useRouter();
  const vm = useTournamentDirectorManager();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading tournaments...</Text>
      </View>
    );
  }

  const renderTournament = ({ item }: { item: any }) => (
    <TournamentCard
      tournament={item}
      onPress={() => {
        // Navigate to tournament details
        console.log("Tournament pressed:", item);
      }}
      onEdit={() => {
        router.push(`/(tabs)/admin/edit-tournament/${item.id}` as any);
      }}
      onCancel={() => vm.cancelTournament(item.id, "Cancelled by director")}
      onArchive={() => vm.archiveTournament(item.id)}
      onRestore={() => vm.restoreTournament(item.id)}
      isProcessing={vm.processing === item.id}
      showActions={true}
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
        <Text style={styles.headerTitle}>My Tournaments</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          {vm.tournaments.length} tournaments created across your assigned
          venues
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tournaments..."
          placeholderTextColor={COLORS.textMuted}
          value={vm.searchQuery}
          onChangeText={vm.setSearchQuery}
        />
      </View>

      {/* Create Tournament Button */}
      <View style={styles.createButtonContainer}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push("/(tabs)/submit")}
        >
          <Text style={styles.createButtonText}>+ Create Tournament</Text>
        </TouchableOpacity>
      </View>

      {/* Status Tabs */}
      <View style={styles.statusTabs}>
        <StatusTab
          label="Active"
          count={vm.statusCounts.active}
          isActive={vm.statusFilter === "active"}
          onPress={() => vm.setStatusFilter("active")}
        />
        <StatusTab
          label="Completed"
          count={vm.statusCounts.completed}
          isActive={vm.statusFilter === "completed"}
          onPress={() => vm.setStatusFilter("completed")}
        />
        <StatusTab
          label="Archived"
          count={vm.statusCounts.archived}
          isActive={vm.statusFilter === "archived"}
          onPress={() => vm.setStatusFilter("archived")}
        />
        <StatusTab
          label="All"
          count={vm.statusCounts.all}
          isActive={vm.statusFilter === "all"}
          onPress={() => vm.setStatusFilter("all")}
        />
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={[
            styles.sortButton,
            vm.sortOption === "date" && styles.sortButtonActive,
          ]}
          onPress={() => vm.setSortOption("date")}
        >
          <Text
            style={[
              styles.sortButtonText,
              vm.sortOption === "date" && styles.sortButtonTextActive,
            ]}
          >
            Date
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortButton,
            vm.sortOption === "name" && styles.sortButtonActive,
          ]}
          onPress={() => vm.setSortOption("name")}
        >
          <Text
            style={[
              styles.sortButtonText,
              vm.sortOption === "name" && styles.sortButtonTextActive,
            ]}
          >
            A-Z
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tournaments List */}
      <FlatList
        data={vm.tournaments}
        renderItem={renderTournament}
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
              vm.statusFilter === "active"
                ? "No active tournaments"
                : vm.statusFilter === "completed"
                  ? "No completed tournaments"
                  : vm.statusFilter === "archived"
                    ? "No archived tournaments"
                    : "No tournaments found"
            }
            submessage={
              vm.searchQuery
                ? "Try adjusting your search terms"
                : "Create your first tournament to get started"
            }
          />
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
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  placeholder: {
    width: 50,
  },
  statsContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statsText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
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
  createButtonContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 8,
    alignItems: "center",
  },
  createButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.white,
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
    paddingHorizontal: SPACING.xs,
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
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  sortLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  sortButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sortButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  sortButtonTextActive: {
    color: COLORS.white,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
});
