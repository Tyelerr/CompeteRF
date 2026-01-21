import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Tournament } from "../../../models/types/tournament.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { formatCurrency, formatDate, formatTime } from "../../../utils/helpers";

interface TournamentCardProps {
  tournament: Tournament;
  onPress: () => void;
  onFavoritePress: () => void;
  isFavorited: boolean;
}

export const TournamentCard = ({
  tournament,
  onPress,
  onFavoritePress,
  isFavorited,
}: TournamentCardProps) => {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.header}>
        <Text style={styles.id}>ID:{tournament.id}</Text>
        <TouchableOpacity onPress={onFavoritePress}>
          <Text style={styles.heart}>{isFavorited ? "❤️" : "🤍"}</Text>
        </TouchableOpacity>
      </View>

      {tournament.thumbnail && (
        <Image
          source={{ uri: tournament.thumbnail }}
          style={styles.thumbnail}
        />
      )}

      <Text style={styles.name} numberOfLines={1}>
        {tournament.name}
      </Text>
      <Text style={styles.gameType}>{tournament.game_type}</Text>
      <Text style={styles.date}>{formatDate(tournament.tournament_date)}</Text>
      <Text style={styles.time}>{formatTime(tournament.start_time)}</Text>

      <View style={styles.footer}>
        <Text style={styles.venue} numberOfLines={1}>
          📍 {tournament.venues?.venue}
        </Text>
        <Text style={styles.fee}>
          {tournament.entry_fee ? formatCurrency(tournament.entry_fee) : "Free"}
        </Text>
      </View>

      {tournament.is_recurring && (
        <View style={styles.recurringBadge}>
          <Text style={styles.recurringText}>🔄</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    width: "48%",
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  id: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  heart: {
    fontSize: FONT_SIZES.lg,
  },
  thumbnail: {
    width: "100%",
    height: 80,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  name: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  gameType: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  date: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  time: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  venue: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  fee: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.success,
  },
  recurringBadge: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.xl,
  },
  recurringText: {
    fontSize: FONT_SIZES.sm,
  },
});
