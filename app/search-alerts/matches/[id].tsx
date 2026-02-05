import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  Share,
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

// Game type to image mapping (same as profile/billiards)
const gameTypeImageMap: Record<string, string> = {
  "8-ball": "8-ball.jpeg",
  "9-ball": "9-ball.jpeg",
  "10-ball": "10-ball.jpeg",
  "one-pocket": "One-Pocket.jpeg",
  "straight-pool": "Straight-Pool.jpeg",
  banks: "Banks.jpeg",
};

const SUPABASE_STORAGE_URL =
  "https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images";

function getTournamentImageUrl(tournament: any): string | null {
  if (tournament.thumbnail) {
    if (tournament.thumbnail.startsWith("custom:")) {
      return tournament.thumbnail.replace("custom:", "");
    }
    const imageFile = gameTypeImageMap[tournament.thumbnail];
    if (imageFile) return `${SUPABASE_STORAGE_URL}/${imageFile}`;
  }
  const imageFile = gameTypeImageMap[tournament.game_type];
  if (imageFile) return `${SUPABASE_STORAGE_URL}/${imageFile}`;
  return null;
}

// Tournament Card Component — matches FavoriteTournamentCard design
function TournamentCard({ match }: { match: AlertMatch }) {
  const router = useRouter();
  const tournament = (match as any).tournaments;

  if (!tournament) return null;

  const handlePress = () => {
    router.push(`/tournament-detail?id=${tournament.id}` as any);
  };

  const handleShare = async () => {
    try {
      const venue = tournament.venues
        ? `${tournament.venues.venue} • ${tournament.venues.city}, ${tournament.venues.state}`
        : "";
      await Share.share({
        message: `Check out this tournament: ${tournament.name}${venue ? `\n📍 ${venue}` : ""}\n📅 ${dateStr}`,
      });
    } catch (err) {
      console.log("Share error:", err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return { dateStr, timeStr };
  };

  const { dateStr, timeStr } = formatDateTime(tournament.tournament_date);
  const imageUrl = getTournamentImageUrl(tournament);

  return (
    <TouchableOpacity style={styles.tournamentCard} onPress={handlePress}>
      <View style={styles.cardContent}>
        {/* Main Content Area */}
        <View style={styles.mainContent}>
          {/* Game Type Badge */}
          <View style={styles.headerRow}>
            <View style={styles.gameTypeBadge}>
              <Text style={styles.gameTypeText}>{tournament.game_type}</Text>
            </View>
          </View>

          {/* Tournament Name */}
          <Text style={styles.tournamentName} numberOfLines={2}>
            {tournament.name}
          </Text>

          {/* Venue Info */}
          {tournament.venues && (
            <Text style={styles.venueInfo} numberOfLines={1}>
              📍 {tournament.venues.venue} • {tournament.venues.city},{" "}
              {tournament.venues.state}
            </Text>
          )}

          {/* Date and Time */}
          <Text style={styles.dateTimeInfo}>
            📅 {dateStr} • ⏰ {timeStr}
          </Text>

          {/* Entry Fee */}
          {tournament.entry_fee != null && (
            <Text style={styles.entryFee}>💰 ${tournament.entry_fee}</Text>
          )}

          {/* Matched Date */}
          <View style={styles.matchedRow}>
            <Text style={styles.matchedDate}>
              Matched: {formatDate(match.created_at)}
            </Text>
          </View>
        </View>

        {/* Image Section — Top Right */}
        <View style={styles.imageSection}>
          <View style={styles.imageContainer}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.tournamentImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.placeholderImage}>
                <Text style={styles.placeholderText}>🎱</Text>
              </View>
            )}
          </View>

          {/* Share Button */}
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareIcon}>📤</Text>
            <Text style={styles.shareText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    overflow: "hidden",
  },
  cardContent: {
    flexDirection: "row",
    padding: SPACING.lg,
  },
  mainContent: {
    flex: 1,
    marginRight: SPACING.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  gameTypeBadge: {
    backgroundColor: COLORS.primary,
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm + 1,
    borderRadius: RADIUS.sm,
  },
  gameTypeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  tournamentName: {
    fontSize: FONT_SIZES.md + 1,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    lineHeight: (FONT_SIZES.md + 1) * 1.2,
  },
  venueInfo: {
    fontSize: FONT_SIZES.sm + 1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  dateTimeInfo: {
    fontSize: FONT_SIZES.sm + 1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  entryFee: {
    fontSize: FONT_SIZES.sm + 1,
    color: COLORS.primary,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  matchedRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  matchedDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: "italic",
  },
  imageSection: {
    alignItems: "center",
    minWidth: 100,
  },
  imageContainer: {
    marginBottom: SPACING.sm,
  },
  tournamentImage: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.md,
  },
  placeholderImage: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: FONT_SIZES.xl + 8,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  shareIcon: {
    fontSize: FONT_SIZES.md,
    marginRight: SPACING.xs,
  },
  shareText: {
    fontSize: FONT_SIZES.sm + 1,
    color: COLORS.primary,
    fontWeight: "600",
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
