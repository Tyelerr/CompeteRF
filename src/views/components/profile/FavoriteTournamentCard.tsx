import React from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { Platform } from "react-native";
const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

interface FavoriteTournamentCardProps {
  tournament: {
    id: number;
    name: string;
    game_type: string;
    tournament_date: string;
    thumbnail?: string;
    venues: { venue: string; city: string; state: string };
  };
  isFavorited?: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  onShare: () => void;
  onViewImage?: () => void;
  getTournamentImageUrl: (tournament: any) => string | null;
}

export const FavoriteTournamentCard: React.FC<FavoriteTournamentCardProps> = ({ tournament, isFavorited = true, onPress, onToggleFavorite, onShare, onViewImage, getTournamentImageUrl }) => {
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return { dateStr, timeStr };
  };

  const { dateStr, timeStr } = formatDateTime(tournament.tournament_date);
  const imageUrl = getTournamentImageUrl(tournament);

  const handleUnfavorite = () => {
    if (isWeb) { onToggleFavorite(); return; }
    Alert.alert("Remove Favorite", "Are you sure you want to remove this tournament from your favorites?",
      [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: onToggleFavorite }],
      { cancelable: true }
    );
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardContent}>
        <View style={styles.leftContent}>
          <View style={styles.headerRow}>
            <View style={styles.gameTypeBadge}>
              <Text allowFontScaling={false} style={styles.gameTypeText} numberOfLines={1}>{tournament.game_type}</Text>
            </View>
            <TouchableOpacity style={styles.favoriteButton} onPress={handleUnfavorite}>
              <Text allowFontScaling={false} style={styles.heartIcon}>♥</Text>
            </TouchableOpacity>
          </View>
          <Text allowFontScaling={false} style={styles.tournamentName} numberOfLines={2}>{tournament.name}</Text>
          <Text allowFontScaling={false} style={styles.venueInfo} numberOfLines={1}>📍 {tournament.venues.venue} • {tournament.venues.city}, {tournament.venues.state}</Text>
          <Text allowFontScaling={false} style={styles.dateTimeInfo}>📅 {dateStr} • ⏰ {timeStr}</Text>
          <View style={styles.shareRow}>
            <TouchableOpacity style={styles.shareButton} onPress={onShare}>
              <Text allowFontScaling={false} style={styles.shareIcon}>📤</Text>
              <Text allowFontScaling={false} style={styles.shareText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.rightContent}>
          <View style={styles.imageContainer}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.tournamentImage} resizeMode="cover" />
            ) : (
              <View style={styles.placeholderImage}>
                <Text allowFontScaling={false} style={styles.placeholderText}>🎱</Text>
              </View>
            )}
          </View>
          {imageUrl && onViewImage && (
            <TouchableOpacity style={styles.viewImageButton} onPress={onViewImage}>
              <Text allowFontScaling={false} style={styles.viewImageIcon}>🔍</Text>
              <Text allowFontScaling={false} style={styles.viewImageText}>View Image</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.backgroundCard, position: "relative", borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: wxSc(SPACING.sm), overflow: "hidden" },
  cardContent: { flexDirection: "row", padding: wxSc(SPACING.md + 2) },
  leftContent: { flex: 1, marginRight: wxSc(SPACING.sm) },
  rightContent: { alignItems: "center", justifyContent: "flex-start", minWidth: wxSc(110) },
  imageContainer: { marginBottom: wxSc(SPACING.sm) },
  tournamentImage: { width: wxSc(110), height: wxSc(110), borderRadius: RADIUS.md },
  placeholderImage: { width: wxSc(110), height: wxSc(110), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  placeholderText: { fontSize: wxMs(FONT_SIZES.xl + 8) },
  viewImageButton: { backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary, borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: wxSc(SPACING.sm), paddingHorizontal: wxSc(SPACING.md), flexDirection: "row", alignItems: "center", minWidth: wxSc(110), justifyContent: "center" },
  viewImageIcon: { fontSize: wxMs(FONT_SIZES.sm), marginRight: wxSc(SPACING.xs) },
  viewImageText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: wxSc(SPACING.sm) },
  gameTypeBadge: { flexShrink: 1, maxWidth: "75%", backgroundColor: COLORS.primary, paddingVertical: 3, paddingHorizontal: wxSc(SPACING.sm + 1), borderRadius: RADIUS.sm },
  gameTypeText: { color: COLORS.white, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", textTransform: "uppercase" },
  favoriteButton: { padding: wxSc(SPACING.xs), alignSelf: "flex-start" },
  heartIcon: { fontSize: isWeb ? 36 : wxMs(20), color: COLORS.error },
  tournamentName: { fontSize: wxMs(FONT_SIZES.md + 1), fontWeight: "600", color: COLORS.text, marginBottom: wxSc(SPACING.sm), lineHeight: wxMs((FONT_SIZES.md + 1) * 1.2) },
  venueInfo: { fontSize: wxMs(FONT_SIZES.sm + 1), color: COLORS.textSecondary, marginBottom: wxSc(SPACING.sm) },
  dateTimeInfo: { fontSize: wxMs(FONT_SIZES.sm + 1), color: COLORS.textSecondary, marginBottom: wxSc(SPACING.sm) },
  shareRow: { alignItems: "flex-start", marginTop: wxSc(SPACING.xs) },
  shareButton: { flexDirection: "row", alignItems: "center", paddingVertical: wxSc(SPACING.xs), paddingHorizontal: wxSc(SPACING.sm) },
  shareIcon: { fontSize: wxMs(FONT_SIZES.md), marginRight: wxSc(SPACING.xs) },
  shareText: { fontSize: wxMs(FONT_SIZES.sm + 1), color: COLORS.primary, fontWeight: "600" },
});
