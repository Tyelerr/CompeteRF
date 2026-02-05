import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { searchAlertService } from "../../../src/models/services/search-alert.service";
import { AlertMatch } from "../../../src/models/types/search-alert.types";
import { COLORS } from "../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { Loading } from "../../../src/views/components/common/loading";
import { Pagination } from "../../../src/views/components/common/pagination";

// Tournament Card Component
function TournamentCard({ match }: { match: AlertMatch }) {
  const router = useRouter();
  const tournament = (match as any).tournaments;

  if (!tournament) return null;

  const handlePress = () => {
    router.push(`/(tabs)/tournament/${tournament.id}` as any);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const isUpcoming = new Date(tournament.tournament_date) >= new Date();

  return (
    <TouchableOpacity style={styles.tournamentCard} onPress={handlePress}>
      <View
        style={[
          styles.statusBadge,
          isUpcoming ? styles.upcomingBadge : styles.pastBadge,
        ]}
      >
        <Text
          style={[
            styles.statusText,
            isUpcoming ? styles.upcomingText : styles.pastText,
          ]}
        >
          {isUpcoming ? "Upcoming" : "Past"}
        </Text>
      </View>

      <Text style={styles.tournamentName} numberOfLines={2}>
        {tournament.name}
      </Text>

      <Text style={styles.gameType}>{tournament.game_type}</Text>

      {tournament.venues && (
        <Text style={styles.venueInfo} numberOfLines={1}>
          📍 {tournament.venues.venue} • {tournament.venues.city},{" "}
          {tournament.venues.state}
        </Text>
      )}

      <View style={styles.dateTimeRow}>
        <Text style={styles.dateText}>
          📅 {formatDate(tournament.tournament_date)}
        </Text>
        {(tournament as any).start_time && (
          <Text style={styles.timeText}>
            🕐 {formatTime((tournament as any).start_time)}
          </Text>
        )}
      </View>

      {(tournament as any).entry_fee && (
        <Text style={styles.entryFee}>
          💰 ${(tournament as any).entry_fee}
        </Text>
      )}

      <Text style={styles.matchedDate}>
        Matched: {formatDate(match.created_at)}
      </Text>
    </TouchableOpacity>
  );
}

export default function ViewMatchesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [alert, setAlert] = useState<any>(null);
  const [matches, setMatches] = useState<AlertMatch[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<AlertMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"upcoming" | "recent">("upcoming");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    if (id) {
      loadAlert();
      loadMatches();
    }
  }, [id]);

  useEffect(() => {
    filterAndSortMatches();
    setCurrentPage(1);
  }, [matches, searchQuery, sortBy]);

  const loadAlert = async () => {
    try {
      const alertData = await searchAlertService.getAlert(
        parseInt(id as string),
      );
      setAlert(alertData);
    } catch (err) {
      console.error("Error loading alert:", err);
      setError("Failed to load alert details");
    }
  };

  const loadMatches = async () => {
    try {
      setError(null);
      const matchesData = await searchAlertService.getAlertMatches(
        parseInt(id as string),
      );
      setMatches(matchesData);
    } catch (err) {
      console.error("Error loading matches:", err);
      setError("Failed to load matches");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterAndSortMatches = () => {
    let filtered = matches;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = matches.filter(
        (match) =>
          (match as any).tournaments?.name?.toLowerCase().includes(query) ||
          (match as any).tournaments?.game_type
            ?.toLowerCase()
            .includes(query) ||
          (match as any).tournaments?.venues?.venue
            ?.toLowerCase()
            .includes(query) ||
          (match as any).tournaments?.venues?.city
            ?.toLowerCase()
            .includes(query),
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === "upcoming") {
        const dateA = new Date((a as any).tournaments?.tournament_date || "");
        const dateB = new Date((b as any).tournaments?.tournament_date || "");
        const now = new Date();

        const aIsUpcoming = dateA >= now;
        const bIsUpcoming = dateB >= now;

        if (aIsUpcoming && !bIsUpcoming) return -1;
        if (!aIsUpcoming && bIsUpcoming) return 1;

        if (aIsUpcoming && bIsUpcoming) {
          return dateA.getTime() - dateB.getTime();
        } else {
          return dateB.getTime() - dateA.getTime();
        }
      } else {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    });

    setFilteredMatches(filtered);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMatches();
  };

  const toggleSort = () => {
    setSortBy(sortBy === "upcoming" ? "recent" : "upcoming");
  };

  // Pagination
  const totalCount = filteredMatches.length;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);
  const paginatedMatches = filteredMatches.slice(startIndex, endIndex);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (loading) {
    return <Loading fullScreen message="Loading matches..." />;
  }

  const renderMatch = ({ item }: { item: AlertMatch }) => {
    return <TournamentCard match={item} />;
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🔍</Text>
      <Text style={styles.emptyTitle}>
        {searchQuery ? "No matches found" : "No tournaments matched yet"}
      </Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery
          ? `No tournaments match "${searchQuery}"`
          : "When tournaments match your alert criteria, they'll appear here!"}
      </Text>
      {searchQuery && (
        <TouchableOpacity
          style={styles.clearSearchButton}
          onPress={() => setSearchQuery("")}
        >
          <Text style={styles.clearSearchText}>Clear Search</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alert Matches</Text>
      </View>

      {/* Alert Info */}
      {alert && (
        <View style={styles.alertInfo}>
          <Text style={styles.alertName}>{alert.name}</Text>
          <Text style={styles.alertDescription}>
            {alert.description ||
              searchAlertService.generateAlertDescription(
                alert.filter_criteria,
              )}
          </Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search tournaments..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSearchQuery("")}
            >
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.sortButton} onPress={toggleSort}>
          <Text style={styles.sortIcon}>
            {sortBy === "upcoming" ? "📅" : "🕐"}
          </Text>
          <Text style={styles.sortText}>
            {sortBy === "upcoming" ? "Date" : "Recent"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pagination */}
      {totalCount > 0 && (
        <Pagination
          totalCount={totalCount}
          displayStart={startIndex + 1}
          displayEnd={endIndex}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          canGoPrev={currentPage > 1}
          canGoNext={currentPage < totalPages}
        />
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadMatches}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      <FlatList
        data={paginatedMatches}
        renderItem={renderMatch}
        keyExtractor={(item) => item.id.toString()}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          paginatedMatches.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  backButton: {
    marginRight: SPACING.md,
  },
  backButtonText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  alertInfo: {
    padding: SPACING.md,
    backgroundColor: COLORS.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  alertName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  alertDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    gap: SPACING.md,
    backgroundColor: COLORS.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    fontSize: FONT_SIZES.md,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  clearButton: {
    padding: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  clearIcon: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    height: 44,
    minWidth: 80,
  },
  sortIcon: {
    fontSize: FONT_SIZES.sm,
    marginRight: SPACING.xs,
  },
  sortText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.white,
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: COLORS.error + "20",
    padding: SPACING.md,
    margin: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    flex: 1,
  },
  retryButton: {
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  retryText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.md,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  tournamentCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: "relative",
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusBadge: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  upcomingBadge: {
    backgroundColor: COLORS.primary + "20",
  },
  pastBadge: {
    backgroundColor: COLORS.textMuted + "20",
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
  },
  upcomingText: {
    color: COLORS.primary,
  },
  pastText: {
    color: COLORS.textMuted,
  },
  tournamentName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    paddingRight: SPACING.xl,
    lineHeight: 22,
  },
  gameType: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "500",
    marginBottom: SPACING.sm,
    textTransform: "uppercase",
  },
  venueInfo: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 18,
  },
  dateTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  dateText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  timeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  entryFee: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  matchedDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: "italic",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.lg,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  clearSearchButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  clearSearchText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});
