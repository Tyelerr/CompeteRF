import { moderateScale, scale } from "../../../src/utils/scaling";
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
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFeaturedContent } from "@/src/viewmodels/useFeaturedContent";
import { PlayerCard } from "@/src/views/components/featured/PlayerCard";
import { BarCard } from "@/src/views/components/featured/BarCard";
import { CreatePlayerModal } from "@/src/views/components/featured/CreatePlayerModal";
import { CreateBarModal } from "@/src/views/components/featured/CreateBarModal";
import { SPACING } from "../../../src/theme/spacing";

const isWeb = Platform.OS === "web";

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
          <Ionicons name="arrow-back" size={scale(24)} color="#FFFFFF" />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>Featured Content</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text allowFontScaling={false} style={styles.statNumber}>{playerStats.active}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Active Players</Text>
        </View>
        <View style={styles.statCard}>
          <Text allowFontScaling={false} style={styles.statNumber}>{barStats.active}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Active Bars</Text>
        </View>
        <View style={styles.statCard}>
          <Text allowFontScaling={false} style={styles.statNumber}>
            {playerStats.total + barStats.total}
          </Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Total Featured</Text>
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
              allowFontScaling={false}
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
              allowFontScaling={false}
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
          <Ionicons name="add" size={scale(20)} color="#FFFFFF" />
          <Text allowFontScaling={false} style={styles.createButtonText}>
            Create {activeTab === "players" ? "Player" : "Bar"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>
          )
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
                <Ionicons name="people-outline" size={scale(48)} color="#666666" />
                <Text allowFontScaling={false} style={styles.emptyText}>No featured players</Text>
                <TouchableOpacity
                  style={styles.emptyCreateButton}
                  onPress={() => setShowCreatePlayerModal(true)}
                >
                  <Text allowFontScaling={false} style={styles.emptyCreateText}>
                    Create your first player
                  </Text>
                </TouchableOpacity>
              </View>
            )
          ) : featuredBars.length > 0 ? (
            featuredBars.map((bar) => <BarCard key={bar.id} bar={bar} />)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={scale(48)} color="#666666" />
              <Text allowFontScaling={false} style={styles.emptyText}>No featured bars</Text>
              <TouchableOpacity
                style={styles.emptyCreateButton}
                onPress={() => setShowCreateBarModal(true)}
              >
                <Text allowFontScaling={false} style={styles.emptyCreateText}>
                  Create your first bar
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

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
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(20),
    paddingVertical: scale(16),
    backgroundColor: "#000000",
  },
  backButton: {
    padding: scale(8),
  },
  headerTitle: {
    fontSize: moderateScale(20),
    fontWeight: "600",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: scale(40),
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: scale(20),
    paddingBottom: scale(20),
    gap: scale(12),
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: scale(12),
    padding: scale(16),
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333333",
  },
  statNumber: {
    fontSize: moderateScale(24),
    fontWeight: "700",
    color: "#3B82F6",
  },
  statLabel: {
    fontSize: moderateScale(12),
    color: "#999999",
    marginTop: scale(4),
  },
  tabSection: {
    paddingHorizontal: scale(20),
    marginBottom: scale(20),
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1A1A1A",
    borderRadius: scale(12),
    padding: scale(4),
    marginBottom: scale(12),
  },
  tab: {
    flex: 1,
    paddingVertical: scale(12),
    alignItems: "center",
    borderRadius: scale(8),
  },
  activeTab: {
    backgroundColor: "#3B82F6",
  },
  tabText: {
    fontSize: moderateScale(14),
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
    borderRadius: scale(8),
    paddingVertical: scale(12),
    paddingHorizontal: scale(16),
    gap: scale(8),
  },
  createButtonText: {
    fontSize: moderateScale(14),
    fontWeight: "600",
    color: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: scale(20),
    paddingTop: 0,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: scale(60),
  },
  emptyText: {
    fontSize: moderateScale(16),
    color: "#666666",
    marginTop: scale(12),
    marginBottom: scale(16),
  },
  emptyCreateButton: {
    backgroundColor: "#3B82F6",
    borderRadius: scale(8),
    paddingVertical: scale(12),
    paddingHorizontal: scale(24),
  },
  emptyCreateText: {
    fontSize: moderateScale(14),
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
