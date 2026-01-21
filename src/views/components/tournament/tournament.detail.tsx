import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Tournament } from "../../../models/types/tournament.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { formatCurrency, formatDate, formatTime } from "../../../utils/helpers";
import { Badge } from "../common/badge";
import { Button } from "../common/button";

interface TournamentDetailProps {
  tournament: Tournament;
  favoriteCount: number;
  isFavorited: boolean;
  onFavoritePress: () => void;
  onClose: () => void;
}

export const TournamentDetail = ({
  tournament,
  favoriteCount,
  isFavorited,
  onFavoritePress,
  onClose,
}: TournamentDetailProps) => {
  const openMaps = () => {
    const address = `${tournament.venues?.address}, ${tournament.venues?.city}, ${tournament.venues?.state}`;
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  const callVenue = () => {
    if (tournament.phone_number) {
      Linking.openURL(`tel:${tournament.phone_number}`);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {tournament.thumbnail && (
        <Image source={{ uri: tournament.thumbnail }} style={styles.image} />
      )}

      <View style={styles.header}>
        <Text style={styles.name}>{tournament.name}</Text>
        {tournament.is_recurring && (
          <Badge label="🔄 Recurring" variant="info" />
        )}
      </View>

      <Text style={styles.director}>@{tournament.profiles?.user_name}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📅 DATE & TIME</Text>
        <Text style={styles.text}>
          {formatDate(tournament.tournament_date)}
        </Text>
        <Text style={styles.text}>
          {formatTime(tournament.start_time)} ({tournament.timezone})
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎱 GAME DETAILS</Text>
        <Text style={styles.text}>Game Type: {tournament.game_type}</Text>
        <Text style={styles.text}>Format: {tournament.tournament_format}</Text>
        {tournament.race && (
          <Text style={styles.text}>Race: {tournament.race}</Text>
        )}
        {tournament.table_size && (
          <Text style={styles.text}>Table Size: {tournament.table_size}</Text>
        )}
        {tournament.equipment && (
          <Text style={styles.text}>Equipment: {tournament.equipment}</Text>
        )}
        {tournament.number_of_tables && (
          <Text style={styles.text}>Tables: {tournament.number_of_tables}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💵 ENTRY & FEES</Text>
        <Text style={styles.text}>
          Entry Fee:{" "}
          {tournament.entry_fee ? formatCurrency(tournament.entry_fee) : "Free"}
        </Text>
        {tournament.added_money && (
          <Text style={styles.text}>
            Added Money: {formatCurrency(tournament.added_money)}
          </Text>
        )}
      </View>

      {(tournament.max_fargo || tournament.open_tournament) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 FARGO</Text>
          {tournament.max_fargo && (
            <Text style={styles.text}>Max Fargo: {tournament.max_fargo}</Text>
          )}
          {tournament.required_fargo_games && (
            <Text style={styles.text}>
              Required Games: {tournament.required_fargo_games}+
            </Text>
          )}
          <Text style={styles.text}>
            Reports to Fargo: {tournament.reports_to_fargo ? "Yes ✓" : "No"}
          </Text>
          {tournament.open_tournament && (
            <Text style={styles.text}>Open Tournament ✓</Text>
          )}
        </View>
      )}

      {tournament.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 DESCRIPTION</Text>
          <Text style={styles.text}>{tournament.description}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍 LOCATION</Text>
        <Text style={styles.venueName}>{tournament.venues?.venue}</Text>
        <Text style={styles.text}>
          {tournament.venues?.address}, {tournament.venues?.city},{" "}
          {tournament.venues?.state}
        </Text>
        <View style={styles.buttonRow}>
          <Button
            title="📍 Open in Maps"
            onPress={openMaps}
            variant="outline"
            size="sm"
          />
          {tournament.phone_number && (
            <Button
              title="📞 Call Venue"
              onPress={callVenue}
              variant="outline"
              size="sm"
            />
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.interested}>❤️ {favoriteCount} interested</Text>
        <Text style={styles.tournamentId}>Tournament ID: {tournament.id}</Text>
      </View>

      <View style={styles.actions}>
        <Button
          title={isFavorited ? "❤️ Favorited" : "🤍 Add to Favorites"}
          onPress={onFavoritePress}
          variant={isFavorited ? "primary" : "outline"}
          fullWidth
        />
      </View>

      <Button title="✕ Close" onPress={onClose} variant="ghost" fullWidth />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  image: {
    width: "100%",
    height: 200,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
  },
  name: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
  },
  director: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  section: {
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  text: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  buttonRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  footer: {
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  interested: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  tournamentId: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  actions: {
    padding: SPACING.md,
  },
});
