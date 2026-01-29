import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
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
import { useTDDashboard } from "../../../src/viewmodels/useTDDashboard";
import { EmptyState } from "../../../src/views/components/dashboard";

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTime = (timeString: string): string => {
  if (!timeString) return "";
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case "active":
      return COLORS.success;
    case "completed":
      return COLORS.primary;
    case "cancelled":
      return COLORS.error;
    default:
      return COLORS.textSecondary;
  }
};

// TD Tournament Card - With edit/delete actions
const TDTournamentCard = ({
  tournament,
  onEdit,
  onDelete,
}: {
  tournament: any;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const statusColor = getStatusColor(tournament.status);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.tournamentName} numberOfLines={2}>
          {tournament.name}
        </Text>
        <View
          style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {tournament.status}
          </Text>
        </View>
      </View>

      <Text style={styles.gameType}>
        {tournament.game_type} •{" "}
        {tournament.tournament_format?.replace("_", " ")}
      </Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoIcon}>📅</Text>
        <Text style={styles.infoText}>
          {formatDate(tournament.tournament_date)}
          {tournament.start_time && ` at ${formatTime(tournament.start_time)}`}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.infoIcon}>📍</Text>
        <Text style={styles.infoText} numberOfLines={1}>
          {tournament.venue_name}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{tournament.views_count || 0}</Text>
          <Text style={styles.statLabel}>Views</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {tournament.favorites_count || 0}
          </Text>
          <Text style={styles.statLabel}>Favorites</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
          <Text style={styles.actionButtonText}>✏️ Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={onDelete}
        >
          <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function MyTournamentsScreen() {
  const router = useRouter();
  const vm = useTDDashboard();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

  const handleEditTournament = (tournamentId: number) => {
    router.push({
      pathname: "/(tabs)/admin/edit-tournament-td/[id]",
      params: { id: tournamentId.toString() },
    } as any);
  };

  const handleDeleteTournament = (tournament: any) => {
    Alert.alert(
      "Delete Tournament",
      `Are you sure you want to delete "${tournament.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Alert.alert("Success", "Tournament deleted successfully");
            vm.onRefresh();
          },
        },
      ],
    );
  };

  const filteredTournaments = vm.tournaments.filter((tournament) => {
    const matchesSearch =
      tournament.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tournament.game_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tournament.venue_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      selectedFilter === "all" || tournament.status === selectedFilter;

    return matchesSearch && matchesFilter;
  });

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading your tournaments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>MY TOURNAMENTS</Text>
          <Text style={styles.headerSubtitle}>
            {vm.tournaments.length} tournament
            {vm.tournaments.length !== 1 ? "s" : ""} you're directing
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search your tournaments..."
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View style={styles.filterContainer}>
        {["All", "Active", "Completed"].map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterTab,
              selectedFilter === filter.toLowerCase() && styles.activeFilterTab,
            ]}
            onPress={() => setSelectedFilter(filter.toLowerCase())}
          >
            <Text
              style={[
                styles.filterText,
                selectedFilter === filter.toLowerCase() &&
                  styles.activeFilterText,
              ]}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredTournaments}
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
          <TDTournamentCard
            tournament={item}
            onEdit={() => handleEditTournament(item.id)}
            onDelete={() => handleDeleteTournament(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            message="No tournaments found"
            submessage={
              selectedFilter === "all"
                ? "You haven't been assigned to any tournaments as Tournament Director yet."
                : `No ${selectedFilter} tournaments found.`
            }
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
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
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
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: 8,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
    alignItems: "center",
  },
  activeFilterTab: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  activeFilterText: {
    color: COLORS.surface,
    fontWeight: "600",
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
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.xs,
  },
  tournamentName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  gameType: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    textTransform: "capitalize",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  infoIcon: {
    fontSize: FONT_SIZES.sm,
    marginRight: SPACING.xs,
    width: 20,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.lg,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    flex: 1,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  deleteButton: {
    backgroundColor: "#7F1D1D",
    borderColor: "#991B1B",
  },
  deleteButtonText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
