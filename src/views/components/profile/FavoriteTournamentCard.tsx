import React from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

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
  card: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: scale(SPACING.sm), overflow: "hidden" },
  cardContent: { flexDirection: "row", padding: scale(SPACING.md + 2) },
  leftContent: { flex: 1, marginRight: scale(SPACING.sm) },
  rightContent: { alignItems: "center", justifyContent: "flex-start", minWidth: scale(110) },
  imageContainer: { marginBottom: scale(SPACING.sm) },
  tournamentImage: { width: scale(110), height: scale(110), borderRadius: RADIUS.md },
  placeholderImage: { width: scale(110), height: scale(110), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  placeholderText: { fontSize: moderateScale(FONT_SIZES.xl + 8) },
  viewImageButton: { backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary, borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: scale(SPACING.sm), paddingHorizontal: scale(SPACING.md), flexDirection: "row", alignItems: "center", minWidth: scale(110), justifyContent: "center" },
  viewImageIcon: { fontSize: moderateScale(FONT_SIZES.sm), marginRight: scale(SPACING.xs) },
  viewImageText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: scale(SPACING.sm) },
  gameTypeBadge: { flexShrink: 1, maxWidth: "75%", backgroundColor: COLORS.primary, paddingVertical: 3, paddingHorizontal: scale(SPACING.sm + 1), borderRadius: RADIUS.sm },
  gameTypeText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", textTransform: "uppercase" },
  favoriteButton: { padding: scale(SPACING.xs) },
  heartIcon: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.error },
  tournamentName: { fontSize: moderateScale(FONT_SIZES.md + 1), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.sm), lineHeight: moderateScale((FONT_SIZES.md + 1) * 1.2) },
  venueInfo: { fontSize: moderateScale(FONT_SIZES.sm + 1), color: COLORS.textSecondary, marginBottom: scale(SPACING.sm) },
  dateTimeInfo: { fontSize: moderateScale(FONT_SIZES.sm + 1), color: COLORS.textSecondary, marginBottom: scale(SPACING.sm) },
  shareRow: { alignItems: "flex-start", marginTop: scale(SPACING.xs) },
  shareButton: { flexDirection: "row", alignItems: "center", paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm) },
  shareIcon: { fontSize: moderateScale(FONT_SIZES.md), marginRight: scale(SPACING.xs) },
  shareText: { fontSize: moderateScale(FONT_SIZES.sm + 1), color: COLORS.primary, fontWeight: "600" },
});
