import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { useGiveawayParticipants } from "../../../src/viewmodels/useGiveawayParticipants";
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
  red: "#FF453A",
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

export default function GiveawayParticipantsScreen() {
  const router = useRouter();
  const vm = useGiveawayParticipants();
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const activeFilterName =
    vm.selectedGiveawayId !== null
      ? vm.giveaways.find((g) => g.id === vm.selectedGiveawayId)?.name ||
        "Filtered"
      : null;

  const renderParticipantCard = ({ item }: { item: any }) => (
    <View style={styles.participantCard}>
      {/* Header row: name + giveaway badge */}
      <View style={styles.cardHeader}>
        <Text allowFontScaling={false} style={styles.participantName} numberOfLines={1}>
          {item.name_as_on_id || "Unknown"}
        </Text>
        {item.giveaway_name && (
          <View style={styles.giveawayBadge}>
            <Text allowFontScaling={false} style={styles.giveawayBadgeText} numberOfLines={1}>
              {item.giveaway_name}
            </Text>
          </View>
        )}
      </View>

      {/* Contact info */}
      <View style={styles.infoRow}>
        <Ionicons name="mail-outline" size={14} color={COLORS.gray} />
        <Text
          allowFontScaling={false}
          style={styles.infoText}
          onPress={() => handleEmail(item.email)}
          numberOfLines={1}
        >
          {item.email || "N/A"}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Ionicons name="call-outline" size={14} color={COLORS.gray} />
        <Text
          allowFontScaling={false}
          style={styles.infoText}
          onPress={() => handleCall(item.phone)}
          numberOfLines={1}
        >
          {item.phone || "N/A"}
        </Text>
      </View>

      {/* Bottom row: birthday + entry date + prize */}
      <View style={styles.cardFooter}>
        <View style={styles.footerItem}>
          <Text allowFontScaling={false} style={styles.footerLabel}>Birthday</Text>
          <Text allowFontScaling={false} style={styles.footerValue}>
            {vm.formatBirthday(item.birthday)}
          </Text>
        </View>
        <View style={styles.footerItem}>
          <Text allowFontScaling={false} style={styles.footerLabel}>Entered</Text>
          <Text allowFontScaling={false} style={styles.footerValue}>
            {vm.formatDate(item.created_at)}
          </Text>
        </View>
        {item.giveaway_prize > 0 && (
          <View style={styles.footerItem}>
            <Text allowFontScaling={false} style={styles.footerLabel}>Prize</Text>
            <Text allowFontScaling={false} style={[styles.footerValue, { color: COLORS.green }]}>
              ${item.giveaway_prize?.toLocaleString()}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (vm.loading) return null;
    return (
      <View style={styles.emptyState}>
        <Ionicons name="people-outline" size={48} color={COLORS.darkGray} />
        <Text allowFontScaling={false} style={styles.emptyTitle}>No Participants</Text>
        <Text allowFontScaling={false} style={styles.emptySubtitle}>
          {vm.searchQuery
            ? "No results match your search"
            : "No one has entered any giveaways yet"}
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
        <Text allowFontScaling={false} style={styles.headerTitle}>ALL PARTICIPANTS</Text>
        <View style={{ width: scale(70) }} />
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{vm.totalCount}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{vm.filteredCount}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Showing</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{vm.giveaways.length}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Giveaways</Text>
        </View>
      </View>

      {/* Search + Sort + Filter row */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={COLORS.gray} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, email, phone..."
            placeholderTextColor={COLORS.gray}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
            autoCapitalize="none"
          />
          {vm.searchQuery.length > 0 && (
            <Pressable onPress={() => vm.setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={COLORS.gray} />
            </Pressable>
          )}
        </View>

        {/* Sort button */}
        <Pressable style={styles.iconButton} onPress={vm.cycleSortBy}>
          <Ionicons name="swap-vertical" size={18} color={COLORS.blue} />
        </Pressable>

        {/* Filter button */}
        <Pressable
          style={[
            styles.iconButton,
            activeFilterName && styles.iconButtonActive,
          ]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons
            name="filter"
            size={18}
            color={activeFilterName ? COLORS.white : COLORS.blue}
          />
        </Pressable>
      </View>

      {/* Active filter indicator */}
      {activeFilterName && (
        <View style={styles.activeFilterRow}>
          <Text allowFontScaling={false} style={styles.activeFilterText}>
            Showing: {activeFilterName}
          </Text>
          <Pressable onPress={() => vm.selectGiveaway(null)}>
            <Ionicons name="close-circle" size={18} color={COLORS.gray} />
          </Pressable>
        </View>
      )}

      {/* Sort indicator */}
      <View style={styles.sortIndicator}>
        <Text allowFontScaling={false} style={styles.sortIndicatorText}>
          Sorted by:{" "}
          {vm.sortBy === "newest"
            ? "Newest first"
            : vm.sortBy === "oldest"
            ? "Oldest first"
            : "Name A-Z"}
        </Text>
      </View>

      {/* Loading */}
      {vm.loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.blue} />
        </View>
      ) : (
        <FlatList
          data={vm.entries}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderParticipantCard}
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

      {/* Filter Modal */}
      <Modal visible={filterModalVisible} animationType="fade" transparent>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setFilterModalVisible(false)}
        >
          <View
            style={styles.filterModal}
            onStartShouldSetResponder={() => true}
          >
            <Text allowFontScaling={false} style={styles.filterModalTitle}>Filter by Giveaway</Text>

            {/* All option */}
            <Pressable
              style={[
                styles.filterOption,
                vm.selectedGiveawayId === null && styles.filterOptionActive,
              ]}
              onPress={() => {
                vm.selectGiveaway(null);
                setFilterModalVisible(false);
              }}
      >
              <Text
                allowFontScaling={false}
                style={[
                  styles.filterOptionText,
                  vm.selectedGiveawayId === null &&
                    styles.filterOptionTextActive,
                ]}
              >
                All Giveaways
              </Text>
              {vm.selectedGiveawayId === null && (
                <Ionicons name="checkmark" size={18} color={COLORS.blue} />
              )}
            </Pressable>

            {/* Giveaway options */}
            <FlatList
              data={vm.giveaways}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item: g }) => (
                <Pressable
                  style={[
                    styles.filterOption,
                    vm.selectedGiveawayId === g.id && styles.filterOptionActive,
                  ]}
                  onPress={() => {
                    vm.selectGiveaway(g.id);
                    setFilterModalVisible(false);
                  }}
      >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.filterOptionText,
                      vm.selectedGiveawayId === g.id &&
                        styles.filterOptionTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {g.name}
                  </Text>
                  {vm.selectedGiveawayId === g.id && (
                    <Ionicons name="checkmark" size={18} color={COLORS.blue} />
                  )}
                </Pressable>
              )}
              style={{ maxHeight: scale(300) }}
            />
          </View>
        </Pressable>
      </Modal>
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
    paddingVertical: scale(SPACING.md),
    marginBottom: scale(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: COLORS.blue,
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
  },
  statLabel: {
    color: COLORS.gray,
    fontSize: moderateScale(FONT_SIZES.xs),
    marginTop: scale(2),
  },
  statDivider: {
    width: scale(1),
    height: scale(30),
    backgroundColor: COLORS.cardBorder,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: scale(SPACING.lg),
    marginBottom: scale(SPACING.sm),
    gap: scale(SPACING.sm),
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: scale(10),
    paddingHorizontal: scale(SPACING.md),
    height: scale(40),
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: scale(SPACING.sm),
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.sm),
  },
  iconButton: {
    backgroundColor: COLORS.card,
    borderRadius: scale(10),
    width: scale(40),
    height: scale(40),
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  iconButtonActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  activeFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: scale(SPACING.lg),
    marginBottom: scale(SPACING.sm),
    backgroundColor: COLORS.blue + "20",
    borderRadius: scale(8),
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
  },
  activeFilterText: {
    color: COLORS.blue,
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
  },
  sortIndicator: {
    marginHorizontal: scale(SPACING.lg),
    marginBottom: scale(SPACING.sm),
  },
  sortIndicatorText: {
    color: COLORS.gray,
    fontSize: moderateScale(FONT_SIZES.xs),
  },
  listContent: {
    paddingHorizontal: scale(SPACING.lg),
    paddingBottom: scale(100),
  },
  participantCard: {
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
    justifyContent: "space-between",
    marginBottom: scale(SPACING.md),
  },
  participantName: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    flex: 1,
    marginRight: scale(SPACING.sm),
  },
  giveawayBadge: {
    backgroundColor: COLORS.darkGray,
    borderRadius: scale(8),
    paddingHorizontal: scale(SPACING.sm),
    paddingVertical: scale(SPACING.xs),
    maxWidth: scale(140),
  },
  giveawayBadgeText: {
    color: COLORS.blue,
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(SPACING.sm),
    marginBottom: scale(SPACING.sm),
  },
  infoText: {
    color: COLORS.lightGray,
    fontSize: moderateScale(FONT_SIZES.sm),
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    marginTop: scale(SPACING.sm),
    paddingTop: scale(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    gap: scale(SPACING.lg),
  },
  footerItem: {
    flex: 1,
  },
  footerLabel: {
    color: COLORS.gray,
    fontSize: moderateScale(FONT_SIZES.xs),
    marginBottom: scale(2),
  },
  footerValue: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "500",
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
  },
  // Filter Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  filterModal: {
    backgroundColor: COLORS.card,
    borderRadius: scale(16),
    width: "85%",
    maxHeight: "60%",
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: "hidden",
  },
  filterModalTitle: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    padding: scale(SPACING.lg),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: scale(SPACING.lg),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  filterOptionActive: {
    backgroundColor: COLORS.blue + "15",
  },
  filterOptionText: {
    color: COLORS.white,
    fontSize: moderateScale(FONT_SIZES.md),
    flex: 1,
  },
  filterOptionTextActive: {
    color: COLORS.blue,
    fontWeight: "600",
  },
});
