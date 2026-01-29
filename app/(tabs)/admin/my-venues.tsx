import { useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useMyVenues } from "../../../src/viewmodels/useMyVenues";
import { EmptyState } from "../../../src/views/components/dashboard";

// TD Venue Card - Read-only view with correct data mapping
const TDVenueCard = ({ venue }: { venue: any }) => {
  const handleOpenMaps = () => {
    if (venue.address) {
      const address = `${venue.address}, ${venue.city}, ${venue.state} ${venue.zip_code}`;
      const encodedAddress = encodeURIComponent(address);
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

      Linking.openURL(googleMapsUrl).catch((err) =>
        console.error("Error opening maps:", err),
      );
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.venueName}>{venue.venue}</Text>
        <View style={styles.roleTag}>
          <Text style={styles.roleTagText}>TD</Text>
        </View>
      </View>

      {/* Address - Clickable for maps */}
      {venue.address && (
        <TouchableOpacity onPress={handleOpenMaps} activeOpacity={0.7}>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.addressText}>{venue.address}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🏙️</Text>
            <Text style={styles.infoText}>
              {venue.city}, {venue.state} {venue.zip_code}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Stats - Using actual data from useMyVenues hook */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{venue.activeTournaments || 0}</Text>
          <Text style={styles.statLabel}>Active Events</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{venue.totalFavorites || 0}</Text>
          <Text style={styles.statLabel}>Favorites</Text>
        </View>
      </View>

      {/* Read-only notice */}
      <View style={styles.roleNotice}>
        <Text style={styles.roleNoticeText}>
          🎯 Tournament Director - View Only
        </Text>
      </View>
    </View>
  );
};

export default function MyVenuesScreen() {
  const router = useRouter();
  const vm = useMyVenues();
  const [searchQuery, setSearchQuery] = useState("");

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading your venues...</Text>
      </View>
    );
  }

  const filteredVenues = vm.venues.filter(
    (venue) =>
      venue.venue?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      venue.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      venue.state?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>MY VENUES</Text>
          <Text style={styles.headerSubtitle}>
            Venues where you're assigned as TD
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search venues..."
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          🏢 Read-only view • Contact venue owner for changes
        </Text>
      </View>

      {/* Venue List */}
      <FlatList
        data={filteredVenues}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        }
        renderItem={({ item }) => <TDVenueCard venue={item} />}
        ListEmptyComponent={
          <EmptyState
            message="No venues assigned"
            submessage="You haven't been assigned to any venues as Tournament Director yet. Contact a venue owner or admin to get assigned."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: 2,
  },
  placeholder: {
    width: 50,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: SPACING.sm,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    height: 40,
  },
  infoBanner: {
    backgroundColor: COLORS.primary + "10",
    borderRadius: 8,
    padding: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  infoBannerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    textAlign: "center",
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  roleTag: {
    backgroundColor: COLORS.primary + "20",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  roleTagText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.primary,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  infoIcon: {
    fontSize: FONT_SIZES.sm,
    marginRight: SPACING.xs,
    width: 20,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
  addressText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    flex: 1,
    textDecorationLine: "underline",
  },
  phoneText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    flex: 1,
    textDecorationLine: "underline",
  },
  websiteText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    flex: 1,
    textDecorationLine: "underline",
  },
  statsRow: {
    flexDirection: "row",
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  stat: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  roleNotice: {
    backgroundColor: COLORS.primary + "10",
    borderRadius: 6,
    padding: SPACING.xs,
    marginTop: SPACING.sm,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary,
  },
  roleNoticeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "500",
    textAlign: "center",
  },
});
