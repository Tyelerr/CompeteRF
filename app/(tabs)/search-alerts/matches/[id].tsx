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
import { searchAlertService } from "../../../../src/models/services/search-alert.service";
import { normalizeGameType } from "../../../../src/models/services/tournament.service";
import { AlertMatch } from "../../../../src/models/types/search-alert.types";
import { COLORS } from "../../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { moderateScale, scale } from "../../../../src/utils/scaling";
import { Loading } from "../../../../src/views/components/common/loading";
import { Pagination } from "../../../../src/views/components/common/pagination";

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
  const rawGameType: string = tournament.game_type ?? "";
  // Strip scotch doubles suffix so "9-ball-scotch-doubles" maps to the "9-ball" image
  const baseSlug = rawGameType.toLowerCase().replace("-scotch-doubles", "").replace(" scotch doubles", "").replace(" ", "-").trim();
  if (tournament.thumbnail) {
    if (tournament.thumbnail.startsWith("custom:")) return tournament.thumbnail.replace("custom:", "");
    const thumbSlug = tournament.thumbnail.toLowerCase().replace("-scotch-doubles", "").replace(" scotch doubles", "").replace(" ", "-").trim();
    const imageFile = gameTypeImageMap[thumbSlug] || gameTypeImageMap[baseSlug];
    if (imageFile) return `${SUPABASE_STORAGE_URL}/${imageFile}`;
  }
  const imageFile = gameTypeImageMap[baseSlug] || gameTypeImageMap[rawGameType.toLowerCase()];
  if (imageFile) return `${SUPABASE_STORAGE_URL}/${imageFile}`;
  return null;
}

