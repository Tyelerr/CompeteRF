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
  Platform,
} from "react-native";
import { useGiveawayPastWinners } from "../../../src/viewmodels/useGiveawayPastWinners";
import { moderateScale, scale } from "../../../src/utils/scaling";

const isWeb = Platform.OS === "web";

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
          <Text allowFontScaling={false} style={styles.rankText}>#{index + 1}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text allowFontScaling={false} style={styles.giveawayName} numberOfLines={1}>
            {item.giveaway_name}
          </Text>
          <Text allowFontScaling={false} style={styles.drawnDate}>
            Drawn {vm.formatDateTime(item.drawn_at)}
          </Text>
        </View>
        <View style={styles.prizeBadge}>
          <Text allowFontScaling={false} style={styles.prizeText}>
            ${item.prize_value?.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Winner info */}
      <View style={styles.winnerSection}>
        <View style={styles.trophyRow}>
          <Text allowFontScaling={false} style={styles.trophyEmoji}>🏆</Text>
          <Text allowFontScaling={false} style={styles.winnerName}>{item.winner_name}</Text>
        </View>

        {item.winner_email ? (
          <Pressable
            style={styles.contactRow}
            onPress={() => handleEmail(item.winner_email)}
          >
            <Ionicons name="mail-outline" size={14} color={COLORS.gray} />
            <Text allowFontScaling={false} style={styles.contactText}>{item.winner_email}</Text>
            <Ionicons
              name="open-outline"
              size={12}
              color={COLORS.blue}
              style={{ marginLeft: scale(4) }}
            />
          </Pressable>
        ) : null}
      </View>

      {/* Footer stats */}
      <View style={styles.cardFooter}>
        <View style={styles.footerStat}>
          <Ionicons name="people-outline" size={14} color={COLORS.gray} />
          <Text allowFontScaling={false} style={styles.footerText}>
            {item.entry_count} {item.entry_count === 1 ? "entry" : "entries"}
          </Text>
        </View>
        <View style={styles.footerStat}>
          <Ionicons name="trophy-outline" size={14} color={COLORS.gray} />
          <Text allowFontScaling={false} style={styles.footerText}>1 in {item.entry_count} odds</Text>
        </View>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (vm.loading) return null;
    return (
      <View style={styles.emptyState}>
        <Text allowFontScaling={false} style={styles.emptyEmoji}>🏆</Text>
        <Text allowFontScaling={false} style={styles.emptyTitle}>No Winners Yet</Text>
        <Text allowFontScaling={false} style={styles.emptySubtitle}>
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
          <Text allowFontScaling={false} style={styles.backText}>Back</Text>
        </Pressable>
        <Text allowFontScaling={false} style={styles.headerTitle}>PAST WINNERS</Text>
        <View style={{ width: scale(70) }} />
      </View>

      {/* Summary stats */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{vm.totalWinners}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Winners</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={[styles.statValue, { color: COLORS.green }]}>
            ${vm.totalAwarded.toLocaleString()}
          </Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Total Awarded</Text>
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
          contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
          refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing}
              onRefresh={vm.refresh}
              tintColor={COLORS.blue}/>
          )
        }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Web centering
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: scale(SPACING.xl),
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: scale(60),
    paddingHorizontal: scale(SPACING.lg),
    paddingBottom: scale(SPACING.md),
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    width: scale(70),
  },
  backText: {
    color: COLORS.blue,
    fontSize: moderateScale(FONT_SIZES.md),
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    textAlign: "center",
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    marginHorizontal: scale(SPACING.lg),
    borderRadius: scale(12),
    paddingVertical: scale(SPACING.lg),
    marginBottom: scale(SPACING.lg),
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: COLORS.blue,
    fontSize: moderateScale(FONT_SIZES.xxl),
    fontWeight: "700",
  },
  statLabel: {
    color: COLORS.gray,
    fontSize: moderateScale(FONT_SIZES.xs),
    marginTop: scale(2),
  },
  statDivider: {
    width: scale(1),
    height: scale(36),
    backgroundColor: COLORS.cardBorder,
  },
  listContent: {
    paddingHorizontal: scale(SPACING.lg),
    paddingBottom: scale(100),
  },
  winnerCard: {
    backgroundColor: COLORS.card,
    borderRadius: scale(12),
    padding: scale(SPACING.lg),
    marginBottom: scale(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: scale(SPACING.md),
    gap: scale(SPACING.md),
  },
  rankBadge: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: COLORS.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    color: COLORS.gold,
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "700",
  },
  headerInfo: {
    flex: 1,
  },
  giveawayName: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
  },
  drawnDate: {
    color: COLORS.gray,
    fontSize: moderateScale(FONT_SIZES.xs),
    marginTop: scale(2),
  },
  prizeBadge: {
    backgroundColor: COLORS.darkGray,
    borderRadius: scale(8),
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.xs),
  },
  prizeText: {
    color: COLORS.green,
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
  },
  winnerSection: {
    backgroundColor: COLORS.darkGray,
    borderRadius: scale(10),
    padding: scale(SPACING.md),
    marginBottom: scale(SPACING.md),
  },
  trophyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(SPACING.sm),
    marginBottom: scale(SPACING.xs),
  },
  trophyEmoji: {
    fontSize: moderateScale(18),
  },
  winnerName: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(SPACING.sm),
    marginTop: scale(SPACING.sm),
  },
  contactText: {
    color: COLORS.lightGray,
    fontSize: moderateScale(FONT_SIZES.sm),
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(SPACING.xs),
  },
  footerText: {
    color: COLORS.gray,
    fontSize: moderateScale(FONT_SIZES.sm),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: scale(80),
    gap: scale(SPACING.sm),
  },
  emptyEmoji: {
    fontSize: moderateScale(48),
  },
  emptyTitle: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "600",
    marginTop: scale(SPACING.md),
  },
  emptySubtitle: {
    color: COLORS.gray,
    fontSize: moderateScale(FONT_SIZES.sm),
    textAlign: "center",
    paddingHorizontal: scale(SPACING.xxl),
  },
});
