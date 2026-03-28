import { moderateScale, scale } from "../../../../src/utils/scaling";
import { useRouter } from "expo-router";
import React from "react";
import {
  FlatList, Platform, RefreshControl, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useBarOwnerDirectors } from "../../../../src/viewmodels/useBarOwnerDirectors";
import { EmptyState } from "../../../../src/views/components/dashboard";
import { DirectorCard } from "../../../../src/views/components/directors/DirectorCard";
import { EditDirectorVenuesModal } from "../../../../src/views/components/directors/EditDirectorVenuesModal";
import { RemoveDirectorModal } from "../../../../src/views/components/directors/RemoveDirectorModal";
import { Pagination } from "../../../../src/views/components/common/pagination";

const isWeb = Platform.OS === "web";

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

  return (
    <View style={styles.container}>
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text allowFontScaling={false} style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>My Directors</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.statsContainer}>
        <Text allowFontScaling={false} style={styles.statsText}>
          {vm.stats.totalDirectors} director{vm.stats.totalDirectors !== 1 ? "s" : ""} across {vm.stats.venuesWithDirectors} venue{vm.stats.venuesWithDirectors !== 1 ? "s" : ""}
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          allowFontScaling={false}
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

      <Pagination
        totalCount={vm.pagination.totalCount}
        displayStart={vm.pagination.displayRange.start}
        displayEnd={vm.pagination.displayRange.end}
        currentPage={vm.pagination.currentPage}
        totalPages={vm.pagination.totalPages}
        onPrevPage={vm.pagination.prevPage}
        onNextPage={vm.pagination.nextPage}
        canGoPrev={vm.pagination.canGoPrev}
        canGoNext={vm.pagination.canGoNext}
      />

      <FlatList
        data={vm.directors}
        renderItem={({ item }) => (
          <DirectorCard
            director={item}
            onRemove={() => vm.handleRemoveDirector(item)}
            onRestore={() => vm.handleRestoreDirector(item)}
            onEditVenues={() => vm.handleEditVenues(item)}
            isProcessing={vm.processing === item.director_id}
            showActions
            canRemove={vm.canRemoveDirectors && item.active_venue_count > 0}
            canRestore={vm.canViewArchivedDirectors && item.active_venue_count === 0}
            canEditVenues={vm.canRemoveDirectors && item.active_venue_count > 0}
          />
        )}
        keyExtractor={(item) => item.director_id.toString()}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing} onRefresh={vm.onRefresh} tintColor={COLORS.primary} />
          )
        }
        ListEmptyComponent={
          <EmptyState
            message={vm.filters.status === "active" ? "No active directors" : vm.filters.status === "archived" ? "No archived directors" : "No directors found"}
            submessage={vm.filters.search ? "Try adjusting your search" : vm.canAddDirectors ? "Add your first director to get started" : "Directors will appear here when added"}
          />
        }
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          vm.pagination.totalCount > 0 ? (
            <Pagination
              totalCount={vm.pagination.totalCount}
              displayStart={vm.pagination.displayRange.start}
              displayEnd={vm.pagination.displayRange.end}
              currentPage={vm.pagination.currentPage}
              totalPages={vm.pagination.totalPages}
              onPrevPage={vm.pagination.prevPage}
              onNextPage={vm.pagination.nextPage}
              canGoPrev={vm.pagination.canGoPrev}
              canGoNext={vm.pagination.canGoNext}
            />
          ) : null
        }
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

      <EditDirectorVenuesModal
        visible={vm.showEditVenuesModal}
        director={vm.editingDirector}
        allVenues={vm.venueOptions}
        onSave={vm.confirmEditVenues}
        onCancel={() => vm.setShowEditVenuesModal(false)}
        isProcessing={vm.processing !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: { alignItems: "center", paddingBottom: SPACING.xl },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.xl + SPACING.lg),
    paddingBottom: scale(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: { paddingTop: scale(SPACING.lg) },
  backButton: { padding: scale(SPACING.xs) },
  backText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.primary, fontWeight: "600" },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text },
  placeholder: { width: scale(50) },
  statsContainer: {
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statsText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center" },
  searchContainer: {
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.md),
    paddingBottom: scale(SPACING.sm),
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(8),
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.text,
  },
  addButton: {
    marginHorizontal: scale(SPACING.md),
    marginBottom: scale(SPACING.sm),
    backgroundColor: COLORS.primary,
    paddingVertical: scale(SPACING.sm),
    borderRadius: scale(8),
    alignItems: "center",
  },
  addButtonText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.white },

  listContent: { padding: scale(SPACING.md), paddingBottom: scale(SPACING.xl) },
});

