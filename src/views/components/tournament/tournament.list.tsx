import { FlatList, StyleSheet, Text, View } from "react-native";
import { Tournament } from "../../../models/types/tournament.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Loading } from "../common/loading";
import { TournamentCard } from "./tournament.card";

interface TournamentListProps {
  tournaments: Tournament[];
  isLoading: boolean;
  onTournamentPress: (tournament: Tournament) => void;
  onFavoritePress: (tournament: Tournament) => void;
  favoritedIds: number[];
  onRefresh: () => void;
  refreshing: boolean;
}

export const TournamentList = ({
  tournaments,
  isLoading,
  onTournamentPress,
  onFavoritePress,
  favoritedIds,
  onRefresh,
  refreshing,
}: TournamentListProps) => {
  if (isLoading && tournaments.length === 0) {
    return <Loading message="Loading tournaments..." fullScreen />;
  }

  if (!isLoading && tournaments.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No tournaments found</Text>
        <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={tournaments}
      numColumns={2}
      keyExtractor={(item) => item.id.toString()}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TournamentCard
          tournament={item}
          onPress={() => onTournamentPress(item)}
          onFavoritePress={() => onFavoritePress(item)}
          isFavorited={favoritedIds.includes(item.id)}
        />
      )}
      onRefresh={onRefresh}
      refreshing={refreshing}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    padding: SPACING.sm,
  },
  row: {
    justifyContent: "space-between",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
});
