import { moderateScale, scale } from "../../../../src/utils/scaling";
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
  Platform,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useBarOwnerDirectors } from "../../../../src/viewmodels/useBarOwnerDirectors";
import { EmptyState } from "../../../../src/views/components/dashboard";
import { DirectorCard } from "../../../../src/views/components/directors/DirectorCard";
import { RemoveDirectorModal } from "../../../../src/views/components/directors/RemoveDirectorModal";

const isWeb = Platform.OS === "web";

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
      allowFontScaling={false}
      style={[styles.statusTabText, isActive && styles.statusTabTextActive]}
    >
      {label}
    </Text>
    <Text
      allowFontScaling={false}
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
        <Text allowFontScaling={false} style={styles.loadingText}>Loading directors...</Text>
      </View>
    );
  }

  const renderDirector = ({ item }: { item: any }) => (
    <DirectorCard
      director={item}
      onPress={() => {
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
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>My Directors</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.statsContainer}>
        <Text allowFontScaling={false} style={styles.statsText}>
          {vm.stats.totalDirectors} directors across{" "}
          {vm.stats.venuesWithDirectors} venues
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email, venue, or ID..."
          placeholderTextColor={COLORS.textMuted}
          value={vm.filters.search}
          onChangeText={vm.updateSearch}
        />
      </View>

      {vm.canAddDirectors && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push("/(tabs)/admin/add-director" as any)}
        >
          <Text allowFontScaling={false} style={styles.addButtonText}>+ Add Director</Text>
        </TouchableOpacity>
      )}

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

      <FlatList
        data={vm.directors}
        renderItem={renderDirector}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}/>
          )
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

      <RemoveDirectorModal
        visible={vm.showRemoveModal}
        director={vm.selectedDirector}
        reason={vm.removeReason}
        onReasonChange={vm.setRemoveReason}
        onCancel={() => vm.setShowRemoveModal(false)}
        onConfirm={vm.confirmRemoveDirector}
        isProcessing={vm.processing !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
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
    fontSize: moderateScale(FONT_SIZES.md),
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
  headerWeb: {
    paddingTop: SPACING.lg,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
  },
  placeholder: {
    width: scale(50),
  },
  statsContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statsText: {
    fontSize: moderateScale(FONT_SIZES.sm),
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
    borderRadius: scale(8),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.text,
  },
  addButton: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: scale(8),
    alignItems: "center",
  },
  addButtonText: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "600",
    color: COLORS.white,
  },
  statusTabs: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: scale(8),
    padding: SPACING.xs,
    gap: SPACING.xs,
  },
  statusTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: scale(6),
    alignItems: "center",
  },
  statusTabActive: {
    backgroundColor: COLORS.primary,
  },
  statusTabText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  statusTabTextActive: {
    color: COLORS.white,
  },
  statusTabCount: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textMuted,
    marginTop: scale(2),
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
