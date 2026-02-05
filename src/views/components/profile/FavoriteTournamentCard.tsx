import React from "react";
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface FavoriteTournamentCardProps {
  tournament: {
    id: number;
    name: string;
    game_type: string;
    tournament_date: string;
    thumbnail?: string;
    venues: {
      venue: string;
      city: string;
      state: string;
    };
  };
  isFavorited?: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  onShare: () => void;
  onViewImage?: () => void;
  getTournamentImageUrl: (tournament: any) => string | null;
}

export const FavoriteTournamentCard: React.FC<FavoriteTournamentCardProps> = ({
  tournament,
  isFavorited = true,
  onPress,
  onToggleFavorite,
  onShare,
  onViewImage,
  getTournamentImageUrl,
}) => {
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

  const handleUnfavorite = () => {
    Alert.alert(
      "Remove Favorite",
      "Are you sure you want to remove this tournament from your favorites?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: onToggleFavorite,
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardContent}>
        {/* Left Content */}
        <View style={styles.leftContent}>
          {/* Header Row with Game Badge and Heart */}
          <View style={styles.headerRow}>
            <View style={styles.gameTypeBadge}>
              <Text style={styles.gameTypeText}>{tournament.game_type}</Text>
            </View>
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={handleUnfavorite}
            >
              <Text style={styles.heartIcon}>♥</Text>
            </TouchableOpacity>
          </View>

          {/* Tournament Name */}
          <Text style={styles.tournamentName} numberOfLines={2}>
            {tournament.name}
          </Text>

          {/* Venue Info */}
          <Text style={styles.venueInfo} numberOfLines={1}>
            📍 {tournament.venues.venue} • {tournament.venues.city},{" "}
            {tournament.venues.state}
          </Text>

          {/* Date and Time */}
          <Text style={styles.dateTimeInfo}>
            📅 {dateStr} • ⏰ {timeStr}
          </Text>

          {/* Share Button - moved left */}
          <View style={styles.shareRow}>
            <TouchableOpacity style={styles.shareButton} onPress={onShare}>
              <Text style={styles.shareIcon}>📤</Text>
              <Text style={styles.shareText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Right Side - Image Section (bigger) */}
        <View style={styles.rightContent}>
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

          {/* View Image Button (bigger) */}
          {imageUrl && onViewImage && (
            <TouchableOpacity
              style={styles.viewImageButton}
              onPress={onViewImage}
            >
              <Text style={styles.viewImageIcon}>🔍</Text>
              <Text style={styles.viewImageText}>View Image</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    overflow: "hidden",
  },
  cardContent: {
    flexDirection: "row",
    padding: SPACING.md + 2,
  },
  leftContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  rightContent: {
    alignItems: "center",
    justifyContent: "flex-start",
    minWidth: 110, // Increased for bigger image
  },
  imageContainer: {
    marginBottom: SPACING.sm,
  },
  tournamentImage: {
    width: 110, // Increased from 80 to 110
    height: 110, // Increased from 80 to 110
    borderRadius: RADIUS.md,
  },
  placeholderImage: {
    width: 110, // Increased from 80 to 110
    height: 110, // Increased from 80 to 110
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: FONT_SIZES.xl + 8, // Bigger emoji
  },
  viewImageButton: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm, // Increased padding
    paddingHorizontal: SPACING.md, // Increased padding
    flexDirection: "row",
    alignItems: "center",
    minWidth: 110, // Match image width
    justifyContent: "center",
  },
  viewImageIcon: {
    fontSize: FONT_SIZES.sm, // Bigger icon
    marginRight: SPACING.xs,
  },
  viewImageText: {
    fontSize: FONT_SIZES.sm, // Bigger text
    color: COLORS.primary,
    fontWeight: "600",
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
  favoriteButton: {
    padding: SPACING.xs,
  },
  heartIcon: {
    fontSize: FONT_SIZES.lg * 2, // Double the size
    color: COLORS.error, // Always red since these are favorites
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
  shareRow: {
    alignItems: "flex-start", // Moved to left
    marginTop: SPACING.xs,
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
});
