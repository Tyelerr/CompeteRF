import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Tournament } from "../../../models/types/tournament.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { useAuth } from "../../../viewmodels/hooks/use.auth";
import { useFavorites } from "../../../viewmodels/hooks/use.favorites";
import { useTournaments } from "../../../viewmodels/hooks/use.tournaments";
import { useFilterStore } from "../../../viewmodels/stores/filter.store";
import { useUIStore } from "../../../viewmodels/stores/ui.store";
import { Dropdown } from "../../components/common/dropdown";
import { Modal } from "../../components/common/modal";
import { TournamentDetail } from "../../components/tournament/tournament.detail";
import { TournamentList } from "../../components/tournament/tournament.list";

export const BilliardsScreen = () => {
  const { profile } = useAuth();
  const { tournaments, totalCount, isLoading, refetch } = useTournaments();
  const { favorites, addFavoriteTournament, removeFavoriteTournament } =
    useFavorites();
  const { filters, setFilter, resetFilters } = useFilterStore();
  const {
    isTournamentModalOpen,
    selectedTournamentId,
    openTournamentModal,
    closeTournamentModal,
  } = useUIStore();

  const [selectedTournament, setSelectedTournament] =
    useState<Tournament | null>(null);

  useEffect(() => {
    if (profile?.home_state && !filters.state) {
      setFilter("state", profile.home_state);
    }
  }, [profile?.home_state]);

  useEffect(() => {
    if (selectedTournamentId) {
      const tournament = tournaments.find((t) => t.id === selectedTournamentId);
      setSelectedTournament(tournament || null);
    }
  }, [selectedTournamentId, tournaments]);

  const handleTournamentPress = (tournament: Tournament) => {
    openTournamentModal(tournament.id);
  };

  const handleFavoritePress = async (tournament: Tournament) => {
    const isFav = favorites.some((f) => f.tournament_id === tournament.id);
    if (isFav) {
      await removeFavoriteTournament(tournament.id);
    } else {
      await addFavoriteTournament(tournament.id);
    }
  };

  const favoritedIds = favorites
    .filter((f) => f.tournament_id)
    .map((f) => f.tournament_id as number);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>BILLIARDS TOURNAMENTS</Text>
        <Text style={styles.subtitle}>Browse all billiards tournaments</Text>
      </View>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <View style={styles.filterItem}>
            <Dropdown
              placeholder="State"
              options={US_STATES}
              value={filters.state}
              onSelect={(value) => setFilter("state", value)}
            />
          </View>
        </View>

        <View style={styles.filterActions}>
          <TouchableOpacity style={styles.filterButton}>
            <Text style={styles.filterButtonText}>☰ Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
            <Text style={styles.resetButtonText}>🗑️ Reset Filters</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.count}>Total count: {totalCount}</Text>
      </View>

      <TournamentList
        tournaments={tournaments}
        isLoading={isLoading}
        onTournamentPress={handleTournamentPress}
        onFavoritePress={handleFavoritePress}
        favoritedIds={favoritedIds}
        onRefresh={refetch}
        refreshing={isLoading}
      />

      <Modal
        visible={isTournamentModalOpen}
        onClose={closeTournamentModal}
        title="Tournament Details"
      >
        {selectedTournament && (
          <TournamentDetail
            tournament={selectedTournament}
            favoriteCount={0}
            isFavorited={favoritedIds.includes(selectedTournament.id)}
            onFavoritePress={() => handleFavoritePress(selectedTournament)}
            onClose={closeTournamentModal}
          />
        )}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  filters: {
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  filterItem: {
    flex: 1,
  },
  filterActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: SPACING.sm,
  },
  filterButton: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
  },
  resetButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  resetButtonText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
  },
  count: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
  },
});
