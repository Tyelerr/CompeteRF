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
import {
  DirectorWithVenue,
  useMyDirectors,
} from "../../../src/viewmodels/useMyDirectors";
import { EmptyState } from "../../../src/views/components/dashboard";

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day";
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
  return `${Math.floor(diffDays / 365)} years`;
};

const DirectorCard = ({
  director,
  onDelete,
}: {
  director: DirectorWithVenue;
  onDelete: () => void;
}) => {
  return (
    <View style={styles.card}>
      {/* Top Row: Avatar, Info, Delete Button */}
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {director.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.directorName}>{director.name}</Text>
          <Text style={styles.directorEmail}>{director.email}</Text>
          <Text style={styles.directorId}>ID: {director.director_id}</Text>
        </View>
        <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Box */}
      <View style={styles.statsBox}>
        <View style={styles.statRow}>
          <Text style={styles.statIcon}>🏢</Text>
          <Text style={styles.statText}>{director.venue_name}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statIcon}>📅</Text>
          <Text style={styles.statText}>
            {formatDate(director.assigned_at)} (
            {formatTimeAgo(director.assigned_at)})
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statIcon}>🏆</Text>
          <Text style={styles.statText}>
            {director.tournament_count} tournament
            {director.tournament_count !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default function MyDirectorsScreen() {
  const router = useRouter();
  const vm = useMyDirectors();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading directors...</Text>
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
        <Text style={styles.headerTitle}>My Directors</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Stats Banner */}
      <View style={styles.statsBanner}>
        <Text style={styles.statsText}>
          {vm.directors.length} director{vm.directors.length !== 1 ? "s" : ""}{" "}
          across {Object.keys(vm.directorsByVenue).length} venue
          {Object.keys(vm.directorsByVenue).length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email, venue, or ID..."
          placeholderTextColor={COLORS.textSecondary}
          value={vm.searchQuery}
          onChangeText={vm.setSearchQuery}
        />
      </View>

      {/* Add Director Button */}
      <View style={styles.addButtonContainer}>
        <TouchableOpacity
          style={styles.addDirectorButton}
          onPress={() => router.push("/(tabs)/admin/add-director" as any)}
        >
          <Text style={styles.addDirectorButtonText}>+ Add Director</Text>
        </TouchableOpacity>
      </View>

      {/* Directors List */}
      <FlatList
        data={vm.directors}
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
          <DirectorCard
            director={item}
            onDelete={() => vm.confirmRemoveDirector(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            message="No directors yet"
            submessage="Add directors to manage your tournaments"
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
  statsBanner: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
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
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addButtonContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  addDirectorButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addDirectorButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.surface,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.surface,
  },
  headerInfo: {
    flex: 1,
  },
  directorName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  directorEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  directorId: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.error + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteIcon: {
    fontSize: 24,
  },
  statsBox: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  statIcon: {
    fontSize: FONT_SIZES.md,
    marginRight: SPACING.sm,
    width: 24,
  },
  statText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
});