function TournamentCard({ match }: { match: AlertMatch }) {
  const router = useRouter();
  const tournament = (match as any).tournaments;
  if (!tournament) return null;

  const handlePress = () => {
    router.push(`/(tabs)/tournament-detail?id=${tournament.id}&from=/(tabs)/search-alerts` as any);
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

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
    return { dateStr, timeStr };
  };

  const { dateStr, timeStr } = formatDateTime(tournament.tournament_date);
  const imageUrl = getTournamentImageUrl(tournament);

  return (
    <TouchableOpacity style={styles.tournamentCard} onPress={handlePress} activeOpacity={0.8}>
      <View style={styles.cardContent}>
        <View style={styles.mainContent}>
          <View style={styles.headerRow}>
            <View style={styles.gameTypeBadge}>
              <Text allowFontScaling={false} style={styles.gameTypeText}>{normalizeGameType(tournament.game_type)}</Text>
            </View>
          </View>
          <Text allowFontScaling={false} style={styles.tournamentName} numberOfLines={2}>
            {tournament.name}
          </Text>
          {tournament.venues && (
            <View style={styles.infoRow}>
              <Text allowFontScaling={false} style={styles.infoIcon}>📍</Text>
              <Text allowFontScaling={false} style={styles.infoText} numberOfLines={1}>
                {tournament.venues.venue} • {tournament.venues.city}, {tournament.venues.state}
              </Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text allowFontScaling={false} style={styles.infoIcon}>📅</Text>
            <Text allowFontScaling={false} style={styles.infoText}>{dateStr} • {timeStr}</Text>
          </View>
          {tournament.entry_fee != null && (
            <View style={styles.infoRow}>
              <Text allowFontScaling={false} style={styles.infoIcon}>💰</Text>
              <Text allowFontScaling={false} style={styles.entryFeeText}>${tournament.entry_fee} entry</Text>
            </View>
          )}
          <View style={styles.matchedRow}>
            <Text allowFontScaling={false} style={styles.matchedDate}>
              🔔 Matched {formatDate(match.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.imageSection}>
          <View style={styles.imageContainer}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.tournamentImage} resizeMode="cover" />
            ) : (
              <View style={styles.placeholderImage}>
                <Text allowFontScaling={false} style={styles.placeholderText}>🎱</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text allowFontScaling={false} style={styles.shareIcon}>📤</Text>
            <Text allowFontScaling={false} style={styles.shareText}>Share</Text>
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
    if (id) { loadAlert(); loadMatches(); }
  }, [id]);

  useEffect(() => {
    filterAndSortMatches();
    setCurrentPage(1);
  }, [matches, searchQuery, sortBy]);

  const loadAlert = async () => {
    try {
      const alertData = await searchAlertService.getAlert(parseInt(id as string));
      setAlert(alertData);
    } catch (err) {
      console.error("Error loading alert:", err);
      setError("Failed to load alert details");
    }
  };

  const loadMatches = async () => {
    try {
      setError(null);
      const matchesData = await searchAlertService.getAlertMatches(parseInt(id as string));
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
          (match as any).tournaments?.game_type?.toLowerCase().includes(query) ||
          (match as any).tournaments?.venues?.venue?.toLowerCase().includes(query) ||
          (match as any).tournaments?.venues?.city?.toLowerCase().includes(query),
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
        if (aIsUpcoming && bIsUpcoming) return dateA.getTime() - dateB.getTime();
        return dateB.getTime() - dateA.getTime();
      } else {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    setFilteredMatches(filtered);
  };

  const handleRefresh = async () => { setRefreshing(true); await loadMatches(); };
  const toggleSort = () => setSortBy(sortBy === "upcoming" ? "recent" : "upcoming");

  const totalCount = filteredMatches.length;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);
  const paginatedMatches = filteredMatches.slice(startIndex, endIndex);

  if (loading) return <Loading fullScreen message="Loading matches..." />;

  const renderMatch = ({ item }: { item: AlertMatch }) => <TournamentCard match={item} />;

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text allowFontScaling={false} style={styles.emptyIcon}>🔍</Text>
      <Text allowFontScaling={false} style={styles.emptyTitle}>
        {searchQuery ? "No matches found" : "No tournaments matched yet"}
      </Text>
      <Text allowFontScaling={false} style={styles.emptySubtitle}>
        {searchQuery
          ? `No tournaments match "${searchQuery}"`
          : "When tournaments match your alert criteria, they'll appear here!"}
      </Text>
      {searchQuery && (
        <TouchableOpacity style={styles.clearSearchButton} onPress={() => setSearchQuery("")}>
          <Text allowFontScaling={false} style={styles.clearSearchText}>Clear Search</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text allowFontScaling={false} style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>Alert Matches</Text>
      </View>

      {alert && (
        <View style={styles.alertInfo}>
          <Text allowFontScaling={false} style={styles.alertName}>{alert.name}</Text>
          <Text allowFontScaling={false} style={styles.alertDescription}>
            {alert.description || searchAlertService.generateAlertDescription(alert.filter_criteria)}
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.searchContainer}>
          <Text allowFontScaling={false} style={styles.searchIcon}>🔍</Text>
          <TextInput
            allowFontScaling={false}
            style={styles.searchInput}
            placeholder="Search tournaments..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.clearButton} onPress={() => setSearchQuery("")}>
              <Text allowFontScaling={false} style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.sortButton} onPress={toggleSort}>
          <Text allowFontScaling={false} style={styles.sortIcon}>
            {sortBy === "upcoming" ? "📅" : "🕐"}
          </Text>
          <Text allowFontScaling={false} style={styles.sortText}>
            {sortBy === "upcoming" ? "Date" : "Recent"}
          </Text>
        </TouchableOpacity>
      </View>

      {totalCount > 0 && (
        <Pagination
          totalCount={totalCount}
          displayStart={startIndex + 1}
          displayEnd={endIndex}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
          onNextPage={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
          canGoPrev={currentPage > 1}
          canGoNext={currentPage < totalPages}
        />
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text allowFontScaling={false} style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadMatches}>
            <Text allowFontScaling={false} style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={paginatedMatches}
        renderItem={renderMatch}
        keyExtractor={(item) => item.id.toString()}
        style={styles.list}
        contentContainerStyle={[styles.listContent, paginatedMatches.length === 0 && styles.listContentEmpty]}
        ListEmptyComponent={renderEmptyState}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.xl + SPACING.lg),
    paddingBottom: scale(SPACING.md),
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  backButton: { marginRight: scale(SPACING.md) },
  backButtonText: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.primary, fontWeight: "600" },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text },
  alertInfo: {
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
    backgroundColor: COLORS.backgroundCard,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  alertName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginBottom: scale(2) },
  alertDescription: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary },
  controls: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
    gap: scale(SPACING.sm),
    backgroundColor: COLORS.backgroundCard,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  searchContainer: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: scale(SPACING.md),
    height: scale(40),
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchIcon: { fontSize: moderateScale(FONT_SIZES.sm), marginRight: scale(SPACING.xs) },
  searchInput: { flex: 1, fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text },
  clearButton: { padding: scale(SPACING.xs), marginLeft: scale(SPACING.xs) },
  clearIcon: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted },
  sortButton: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: scale(SPACING.md),
    height: scale(40),
    borderRadius: RADIUS.md,
    gap: scale(SPACING.xs),
  },
  sortIcon: { fontSize: moderateScale(FONT_SIZES.sm) },
  sortText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.white, fontWeight: "600" },
  errorContainer: {
    backgroundColor: COLORS.error + "20",
    padding: scale(SPACING.md),
    margin: scale(SPACING.md),
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.error,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  errorText: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), flex: 1 },
  retryButton: {
    backgroundColor: COLORS.error,
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
    borderRadius: RADIUS.sm,
  },
  retryText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  list: { flex: 1 },
  listContent: { padding: scale(SPACING.md), paddingBottom: scale(SPACING.xl) },
  listContentEmpty: { flexGrow: 1 },
  tournamentCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: scale(SPACING.md),
    overflow: "hidden",
  },
  cardContent: { flexDirection: "row", padding: scale(SPACING.md) },
  mainContent: { flex: 1, marginRight: scale(SPACING.md) },
  headerRow: { flexDirection: "row", marginBottom: scale(SPACING.sm) },
  gameTypeBadge: {
    backgroundColor: COLORS.primary + "25",
    paddingVertical: scale(3),
    paddingHorizontal: scale(SPACING.sm),
    borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.primary + "50",
  },
  gameTypeText: {
    color: COLORS.primary,
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "700",
    textTransform: "uppercase",
  },
  tournamentName: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: scale(SPACING.sm),
    lineHeight: moderateScale(FONT_SIZES.md) * 1.3,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: scale(4) },
  infoIcon: { fontSize: moderateScale(FONT_SIZES.xs), marginRight: scale(SPACING.xs), marginTop: scale(2), width: scale(16) },
  infoText: { flex: 1, fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary },
  entryFeeText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  matchedRow: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: scale(SPACING.sm),
    marginTop: scale(SPACING.xs),
  },
  matchedDate: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, fontStyle: "italic" },
  imageSection: { alignItems: "center", width: scale(90) },
  imageContainer: { marginBottom: scale(SPACING.sm) },
  tournamentImage: { width: scale(90), height: scale(90), borderRadius: RADIUS.md },
  placeholderImage: {
    width: scale(90), height: scale(90),
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border,
  },
  placeholderText: { fontSize: moderateScale(32) },
  shareButton: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: scale(SPACING.xs),
    paddingHorizontal: scale(SPACING.sm),
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary + "15",
    borderWidth: 1, borderColor: COLORS.primary + "30",
  },
  shareIcon: { fontSize: moderateScale(FONT_SIZES.sm), marginRight: scale(SPACING.xs) },
  shareText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "600" },
  emptyState: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: scale(SPACING.xl * 2),
    paddingHorizontal: scale(SPACING.lg),
  },
  emptyIcon: { fontSize: moderateScale(60), marginBottom: scale(SPACING.md) },
  emptyTitle: {
    fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.text,
    fontWeight: "700", marginBottom: scale(SPACING.sm), textAlign: "center",
  },
  emptySubtitle: {
    fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary,
    textAlign: "center", lineHeight: moderateScale(FONT_SIZES.md) * 1.5,
    marginBottom: scale(SPACING.lg),
  },
  clearSearchButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.sm),
    borderRadius: RADIUS.md,
  },
  clearSearchText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
});
