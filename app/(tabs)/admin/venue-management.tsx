import { useRouter } from "expo-router";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useAdminVenues } from "../../../src/viewmodels/useAdminVenues";
import { Dropdown } from "../../../src/views/components/common/dropdown";
import { Pagination } from "../../../src/views/components/common/pagination";
import { EmptyState } from "../../../src/views/components/dashboard";
import { BarOwnerVenueCard } from "../../../src/views/components/venues";

export default function VenueManagementScreen() {
  const router = useRouter();
  const vm = useAdminVenues();

  const handleVenuePress = (venueId: number) => {
    router.push(`/(tabs)/admin/edit-venue/${venueId}` as any);
  };

  const handleManageTables = (venueId: number) => {
    router.push(`/(tabs)/admin/edit-venue/${venueId}?tab=tables` as any);
  };

  const handleManageDirectors = (venueId: number) => {
    router.push(`/(tabs)/admin/edit-venue/${venueId}?tab=directors` as any);
  };

  const handleCreateVenue = () => {
    router.push("/(tabs)/admin/create-venue" as any);
  };

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading venues...</Text>
      </View>
    );
  }

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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>VENUE MANAGEMENT</Text>
          <Text style={styles.headerSubtitle}>
            {vm.totalCount} total venues
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Search Row */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search venues..."
            placeholderTextColor={COLORS.textSecondary}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleCreateVenue}>
          <Text style={styles.addButtonText}>+ Add Venue</Text>
        </TouchableOpacity>
      </View>

      {/* Sort Row */}
      <View style={styles.sortRow}>
        <View style={styles.sortContainer}>
          <Dropdown
            options={vm.sortOptions}
            value={vm.sortOption}
            onSelect={(value) => vm.setSortOption(value as any)}
            placeholder="Sort"
          />
        </View>
      </View>

      {/* Pagination */}
      <Pagination
        totalCount={vm.totalCount}
        displayStart={vm.displayStart}
        displayEnd={vm.displayEnd}
        currentPage={vm.currentPage}
        totalPages={vm.totalPages}
        onPrevPage={vm.goToPrevPage}
        onNextPage={vm.goToNextPage}
        canGoPrev={vm.canGoPrev}
        canGoNext={vm.canGoNext}
      />

      {/* Venue List */}
      <FlatList
        data={vm.venues}
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
          <BarOwnerVenueCard
            venue={item}
            onPress={() => handleVenuePress(item.id)}
            onManageTables={() => handleManageTables(item.id)}
            onManageDirectors={() => handleManageDirectors(item.id)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            message="No venues found"
            submessage="Try a different search or add a new venue"
          />
        }
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
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: 2,
  },
  placeholder: {
    width: 50,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl,
    gap: SPACING.md,
  },
  searchContainer: {
    flex: 0.7,
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
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
  },
  addButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: "#fff",
  },
  sortRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  sortContainer: {
    width: 120,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
});
