import { Image, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Tournament } from "../../../models/types/tournament.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { formatCurrency, formatDate, formatTime } from "../../../utils/helpers";
import { moderateScale, scale } from "../../../utils/scaling";
import { Badge } from "../common/badge";
import { Button } from "../common/button";

interface TournamentDetailProps {
  tournament: Tournament; favoriteCount: number; isFavorited: boolean;
  onFavoritePress: () => void; onClose: () => void;
}

export const TournamentDetail = ({ tournament, favoriteCount, isFavorited, onFavoritePress, onClose }: TournamentDetailProps) => {
  const openMaps = () => {
    const address = `${tournament.venues?.address}, ${tournament.venues?.city}, ${tournament.venues?.state}`;
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`);
  };
  const callVenue = () => { if (tournament.phone_number) Linking.openURL(`tel:${tournament.phone_number}`); };

  return (
    <ScrollView style={styles.container}>
      {tournament.thumbnail && <Image source={{ uri: tournament.thumbnail }} style={styles.image} />}
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.name}>{tournament.name}</Text>
        {tournament.is_recurring && <Badge label="🔄 Recurring" variant="info" />}
      </View>
      <Text allowFontScaling={false} style={styles.director}>@{tournament.profiles?.user_name}</Text>
      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>📅 DATE & TIME</Text>
        <Text allowFontScaling={false} style={styles.text}>{formatDate(tournament.tournament_date)}</Text>
        <Text allowFontScaling={false} style={styles.text}>{formatTime(tournament.start_time)} ({tournament.timezone})</Text>
      </View>
      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>🎱 GAME DETAILS</Text>
        <Text allowFontScaling={false} style={styles.text}>Game Type: {tournament.game_type}</Text>
        <Text allowFontScaling={false} style={styles.text}>Format: {tournament.tournament_format}</Text>
        {tournament.race && <Text allowFontScaling={false} style={styles.text}>Race: {tournament.race}</Text>}
        {tournament.table_size && <Text allowFontScaling={false} style={styles.text}>Table Size: {tournament.table_size}</Text>}
        {tournament.equipment && <Text allowFontScaling={false} style={styles.text}>Equipment: {tournament.equipment}</Text>}
        {tournament.number_of_tables && <Text allowFontScaling={false} style={styles.text}>Tables: {tournament.number_of_tables}</Text>}
      </View>
      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>💵 ENTRY & FEES</Text>
        <Text allowFontScaling={false} style={styles.text}>Entry Fee: {tournament.entry_fee ? formatCurrency(tournament.entry_fee) : "Free"}</Text>
        {tournament.added_money && <Text allowFontScaling={false} style={styles.text}>Added Money: {formatCurrency(tournament.added_money)}</Text>}
      </View>
      {(tournament.max_fargo || tournament.open_tournament) && (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>📊 FARGO</Text>
          {tournament.max_fargo && <Text allowFontScaling={false} style={styles.text}>Max Fargo: {tournament.max_fargo}</Text>}
          {tournament.required_fargo_games && <Text allowFontScaling={false} style={styles.text}>Required Games: {tournament.required_fargo_games}+</Text>}
          <Text allowFontScaling={false} style={styles.text}>Reports to Fargo: {tournament.reports_to_fargo ? "Yes ✓" : "No"}</Text>
          {tournament.open_tournament && <Text allowFontScaling={false} style={styles.text}>Open Tournament ✓</Text>}
        </View>
      )}
      {tournament.description && (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>📝 DESCRIPTION</Text>
          <Text allowFontScaling={false} style={styles.text}>{tournament.description}</Text>
        </View>
      )}
      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>📍 LOCATION</Text>
        <Text allowFontScaling={false} style={styles.venueName}>{tournament.venues?.venue}</Text>
        <Text allowFontScaling={false} style={styles.text}>{tournament.venues?.address}, {tournament.venues?.city}, {tournament.venues?.state}</Text>
        <View style={styles.buttonRow}>
          <Button title="📍 Open in Maps" onPress={openMaps} variant="outline" size="sm" />
          {tournament.phone_number && <Button title="📞 Call Venue" onPress={callVenue} variant="outline" size="sm" />}
        </View>
      </View>
      <View style={styles.footer}>
        <Text allowFontScaling={false} style={styles.interested}>❤️ {favoriteCount} interested</Text>
        <Text allowFontScaling={false} style={styles.tournamentId}>Tournament ID: {tournament.id}</Text>
      </View>
      <View style={styles.actions}>
        <Button title={isFavorited ? "❤️ Favorited" : "🤍 Add to Favorites"} onPress={onFavoritePress} variant={isFavorited ? "primary" : "outline"} fullWidth />
      </View>
      <Button title="✕ Close" onPress={onClose} variant="ghost" fullWidth />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  image: { width: "100%", height: 200, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: scale(SPACING.md) },
  name: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, flex: 1 },
  director: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, paddingHorizontal: scale(SPACING.md), marginBottom: scale(SPACING.md) },
  section: { padding: scale(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.border },
  sectionTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.textMuted, marginBottom: scale(SPACING.sm) },
  text: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, marginBottom: scale(SPACING.xs) },
  venueName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  buttonRow: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.sm) },
  footer: { padding: scale(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.border },
  interested: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, marginBottom: scale(SPACING.xs) },
  tournamentId: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted },
  actions: { padding: scale(SPACING.md) },
});
