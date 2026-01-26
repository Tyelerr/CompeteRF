import { useState, useEffect } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import {
  featuredContentService,
  FeaturedPlayer,
  FeaturedBar,
  CreateFeaturedPlayerData,
  CreateFeaturedBarData,
} from "@/src/models/services/featured-content.service";

export function useFeaturedContent() {
  // State
  const [featuredPlayers, setFeaturedPlayers] = useState<FeaturedPlayer[]>([]);
  const [featuredBars, setFeaturedBars] = useState<FeaturedBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<"players" | "bars">("players");

  // Load data
  const loadFeaturedContent = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const [playersData, barsData] = await Promise.all([
        featuredContentService.getFeaturedPlayers(),
        featuredContentService.getFeaturedBars(),
      ]);

      setFeaturedPlayers(playersData);
      setFeaturedBars(barsData);
    } catch (err) {
      console.error("Error loading featured content:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load featured content",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeaturedContent(false);
  };

  // Toggle active status
  const togglePlayerStatus = async (playerId: number) => {
    try {
      const updatedPlayer =
        await featuredContentService.toggleFeaturedPlayerStatus(playerId);

      setFeaturedPlayers((prev) =>
        prev.map((player) => (player.id === playerId ? updatedPlayer : player)),
      );
    } catch (err) {
      console.error("Error toggling player status:", err);
      Alert.alert("Error", "Failed to update player status");
    }
  };

  const toggleBarStatus = async (barId: number) => {
    try {
      const updatedBar =
        await featuredContentService.toggleFeaturedBarStatus(barId);

      setFeaturedBars((prev) =>
        prev.map((bar) => (bar.id === barId ? updatedBar : bar)),
      );
    } catch (err) {
      console.error("Error toggling bar status:", err);
      Alert.alert("Error", "Failed to update bar status");
    }
  };

  // Update functions for inline editing
  const updatePlayer = async (
    playerId: number,
    updates: Partial<CreateFeaturedPlayerData>,
  ) => {
    try {
      const updatedPlayer = await featuredContentService.updateFeaturedPlayer(
        playerId,
        updates,
      );

      setFeaturedPlayers((prev) =>
        prev.map((player) => (player.id === playerId ? updatedPlayer : player)),
      );

      return true;
    } catch (err) {
      console.error("Error updating player:", err);
      Alert.alert("Error", "Failed to update player");
      return false;
    }
  };

  const updateBar = async (
    barId: number,
    updates: Partial<CreateFeaturedBarData>,
  ) => {
    try {
      const updatedBar = await featuredContentService.updateFeaturedBar(
        barId,
        updates,
      );

      setFeaturedBars((prev) =>
        prev.map((bar) => (bar.id === barId ? updatedBar : bar)),
      );

      return true;
    } catch (err) {
      console.error("Error updating bar:", err);
      Alert.alert("Error", "Failed to update bar");
      return false;
    }
  };

  // Stats
  const playerStats = {
    total: featuredPlayers.length,
    active: featuredPlayers.filter((p) => p.is_active).length,
    inactive: featuredPlayers.filter((p) => !p.is_active).length,
  };

  const barStats = {
    total: featuredBars.length,
    active: featuredBars.filter((b) => b.is_active).length,
    inactive: featuredBars.filter((b) => !b.is_active).length,
  };

  // Load on focus
  useFocusEffect(
    useCallback(() => {
      loadFeaturedContent();
    }, []),
  );

  return {
    // Data
    featuredPlayers,
    featuredBars,
    loading,
    error,
    refreshing,

    // UI State
    activeTab,
    setActiveTab,

    // Actions
    loadFeaturedContent,
    onRefresh,
    togglePlayerStatus,
    toggleBarStatus,
    updatePlayer,
    updateBar,

    // Stats
    playerStats,
    barStats,
  };
}

// Hook for creating featured players
export function useCreateFeaturedPlayer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);

  // Load available profiles for dropdown
  const loadAvailableProfiles = async () => {
    try {
      const profiles = await featuredContentService.getAvailableProfiles();
      setAvailableProfiles(profiles);
    } catch (err) {
      console.error("Error loading profiles:", err);
      setError("Failed to load profiles");
    }
  };

  // Create player
  const createPlayer = async (
    playerData: CreateFeaturedPlayerData,
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      await featuredContentService.createFeaturedPlayer(playerData);
      return true;
    } catch (err) {
      console.error("Error creating featured player:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create featured player",
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAvailableProfiles();
  }, []);

  return {
    loading,
    error,
    availableProfiles,
    createPlayer,
    loadAvailableProfiles,
  };
}

// Hook for creating featured bars
export function useCreateFeaturedBar() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVenues, setAvailableVenues] = useState<any[]>([]);

  // Load available venues for dropdown
  const loadAvailableVenues = async () => {
    try {
      const venues = await featuredContentService.getAvailableVenues();
      setAvailableVenues(venues);
    } catch (err) {
      console.error("Error loading venues:", err);
      setError("Failed to load venues");
    }
  };

  // Create bar
  const createBar = async (
    barData: CreateFeaturedBarData,
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      await featuredContentService.createFeaturedBar(barData);
      return true;
    } catch (err) {
      console.error("Error creating featured bar:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create featured bar",
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAvailableVenues();
  }, []);

  return {
    loading,
    error,
    availableVenues,
    createBar,
    loadAvailableVenues,
  };
}
