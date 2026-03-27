import { FlatList, StyleSheet, Text, View } from "react-native";
import { Tournament } from "../../../models/types/tournament.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { Loading } from "../common/loading";
import { TournamentCard } from "./tournament.card";

interface TournamentListProps {
  tournaments: Tournament[]; isLoading: boolean; onTournamentPress: (tournament: Tournament) => void;
  onFavoritePress: (tournament: Tournament) => void; favoritedIds: number[];
  onRefresh: () => void; refreshing: boolean;
}

export const TournamentList = ({ tournaments, isLoading, onTournamentPress, onFavoritePress, favoritedIds, onRefresh, refreshing }: TournamentListProps) => {
  if (isLoading && tournaments.length === 0) return <Loading message="Loading tournaments..." fullScreen />;

  if (!isLoading && tournaments.length === 0) {
    return (
      <View style={styles.empty}>
        <Text allowFontScaling={false} style={styles.emptyText}>No tournaments found</Text>
        <Text allowFontScaling={false} style={styles.emptySubtext}>Try adjusting your filters</Text>
      </View>
    );
  }

  const transformTournamentData = (tournament: Tournament) => ({
    ...tournament,
    venue_name: (tournament as any).venue?.venue || "TBD",
    director_name: (tournament as any).director?.name || "Unknown",
    views_count: (tournament as any).views_count || 0,
    favorites_count: (tournament as any).favorites_count || 0,
  } as any);

  return (
    <FlatList
      data={tournaments}
      numColumns={2}
      keyExtractor={(item) => item.id.toString()}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <TournamentCard tournament={transformTournamentData(item)} onPress={() => onTournamentPress(item)} />}
      onRefresh={onRefresh}
      refreshing={refreshing}
    />
  );
};

const styles = StyleSheet.create({
  list: { padding: scale(SPACING.sm) },
  row: { justifyContent: "space-between" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: scale(SPACING.xl) },
  emptyText: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.text, fontWeight: "600", marginBottom: scale(SPACING.sm) },
  emptySubtext: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary },
});
