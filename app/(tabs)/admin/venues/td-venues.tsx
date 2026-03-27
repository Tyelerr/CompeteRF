import { moderateScale, scale } from "../../../../src/utils/scaling";
import { useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useTournamentDirectorVenues } from "../../../../src/viewmodels/useTournamentDirectorVenues";

const isWeb = Platform.OS === "web";

const TDVenueCard = ({
  venue,
  onPress,
}: {
  venue: any;
  onPress: () => void;
}) => {
  if (!venue.venues) return null;

  const venueData = venue.venues;

  return (
    <TouchableOpacity
      style={styles.venueCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <Text allowFontScaling={false} style={styles.venueName}>{venueData.venue}</Text>
        <View style={styles.statusBadge}>
          <Text allowFontScaling={false} style={styles.statusText}>TD</Text>
        </View>
      </View>

      <Text allowFontScaling={false} style={styles.address}>{venueData.address}</Text>
      <Text allowFontScaling={false} style={styles.location}>
        {venueData.city}, {venueData.state} {venueData.zip_code}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{venue.tournament_count || 0}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Tournaments</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{venue.active_tournaments || 0}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Active Events</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{venue.total_views || 0}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Views</Text>
        </View>
      </View>

      <View style={styles.roleSection}>
        <Text allowFontScaling={false} style={styles.roleText}>
          "\uD83C\uDFAF" Tournament Director - Assigned{" "}
          {new Date(venue.assigned_at).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default function TDVenuesScreen() {
  const router = useRouter();
  const vm = useTournamentDirectorVenues();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading venues...</Text>
      </View>
    );
  }

  const renderVenue = ({ item }: { item: any }) => (
    <TDVenueCard
      venue={item}
      onPress={() => {
        console.log("View venue details:", item);
      }}
    />
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text allowFontScaling={false} style={styles.headerTitle}>My Venues</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>
            Venues where you're assigned as TD
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search venues..."
          placeholderTextColor={COLORS.textMuted}
          value={vm.filters.search}
          onChangeText={vm.updateSearch}
        />
      </View>

      <FlatList
        data={vm.venues}
        renderItem={renderVenue}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}/>
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text allowFontScaling={false} style={styles.emptyIcon}>{"\uD83C\uDFE2"}</Text>
            <Text allowFontScaling={false} style={styles.emptyTitle}>No venue assignments</Text>
            <Text allowFontScaling={false} style={styles.emptyText}>
              Venue assignments will appear here when added by venue owners or
              admins
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: {
    paddingTop: SPACING.lg,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: scale(2),
  },
  placeholder: {
    width: scale(50),
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(8),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.text,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  venueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  venueName: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  statusBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(4),
    borderRadius: scale(12),
  },
  statusText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "600",
    color: COLORS.white,
  },
  address: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginBottom: scale(2),
  },
  location: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  statsRow: {
    backgroundColor: "#000000",
    borderRadius: scale(8),
    flexDirection: "row",
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.white,
    marginBottom: scale(2),
  },
  statLabel: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.white,
    opacity: 0.7,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.white,
    opacity: 0.2,
    marginVertical: SPACING.xs,
  },
  roleSection: {
    backgroundColor: COLORS.primary + "10",
    borderRadius: scale(6),
    padding: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  roleText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "500",
    textAlign: "center",
  },
  emptyState: {
    alignItems: "center",
    padding: SPACING.xl * 2,
  },
  emptyIcon: {
    fontSize: moderateScale(48),
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: moderateScale(20),
  },
});
