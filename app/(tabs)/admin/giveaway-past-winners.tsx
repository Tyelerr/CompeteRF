import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useGiveawayPastWinners } from "../../../src/viewmodels/useGiveawayPastWinners";

const COLORS = {
  background: "#000000",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  blue: "#007AFF",
  white: "#FFFFFF",
  gray: "#8E8E93",
  lightGray: "#AEAEB2",
  darkGray: "#3A3A3C",
  green: "#30D158",
  gold: "#FFD700",
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

const FONT_SIZES = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
};

export default function GiveawayPastWinnersScreen() {
  const router = useRouter();
  const vm = useGiveawayPastWinners();

  const handleEmail = (email: string) => {
    if (email) Linking.openURL(`mailto:${email}`);
  };

  const renderWinnerCard = ({ item, index }: { item: any; index: number }) => (
    <View style={styles.winnerCard}>
      {/* Rank + Giveaway name */}
      <View style={styles.cardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.giveawayName} numberOfLines={1}>
            {item.giveaway_name}
          </Text>
          <Text style={styles.drawnDate}>
            Drawn {vm.formatDateTime(item.drawn_at)}
          </Text>
        </View>
        <View style={styles.prizeBadge}>
          <Text style={styles.prizeText}>
            ${item.prize_value?.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Winner info */}
      <View style={styles.winnerSection}>
        <View style={styles.trophyRow}>
          <Text style={styles.trophyEmoji}>🏆</Text>
          <Text style={styles.winnerName}>{item.winner_name}</Text>
        </View>

        {item.winner_email ? (
          <Pressable
            style={styles.contactRow}
            onPress={() => handleEmail(item.winner_email)}
          >
            <Ionicons name="mail-outline" size={14} color={COLORS.gray} />
            <Text style={styles.contactText}>{item.winner_email}</Text>
            <Ionicons
              name="open-outline"
              size={12}
              color={COLORS.blue}
              style={{ marginLeft: 4 }}
            />
          </Pressable>
        ) : null}
      </View>

      {/* Footer stats */}
      <View style={styles.cardFooter}>
        <View style={styles.footerStat}>
          <Ionicons name="people-outline" size={14} color={COLORS.gray} />
          <Text style={styles.footerText}>
            {item.entry_count} {item.entry_count === 1 ? "entry" : "entries"}
          </Text>
        </View>
        <View style={styles.footerStat}>
          <Ionicons name="trophy-outline" size={14} color={COLORS.gray} />
          <Text style={styles.footerText}>1 in {item.entry_count} odds</Text>
        </View>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (vm.loading) return null;
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>🏆</Text>
        <Text style={styles.emptyTitle}>No Winners Yet</Text>
        <Text style={styles.emptySubtitle}>
          Winners will appear here after you draw them from ended giveaways
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.blue} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>PAST WINNERS</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Summary stats */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{vm.totalWinners}</Text>
          <Text style={styles.statLabel}>Winners</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: COLORS.green }]}>
            ${vm.totalAwarded.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Total Awarded</Text>
        </View>
      </View>

      {/* Loading */}
      {vm.loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.blue} />
        </View>
      ) : (
        <FlatList
          data={vm.winners}
          keyExtractor={(item) => `${item.giveaway_id}-${item.drawn_at}`}
          renderItem={renderWinnerCard}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={vm.refreshing}
              onRefresh={vm.refresh}
              tintColor={COLORS.blue}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    width: 70,
  },
  backText: {
    color: COLORS.blue,
    fontSize: FONT_SIZES.md,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    textAlign: "center",
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    marginHorizontal: SPACING.lg,
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: COLORS.blue,
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
  },
  statLabel: {
    color: COLORS.gray,
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.cardBorder,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 100,
  },
  winnerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    color: COLORS.gold,
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
  },
  headerInfo: {
    flex: 1,
  },
  giveawayName: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
  },
  drawnDate: {
    color: COLORS.gray,
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  prizeBadge: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  prizeText: {
    color: COLORS.green,
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
  },
  winnerSection: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  trophyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  trophyEmoji: {
    fontSize: 18,
  },
  winnerName: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  contactText: {
    color: COLORS.lightGray,
    fontSize: FONT_SIZES.sm,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  footerText: {
    color: COLORS.gray,
    fontSize: FONT_SIZES.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: SPACING.sm,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    marginTop: SPACING.md,
  },
  emptySubtitle: {
    color: COLORS.gray,
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
    paddingHorizontal: SPACING.xxl,
  },
});
