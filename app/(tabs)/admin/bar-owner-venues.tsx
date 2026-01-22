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
import { useBarOwnerVenues } from "../../../src/viewmodels/useBarOwnerVenues";
import { EmptyState } from "../../../src/views/components/dashboard";
import { BarOwnerVenueCard } from "../../../src/views/components/venues";

export default function BarOwnerVenuesScreen() {
  const router = useRouter();
  const vm = useBarOwnerVenues();

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
        <Text style={styles.headerTitle}>My Venues</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Search & Add Row */}
      <View style={styles.controlsRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search venues..."
          placeholderTextColor={COLORS.textSecondary}
          value={vm.searchQuery}
          onChangeText={vm.setSearchQuery}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleCreateVenue}>
          <Text style={styles.addButtonText}>+ Add Venue</Text>
        </TouchableOpacity>
      </View>

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
            message="No venues yet"
            submessage="Add your first venue to start managing tournaments"
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
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.xl * 3,
    marginBottom: SPACING.lg,
  },
  searchInput: {
    flex: 0.7,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.surface,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
});
