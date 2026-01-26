import {
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getGameTypeImageUrl } from "../../../models/services/game-type-image.service";
import { Tournament } from "../../../models/types/tournament.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import {
  formatCurrency,
  formatDate,
  formatTime,
} from "../../../utils/formatters";

interface BilliardsTournamentCardProps {
  tournament: Tournament;
  isFavorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}

export const BilliardsTournamentCard = ({
  tournament,
  isFavorited,
  onPress,
  onToggleFavorite,
}: BilliardsTournamentCardProps) => {
  const venue = tournament.venues;

  const handleAddressPress = () => {
    if (!venue) return;

    const address = `${venue.address}, ${venue.city}, ${venue.state} ${venue.zip_code}`;
    const encodedAddress = encodeURIComponent(address);
    const mapsUrl = `https://maps.google.com/?q=${encodedAddress}`;

    Linking.openURL(mapsUrl);
  };

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      {/* Image Header Section */}
      <View style={styles.imageSection}>
        {/* Background Image from Supabase */}
        <Image
          source={{ uri: getGameTypeImageUrl(tournament.game_type) }}
          style={styles.gameTypeImage}
          resizeMode="cover"
        />

        {/* ID Badge */}
        <View style={styles.idBadge}>
          <Text style={styles.idText}>ID:{tournament.id}</Text>
        </View>

        {/* Favorite Heart */}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          style={styles.heartButton}
        >
          <Text style={[styles.heartIcon, isFavorited && styles.heartFilled]}>
            {isFavorited ? "♥" : "♡"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content Section */}
      <View style={styles.contentSection}>
        {/* Tournament Name */}
        <Text style={styles.name} numberOfLines={2}>
          {tournament.name}
        </Text>

        {/* Game Type Badge */}
        <View style={styles.gameTypeBadge}>
          <Text style={styles.gameTypeText}>{tournament.game_type}</Text>
        </View>

        {/* Date & Time */}
        <Text style={styles.dateTime}>
          {formatDate(tournament.tournament_date)}
        </Text>
        <Text style={styles.dateTime}>{formatTime(tournament.start_time)}</Text>

        {/* Venue Name */}
        <Text style={styles.venueName} numberOfLines={2}>
          {venue?.venue || "Venue TBD"}
        </Text>

        {/* City & State */}
        {venue?.city && venue?.state && (
          <Text style={styles.cityState}>
            {venue.city}, {venue.state}
          </Text>
        )}

        {/* Clickable Address */}
        {venue?.address && (
          <TouchableOpacity onPress={handleAddressPress}>
            <Text style={styles.addressLink} numberOfLines={2}>
              {venue.address}
            </Text>
          </TouchableOpacity>
        )}

        {/* Tournament Fee */}
        <View style={styles.feeSection}>
          <Text style={styles.feeLabel}>Tournament Fee</Text>
          <Text style={styles.feeAmount}>
            {formatCurrency(tournament.entry_fee || 0)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: "48%",
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    margin: SPACING.xs,
  },
  imageSection: {
    height: 120,
    backgroundColor: COLORS.surface,
    position: "relative",
    overflow: "hidden",
  },
  gameTypeImage: {
    width: "100%",
    height: "100%",
  },
  idBadge: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  idText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.xs,
    fontWeight: "500",
  },
  heartButton: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    padding: SPACING.xs,
  },
  heartIcon: {
    fontSize: 34,
    color: COLORS.white,
  },
  heartFilled: {
    color: COLORS.primary,
  },
  contentSection: {
    padding: SPACING.md,
    alignItems: "center",
  },
  name: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  gameTypeBadge: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.md,
  },
  gameTypeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
  },
  dateTime: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  venueName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    textAlign: "center",
    marginTop: SPACING.md,
    fontWeight: "500",
  },
  cityState: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  addressLink: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    textAlign: "center",
    marginTop: SPACING.xs,
    textDecorationLine: "underline",
  },
  feeSection: {
    marginTop: SPACING.md,
    alignItems: "center",
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    width: "100%",
  },
  feeLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  feeAmount: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
});
