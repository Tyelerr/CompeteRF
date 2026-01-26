import {
  FeaturedBar,
  FeaturedPlayer,
} from "@/src/models/services/featured-content.service";
import { useFeaturedContent } from "@/src/viewmodels/useFeaturedContent";
import { CreateBarModal } from "@/src/views/components/featured/CreateBarModal";
import { CreatePlayerModal } from "@/src/views/components/featured/CreatePlayerModal";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function FeaturedManagement() {
  const {
    featuredPlayers,
    featuredBars,
    loading,
    error,
    refreshing,
    activeTab,
    setActiveTab,
    onRefresh,
    togglePlayerStatus,
    toggleBarStatus,
    playerStats,
    barStats,
  } = useFeaturedContent();

  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [showCreateBarModal, setShowCreateBarModal] = useState(false);

  const handleCreateSuccess = () => {
    onRefresh();
  };

  const FeaturedPlayerCard = ({ player }: { player: FeaturedPlayer }) => {
    const displayName =
      player.profiles?.name ||
      player.profiles?.user_name ||
      player.name ||
      "Unknown Player";

    return (
      <View style={styles.contentCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleSection}>
            <View>
              <Text style={styles.cardTitle}>{displayName}</Text>
              {player.profiles?.user_name && (
                <Text style={styles.cardUsername}>
                  @{player.profiles.user_name}
                </Text>
              )}
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: player.is_active ? "#10B981" : "#EF4444" },
              ]}
            >
              <Text style={styles.statusText}>
                {player.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            <Switch
              value={player.is_active || false}
              onValueChange={() => togglePlayerStatus(player.id)}
              trackColor={{ false: "#D1D5DB", true: "#10B981" }}
              thumbColor="#FFFFFF"
              style={styles.switch}
            />
          </View>
        </View>

        {player.nickname && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Nickname</Text>
            <Text style={styles.detailValue}>{player.nickname}</Text>
          </View>
        )}

        {player.location && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{player.location}</Text>
          </View>
        )}

        {player.bio && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Bio</Text>
            <Text style={styles.detailValue}>{player.bio}</Text>
          </View>
        )}

        {player.achievements && player.achievements.length > 0 && (
          <View style={styles.achievementsSection}>
            <Text style={styles.sectionTitle}>Achievements</Text>
            {player.achievements.map((achievement: string, index: number) => (
              <View key={index} style={styles.achievementItem}>
                <View style={styles.achievementDot} />
                <Text style={styles.achievementText}>{achievement}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>
            Priority: {player.featured_priority || 0}
          </Text>
          <Text style={styles.cardDate}>
            Added{" "}
            {player.created_at
              ? new Date(player.created_at).toLocaleDateString()
              : "Unknown"}
          </Text>
        </View>
      </View>
    );
  };

  const FeaturedBarCard = ({ bar }: { bar: FeaturedBar }) => {
    const venueName = bar.venues?.venue || bar.name || "Unknown Venue";
    const venueLocation = bar.venues
      ? `${bar.venues.city}, ${bar.venues.state}`
      : bar.location;

    return (
      <View style={styles.contentCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleSection}>
            <View>
              <Text style={styles.cardTitle}>{venueName}</Text>
              {venueLocation && (
                <Text style={styles.cardLocation}>{venueLocation}</Text>
              )}
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: bar.is_active ? "#10B981" : "#EF4444" },
              ]}
            >
              <Text style={styles.statusText}>
                {bar.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            <Switch
              value={bar.is_active || false}
              onValueChange={() => toggleBarStatus(bar.id)}
              trackColor={{ false: "#D1D5DB", true: "#10B981" }}
              thumbColor="#FFFFFF"
              style={styles.switch}
            />
          </View>
        </View>

        {bar.description && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Description</Text>
            <Text style={styles.detailValue}>{bar.description}</Text>
          </View>
        )}

        {bar.hours_of_operation && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Hours of Operation</Text>
            <Text style={styles.detailValue}>{bar.hours_of_operation}</Text>
          </View>
        )}

        {bar.special_features && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Special Features</Text>
            <Text style={styles.detailValue}>{bar.special_features}</Text>
          </View>
        )}

        {bar.highlights && bar.highlights.length > 0 && (
          <View style={styles.highlightsSection}>
            <Text style={styles.sectionTitle}>Highlights</Text>
            {bar.highlights.map((highlight: string, index: number) => (
              <View key={index} style={styles.highlightItem}>
                <View style={styles.highlightDot} />
                <Text style={styles.highlightText}>{highlight}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>
            Priority: {bar.featured_priority || 0}
          </Text>
          <Text style={styles.cardDate}>
            Added{" "}
            {bar.created_at
              ? new Date(bar.created_at).toLocaleDateString()
              : "Unknown"}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Featured Content</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{playerStats.active}</Text>
          <Text style={styles.statLabel}>Active Players</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{barStats.active}</Text>
          <Text style={styles.statLabel}>Active Bars</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {playerStats.total + barStats.total}
          </Text>
          <Text style={styles.statLabel}>Total Featured</Text>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabSection}>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "players" && styles.activeTab]}
            onPress={() => setActiveTab("players")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "players" && styles.activeTabText,
              ]}
            >
              Players ({featuredPlayers.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "bars" && styles.activeTab]}
            onPress={() => setActiveTab("bars")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "bars" && styles.activeTabText,
              ]}
            >
              Bars ({featuredBars.length})
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => {
            if (activeTab === "players") {
              setShowCreatePlayerModal(true);
            } else {
              setShowCreateBarModal(true);
            }
          }}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.createButtonText}>
            Create {activeTab === "players" ? "Player" : "Bar"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.content}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {activeTab === "players" ? (
            featuredPlayers.length > 0 ? (
              featuredPlayers.map((player) => (
                <FeaturedPlayerCard key={player.id} player={player} />
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color="#666666" />
                <Text style={styles.emptyText}>No featured players yet</Text>
                <TouchableOpacity
                  style={styles.emptyCreateButton}
                  onPress={() => setShowCreatePlayerModal(true)}
                >
                  <Text style={styles.emptyCreateText}>
                    Create your first player
                  </Text>
                </TouchableOpacity>
              </View>
            )
          ) : featuredBars.length > 0 ? (
            featuredBars.map((bar) => (
              <FeaturedBarCard key={bar.id} bar={bar} />
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={48} color="#666666" />
              <Text style={styles.emptyText}>No featured bars yet</Text>
              <TouchableOpacity
                style={styles.emptyCreateButton}
                onPress={() => setShowCreateBarModal(true)}
              >
                <Text style={styles.emptyCreateText}>
                  Create your first bar
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <CreatePlayerModal
        visible={showCreatePlayerModal}
        onClose={() => setShowCreatePlayerModal(false)}
        onSuccess={handleCreateSuccess}
      />

      <CreateBarModal
        visible={showCreateBarModal}
        onClose={() => setShowCreateBarModal(false)}
        onSuccess={handleCreateSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#000000",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: 40,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333333",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#3B82F6",
  },
  statLabel: {
    fontSize: 12,
    color: "#999999",
    marginTop: 4,
  },
  tabSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: "#3B82F6",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#999999",
  },
  activeTabText: {
    color: "#FFFFFF",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  errorContainer: {
    backgroundColor: "#DC2626",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#666666",
    marginTop: 12,
    marginBottom: 16,
  },
  emptyCreateButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyCreateText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  contentCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#333333",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  cardTitleSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  cardUsername: {
    fontSize: 14,
    color: "#999999",
    marginTop: 2,
  },
  cardLocation: {
    fontSize: 14,
    color: "#999999",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  switch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  detailItem: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999999",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: "#CCCCCC",
    lineHeight: 20,
  },
  achievementsSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  achievementItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  achievementDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
    marginRight: 12,
  },
  achievementText: {
    fontSize: 14,
    color: "#CCCCCC",
    flex: 1,
  },
  highlightsSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  highlightItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  highlightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F59E0B",
    marginRight: 12,
  },
  highlightText: {
    fontSize: 14,
    color: "#CCCCCC",
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333333",
  },
  cardDate: {
    fontSize: 12,
    color: "#666666",
  },
});
