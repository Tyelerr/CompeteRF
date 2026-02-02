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
import { useBarOwnerDirectors } from "../../../../src/viewmodels/useBarOwnerDirectors";
import { EmptyState } from "../../../../src/views/components/dashboard";
import { DirectorCard } from "../../../../src/views/components/directors/DirectorCard";
import { RemoveDirectorModal } from "../../../../src/views/components/directors/RemoveDirectorModal";

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

export default function BarOwnerDirectorsScreen() {
  const router = useRouter();
  const vm = useBarOwnerDirectors();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading directors...</Text>
      </View>
    );
  }

  const renderDirector = ({ item }: { item: any }) => (
    <DirectorCard
      director={item}
      onPress={() => {
        // Navigate to director details if needed
        console.log("Director pressed:", item);
      }}
      onRemove={() => vm.handleRemoveDirector(item)}
      onRestore={() => vm.handleRestoreDirector(item)}
      isProcessing={vm.processing === item.id}
      showActions={true}
      canRemove={vm.canRemoveDirectors && item.status === "active"}
      canRestore={vm.canViewArchivedDirectors && item.status === "archived"}
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
        <Text style={styles.headerTitle}>My Directors</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          {vm.stats.totalDirectors} directors across{" "}
          {vm.stats.venuesWithDirectors} venues
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email, venue, or ID..."
          placeholderTextColor={COLORS.textMuted}
          value={vm.filters.search}
          onChangeText={vm.updateSearch}
        />
      </View>

      {/* Add Director Button */}
      {vm.canAddDirectors && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => vm.setShowAddModal(true)}
        >
          <Text style={styles.addButtonText}>+ Add Director</Text>
        </TouchableOpacity>
      )}

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

      {/* Directors List */}
      <FlatList
        data={vm.directors}
        renderItem={renderDirector}
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
                ? "No active directors"
                : vm.filters.status === "archived"
                  ? "No archived directors"
                  : "No directors found"
            }
            submessage={
              vm.filters.search
                ? "Try adjusting your search terms"
                : vm.canAddDirectors
                  ? "Add your first director to get started"
                  : "Directors will appear here when added"
            }
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Remove Director Modal */}
      <RemoveDirectorModal
        visible={vm.showRemoveModal}
        director={vm.selectedDirector}
        reason={vm.removeReason}
        onReasonChange={vm.setRemoveReason}
        onCancel={() => vm.setShowRemoveModal(false)}
        onConfirm={vm.confirmRemoveDirector}
        isProcessing={vm.processing !== null}
      />

      {/* TODO: Add Director Modal would go here */}
      {/* This would be a separate component for selecting venue and director */}
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
  addButton: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 8,
    alignItems: "center",
  },
  addButtonText: {
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
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
});
