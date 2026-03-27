import { useState } from "react";
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
import { moderateScale, scale } from "../../../utils/scaling";

interface BilliardsTournamentCardProps {
  tournament: Tournament;
  isFavorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  getTournamentImageUrl: (tournament: Tournament) => string | null;
  /** Computed by computeMobileCardLayout — mobile only, omit on web */
  cardWidth?: number;
  /** Computed by computeMobileCardLayout — mobile only, omit on web */
  imageHeight?: number;
}

const isWeb = Platform.OS === "web";

export const BilliardsTournamentCard = ({
  tournament,
  isFavorited,
  onPress,
  onToggleFavorite,
  getTournamentImageUrl,
  cardWidth,
  imageHeight,
}: BilliardsTournamentCardProps) => {
  const venue = tournament.venues;
  const imageUrl = getTournamentImageUrl(tournament);
  const [hovered, setHovered] = useState(false);

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
        <Text allowFontScaling={false} style={styles.fallbackEmoji}>🎱</Text>
      </View>
    );
  };

  // ── Mobile card ────────────────────────────────────────────────────────────
  if (!isWeb) {
    return (
      <TouchableOpacity
        style={[
          styles.card,
          cardWidth !== undefined ? { width: cardWidth } : undefined,
        ]}
        activeOpacity={0.7}
        onPress={onPress}
      >
        <View
          style={[
            styles.imageSection,
            imageHeight !== undefined ? { height: imageHeight } : undefined,
          ]}
        >
          {renderImage()}
          <View style={styles.idBadge}>
            <Text allowFontScaling={false} style={styles.idText}>ID:{tournament.id}</Text>
          </View>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            style={styles.heartButton}
          >
            <Text allowFontScaling={false} style={[styles.heartIcon, isFavorited && styles.heartFilled]}>
              {isFavorited ? "♥" : "♡"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.contentSection}>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>
            {tournament.name}
          </Text>
          <View style={styles.gameTypeBadge}>
            <Text allowFontScaling={false} style={styles.gameTypeText}>{tournament.game_type}</Text>
          </View>
          <Text allowFontScaling={false} style={styles.dateTime}>
            {formatDate(tournament.tournament_date)}
          </Text>
          <Text allowFontScaling={false} style={styles.dateTime}>
            {formatTime(tournament.start_time)}
          </Text>
          <Text allowFontScaling={false} style={styles.venueName} numberOfLines={2}>
            {venue?.venue || "Venue TBD"}
          </Text>
          {venue?.city && venue?.state && (
            <Text allowFontScaling={false} style={styles.cityState}>
              {venue.city}, {venue.state}
            </Text>
          )}
          <View style={styles.feeSection}>
            <Text allowFontScaling={false} style={styles.feeLabel}>Tournament Fee</Text>
            <Text allowFontScaling={false} style={styles.feeAmount}>
              {formatCurrency(tournament.entry_fee || 0)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Web card ───────────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      style={[styles.webCard, hovered && styles.webCardHovered]}
      activeOpacity={0.85}
      onPress={onPress}
      // @ts-ignore — web-only events
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <View style={styles.webImageSection}>
        {renderImage()}
        {hovered && <View style={styles.webImageOverlay} />}
        <View style={styles.webIdBadge}>
          <Text allowFontScaling={false} style={styles.webIdText}>ID:{tournament.id}</Text>
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          style={styles.webHeartButton}
        >
          <Text allowFontScaling={false} style={[styles.webHeartIcon, isFavorited && styles.heartFilled]}>
            {isFavorited ? "♥" : "♡"}
          </Text>
        </TouchableOpacity>
        <View style={styles.webGameTypeBadge}>
          <Text allowFontScaling={false} style={styles.webGameTypeText}>{tournament.game_type}</Text>
        </View>
      </View>

      <View style={styles.webContent}>
        <Text allowFontScaling={false} style={[styles.webName, hovered && styles.webNameHovered]} numberOfLines={2}>
          {tournament.name}
        </Text>

        <View style={styles.webRow}>
          <Text allowFontScaling={false} style={styles.webIcon}>📅</Text>
          <Text allowFontScaling={false} style={styles.webDetail}>
            {formatDate(tournament.tournament_date)} •{" "}
            {formatTime(tournament.start_time)}
          </Text>
        </View>

        <View style={styles.webRow}>
          <Text allowFontScaling={false} style={styles.webIcon}>📍</Text>
          <Text allowFontScaling={false} style={styles.webDetail} numberOfLines={1}>
            {venue?.venue || "Venue TBD"}
          </Text>
        </View>

        {venue?.city && venue?.state && (
          <View style={styles.webRow}>
            <Text allowFontScaling={false} style={styles.webIcon}>🗺️</Text>
            <Text allowFontScaling={false} style={styles.webDetail}>
              {venue.city}, {venue.state}
            </Text>
          </View>
        )}

        {tournament.tournament_format && (
          <View style={styles.webRow}>
            <Text allowFontScaling={false} style={styles.webIcon}>🏆</Text>
            <Text allowFontScaling={false} style={styles.webDetail}>
              {tournament.tournament_format.replace(/-/g, " ")}
            </Text>
          </View>
        )}

        {(tournament.race || tournament.game_spot) && (
          <View style={styles.webRow}>
            <Text allowFontScaling={false} style={styles.webIcon}>🎯</Text>
            <Text allowFontScaling={false} style={styles.webDetail}>
              {[
                tournament.race && `Race ${tournament.race}`,
                tournament.game_spot && `Spot ${tournament.game_spot}`,
              ]
                .filter(Boolean)
                .join(" • ")}
            </Text>
          </View>
        )}

        {!!tournament.max_fargo && (
          <View style={styles.webRow}>
            <Text allowFontScaling={false} style={styles.webIcon}>📊</Text>
            <Text allowFontScaling={false} style={styles.webDetail}>
              Max Fargo: {tournament.max_fargo}
            </Text>
          </View>
        )}

        <View style={styles.webTagsRow}>
          {tournament.reports_to_fargo && (
            <View style={styles.webTag}>
              <Text allowFontScaling={false} style={styles.webTagText}>Fargo Rated</Text>
            </View>
          )}
          {tournament.calcutta && (
            <View style={styles.webTag}>
              <Text allowFontScaling={false} style={styles.webTagText}>Calcutta</Text>
            </View>
          )}
          {tournament.open_tournament && (
            <View style={styles.webTag}>
              <Text allowFontScaling={false} style={styles.webTagText}>Open</Text>
            </View>
          )}
          {!!tournament.added_money && tournament.added_money > 0 && (
            <View style={[styles.webTag, styles.webTagGreen]}>
              <Text allowFontScaling={false} style={styles.webTagText}>
                +{formatCurrency(tournament.added_money)} Added
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.webFeeRow, hovered && styles.webFeeRowHovered]}>
          <Text allowFontScaling={false} style={styles.webFeeLabel}>Entry Fee</Text>
          <Text allowFontScaling={false} style={[styles.webFeeAmount, hovered && styles.webFeeAmountHovered]}>
            {formatCurrency(tournament.entry_fee || 0)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // ── Mobile ─────────────────────────────────────────────────────────────────
  card: {
    width: "48%",
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    margin: scale(SPACING.xs),
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
    fontSize: moderateScale(48),
    color: COLORS.textMuted,
  },
  idBadge: {
    position: "absolute",
    top: scale(SPACING.sm),
    left: scale(SPACING.sm),
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: scale(SPACING.sm),
    paddingVertical: scale(SPACING.xs),
    borderRadius: RADIUS.sm,
  },
  idText: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "500",
  },
  heartButton: {
    position: "absolute",
    top: scale(SPACING.sm),
    right: scale(SPACING.sm),
    padding: scale(SPACING.xs),
  },
  heartIcon: {
    fontSize: moderateScale(34),
    color: COLORS.white,
  },
  heartFilled: {
    color: COLORS.primary,
  },
  contentSection: {
    padding: scale(SPACING.sm),
    alignItems: "center",
  },
  name: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: scale(SPACING.xs),
  },
  gameTypeBadge: {
    backgroundColor: COLORS.primary,
    paddingVertical: scale(SPACING.xs),
    paddingHorizontal: scale(SPACING.sm),
    borderRadius: RADIUS.sm,
    marginBottom: scale(SPACING.sm),
  },
  gameTypeText: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "600",
  },
  dateTime: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: moderateScale(18),
  },
  venueName: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.text,
    textAlign: "center",
    marginTop: scale(SPACING.sm),
    fontWeight: "500",
  },
  cityState: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: scale(SPACING.xs),
  },
  venueAddress: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: scale(SPACING.xs),
  },
  feeSection: {
    marginTop: scale(SPACING.sm),
    alignItems: "center",
    paddingTop: scale(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    width: "100%",
  },
  feeLabel: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textMuted,
    marginBottom: scale(SPACING.xs),
  },
  feeAmount: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.secondary,
  },

  // ── Web card ───────────────────────────────────────────────────────────────
  webCard: {
    width: "23.5%",
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    margin: "0.75%",
    // @ts-ignore — web only
    transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
    cursor: "pointer",
  },
  webCardHovered: {
    borderColor: COLORS.primary,
    // @ts-ignore — web only
    transform: [{ scale: 1.03 }],
    boxShadow: `0 8px 32px 0 ${COLORS.primary}55`,
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
  webImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: `${COLORS.primary}22`,
  },
  webIdBadge: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  webIdText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "600",
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
    // @ts-ignore
    transition: "color 0.18s ease",
  },
  webNameHovered: {
    color: COLORS.primary,
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
    // @ts-ignore
    transition: "border-color 0.18s ease",
  },
  webFeeRowHovered: {
    borderTopColor: COLORS.primary + "60",
  },
  webFeeLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  webFeeAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    // @ts-ignore
    transition: "color 0.18s ease",
  },
  webFeeAmountHovered: {
    color: COLORS.primary,
  },
});
