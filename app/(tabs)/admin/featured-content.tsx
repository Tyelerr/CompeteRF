import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFeaturedContent } from "@/src/viewmodels/useFeaturedContent";
import { PlayerCard } from "@/src/views/components/featured/PlayerCard";
import { BarCard } from "@/src/views/components/featured/BarCard";
import { CreatePlayerModal } from "@/src/views/components/featured/CreatePlayerModal";
import { CreateBarModal } from "@/src/views/components/featured/CreateBarModal";

export default function FeaturedContent() {
  const {
    featuredPlayers,
    featuredBars,
    refreshing,
    activeTab,
    setActiveTab,
    onRefresh,
    playerStats,
    barStats,
  } = useFeaturedContent();

  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [showCreateBarModal, setShowCreateBarModal] = useState(false);

  const handleCreateSuccess = () => {
    onRefresh();
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

      {/* Stats */}
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

      {/* Tabs with Create Button */}
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
          {activeTab === "players" ? (
            featuredPlayers.length > 0 ? (
              featuredPlayers.map((player) => (
                <PlayerCard key={player.id} player={player} />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#666666" />
                <Text style={styles.emptyText}>No featured players</Text>
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
            featuredBars.map((bar) => <BarCard key={bar.id} bar={bar} />)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={48} color="#666666" />
              <Text style={styles.emptyText}>No featured bars</Text>
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

      {/* Modals - Separate Components */}
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
    paddingBottom: 20,
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
    padding: 20,
    paddingTop: 0,
  },
  emptyState: {
    alignItems: "center",
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
});
