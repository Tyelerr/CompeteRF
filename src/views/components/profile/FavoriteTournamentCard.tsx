import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface FavoriteTournamentCardProps {
  tournament: {
    id: number;
    name: string;
    game_type: string;
    tournament_date: string;
    venues: {
      venue: string;
      city: string;
      state: string;
      image_url?: string;
    };
  };
  isFavorited?: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  onShare: () => void;
}

export const FavoriteTournamentCard: React.FC<FavoriteTournamentCardProps> = ({
  tournament,
  isFavorited = true, // Default to true since these are favorites
  onPress,
  onToggleFavorite,
  onShare,
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

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardContent}>
        {/* Tournament Image */}
        <View style={styles.imageContainer}>
          {tournament.venues.image_url ? (
            <Image
              source={{ uri: tournament.venues.image_url }}
              style={styles.tournamentImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>🎱</Text>
            </View>
          )}
        </View>

        {/* Tournament Info */}
        <View style={styles.infoContainer}>
          {/* Header Row with Game Badge and Heart */}
          <View style={styles.headerRow}>
            <View style={styles.gameTypeBadge}>
              <Text style={styles.gameTypeText}>{tournament.game_type}</Text>
            </View>
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={onToggleFavorite}
            >
              <Text
                style={[
                  styles.heartIcon,
                  isFavorited && styles.heartIconFilled,
                ]}
              >
                {isFavorited ? "♥" : "♡"}
              </Text>
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

          {/* Share Button */}
          <View style={styles.shareRow}>
            <TouchableOpacity style={styles.shareButton} onPress={onShare}>
              <Text style={styles.shareIcon}>📤</Text>
              <Text style={styles.shareText}>Share</Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: SPACING.sm, // Back to smaller margin
    overflow: "hidden",
  },
  cardContent: {
    flexDirection: "row",
    padding: SPACING.md + 2, // Medium padding - between small and large
  },
  imageContainer: {
    marginRight: SPACING.md,
  },
  tournamentImage: {
    width: 70, // Medium size - between 60 and 80
    height: 70,
    borderRadius: RADIUS.md,
  },
  placeholderImage: {
    width: 70, // Medium size - between 60 and 80
    height: 70,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: FONT_SIZES.xl + 2, // Medium emoji size
  },
  infoContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  gameTypeBadge: {
    backgroundColor: COLORS.primary,
    paddingVertical: 3, // Medium badge size
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
    fontSize: FONT_SIZES.lg,
    color: COLORS.border,
  },
  heartIconFilled: {
    color: COLORS.error, // Red color for filled heart
  },
  tournamentName: {
    fontSize: FONT_SIZES.md + 1, // Medium font size
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    lineHeight: (FONT_SIZES.md + 1) * 1.2,
  },
  venueInfo: {
    fontSize: FONT_SIZES.sm + 1, // Slightly larger
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  dateTimeInfo: {
    fontSize: FONT_SIZES.sm + 1, // Slightly larger
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  shareRow: {
    alignItems: "flex-end", // Align to right
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
