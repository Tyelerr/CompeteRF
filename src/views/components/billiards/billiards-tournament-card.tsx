import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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
  getTournamentImageUrl: (tournament: Tournament) => string | null;
}

const isWeb = Platform.OS === "web";

export const BilliardsTournamentCard = ({
  tournament,
  isFavorited,
  onPress,
  onToggleFavorite,
  getTournamentImageUrl,
}: BilliardsTournamentCardProps) => {
  const venue = tournament.venues;
  const imageUrl = getTournamentImageUrl(tournament);

  const renderImage = () => {
    if (imageUrl) {
      return (
        <Image
          source={{ uri: imageUrl }}
          style={isWeb ? styles.gameTypeImageWeb : styles.gameTypeImage}
          resizeMode="cover"
        />
      );
    }
    return (
      <View style={isWeb ? styles.fallbackWeb : styles.fallbackImageContainer}>
        <Text style={styles.fallbackEmoji}>🎱</Text>
      </View>
    );
  };

  // ── Mobile card (unchanged) ─────────────────────────────────────────────
  if (!isWeb) {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={onPress}
      >
        <View style={styles.imageSection}>
          {renderImage()}
          <View style={styles.idBadge}>
            <Text style={styles.idText}>ID:{tournament.id}</Text>
          </View>
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
        <View style={styles.contentSection}>
          <Text style={styles.name} numberOfLines={2}>
            {tournament.name}
          </Text>
          <View style={styles.gameTypeBadge}>
            <Text style={styles.gameTypeText}>{tournament.game_type}</Text>
          </View>
          <Text style={styles.dateTime}>
            {formatDate(tournament.tournament_date)}
          </Text>
          <Text style={styles.dateTime}>
            {formatTime(tournament.start_time)}
          </Text>
          <Text style={styles.venueName} numberOfLines={2}>
            {venue?.venue || "Venue TBD"}
          </Text>
          {venue?.city && venue?.state && (
            <Text style={styles.cityState}>
              {venue.city}, {venue.state}
            </Text>
          )}
          {venue?.address && (
            <Text style={styles.venueAddress} numberOfLines={2}>
              {venue.address}
            </Text>
          )}
          <View style={styles.feeSection}>
            <Text style={styles.feeLabel}>Tournament Fee</Text>
            <Text style={styles.feeAmount}>
              {formatCurrency(tournament.entry_fee || 0)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Web card ────────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      style={styles.webCard}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {/* Image */}
      <View style={styles.webImageSection}>
        {renderImage()}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          style={styles.webHeartButton}
        >
          <Text
            style={[styles.webHeartIcon, isFavorited && styles.heartFilled]}
          >
            {isFavorited ? "♥" : "♡"}
          </Text>
        </TouchableOpacity>
        <View style={styles.webGameTypeBadge}>
          <Text style={styles.webGameTypeText}>{tournament.game_type}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.webContent}>
        <Text style={styles.webName} numberOfLines={2}>
          {tournament.name}
        </Text>

        <View style={styles.webRow}>
          <Text style={styles.webIcon}>📅</Text>
          <Text style={styles.webDetail}>
            {formatDate(tournament.tournament_date)} •{" "}
            {formatTime(tournament.start_time)}
          </Text>
        </View>

        <View style={styles.webRow}>
          <Text style={styles.webIcon}>📍</Text>
          <Text style={styles.webDetail} numberOfLines={1}>
            {venue?.venue || "Venue TBD"}
          </Text>
        </View>

        {venue?.city && venue?.state && (
          <View style={styles.webRow}>
            <Text style={styles.webIcon}>🗺️</Text>
            <Text style={styles.webDetail}>
              {venue.city}, {venue.state}
            </Text>
          </View>
        )}

        {tournament.tournament_format && (
          <View style={styles.webRow}>
            <Text style={styles.webIcon}>🏆</Text>
            <Text style={styles.webDetail}>
              {tournament.tournament_format.replace(/-/g, " ")}
            </Text>
          </View>
        )}

        {(tournament.race || tournament.game_spot) && (
          <View style={styles.webRow}>
            <Text style={styles.webIcon}>🎯</Text>
            <Text style={styles.webDetail}>
              {[
                tournament.race && `Race ${tournament.race}`,
                tournament.game_spot && `Spot ${tournament.game_spot}`,
              ]
                .filter(Boolean)
                .join(" • ")}
            </Text>
          </View>
        )}

        {tournament.max_fargo && (
          <View style={styles.webRow}>
            <Text style={styles.webIcon}>📊</Text>
            <Text style={styles.webDetail}>
              Max Fargo: {tournament.max_fargo}
            </Text>
          </View>
        )}

        <View style={styles.webTagsRow}>
          {tournament.reports_to_fargo && (
            <View style={styles.webTag}>
              <Text style={styles.webTagText}>Fargo Rated</Text>
            </View>
          )}
          {tournament.calcutta && (
            <View style={styles.webTag}>
              <Text style={styles.webTagText}>Calcutta</Text>
            </View>
          )}
          {tournament.open_tournament && (
            <View style={styles.webTag}>
              <Text style={styles.webTagText}>Open</Text>
            </View>
          )}
          {tournament.added_money && tournament.added_money > 0 && (
            <View style={[styles.webTag, styles.webTagGreen]}>
              <Text style={styles.webTagText}>
                +{formatCurrency(tournament.added_money)} Added
              </Text>
            </View>
          )}
        </View>

        <View style={styles.webFeeRow}>
          <Text style={styles.webFeeLabel}>Entry Fee</Text>
          <Text style={styles.webFeeAmount}>
            {formatCurrency(tournament.entry_fee || 0)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // ── Mobile (unchanged) ───────────────────────────────────────────────────
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
  fallbackImageContainer: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  fallbackEmoji: {
    fontSize: 48,
    color: COLORS.textMuted,
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
    color: COLORS.white,
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
  venueAddress: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
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

  // ── Web card ─────────────────────────────────────────────────────────────
  webCard: {
    width: "23.5%",
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    margin: "0.75%",
  },
  webImageSection: {
    height: 160,
    backgroundColor: COLORS.surface,
    position: "relative",
    overflow: "hidden",
  },
  gameTypeImageWeb: {
    width: "100%",
    height: "100%",
  },
  fallbackWeb: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  webGameTypeBadge: {
    position: "absolute",
    bottom: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  webGameTypeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  webHeartButton: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 30,
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1.6 },
    shadowOpacity: 0.32,
    shadowRadius: 3.2,
  },
  webHeartIcon: {
    fontSize: 36,
    color: COLORS.white,
  },
  webContent: {
    padding: 12,
  },
  webName: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
    lineHeight: 18,
  },
  webRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
    gap: 5,
  },
  webIcon: {
    fontSize: 11,
    lineHeight: 16,
    width: 16,
  },
  webDetail: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  webTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    marginBottom: 6,
  },
  webTag: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  webTagGreen: {
    borderColor: "#2ecc7160",
    backgroundColor: "#2ecc7115",
  },
  webTagText: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  webFeeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  webFeeLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  webFeeAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
});
