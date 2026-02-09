import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import { featuredContentService } from "../models/services/featured-content.service";
import { rssService } from "../models/services/rss.service";
import {
  FeaturedBar,
  FeaturedPlayer,
  HomeTabType,
  RSSItem,
} from "../models/types/home.types";
import { mapToFeaturedBar, mapToFeaturedPlayer } from "../utils/home-mappers";
import { useAuth } from "./hooks/use.auth";
import { useUIStore } from "./stores/ui.store";

// =============================================================
// useHome ViewModel
// Manages all home screen state & logic.
// The screen component only renders — it never fetches or maps.
// =============================================================

export function useHome() {
  // ----- External Hooks -----
  const { profile } = useAuth();
  const { language, setLanguage } = useUIStore();
  const navigation = useNavigation<any>();

  // ----- State -----
  const [newsItems, setNewsItems] = useState<RSSItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeTabType>("latest");
  const [featuredPlayer, setFeaturedPlayer] = useState<FeaturedPlayer | null>(
    null,
  );
  const [featuredBar, setFeaturedBar] = useState<FeaturedBar | null>(null);

  // ----- Derived -----
  const firstName = profile?.name?.split(" ")[0] || "Player";

  // ----- Data Fetching -----

  const fetchNews = useCallback(async () => {
    try {
      setNewsLoading(true);
      const items = await rssService.getLatestNews();
      setNewsItems(items);
    } catch (error) {
      console.error("Failed to fetch RSS feed:", error);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const fetchFeaturedContent = useCallback(async () => {
    try {
      const [players, bars] = await Promise.all([
        featuredContentService.getFeaturedPlayers(),
        featuredContentService.getFeaturedBars(),
      ]);

      const activePlayer = players.find((p) => p.is_active);
      setFeaturedPlayer(activePlayer ? mapToFeaturedPlayer(activePlayer) : null);

      const activeBar = bars.find((b) => b.is_active);
      setFeaturedBar(activeBar ? mapToFeaturedBar(activeBar) : null);
    } catch (error) {
      console.error("Failed to fetch featured content:", error);
    }
  }, []);

  // ----- Initial Load -----
  useEffect(() => {
    fetchNews();
    fetchFeaturedContent();
  }, [fetchNews, fetchFeaturedContent]);

  // ----- Event Handlers -----

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchNews(), fetchFeaturedContent()]);
    setRefreshing(false);
  }, [fetchNews, fetchFeaturedContent]);

  const openArticle = useCallback((url: string) => {
    if (url) Linking.openURL(url);
  }, []);

  const openAddress = useCallback((address: string) => {
    const encoded = encodeURIComponent(address);
    const url =
      Platform.select({
        ios: `maps:0,0?q=${encoded}`,
        android: `geo:0,0?q=${encoded}`,
      }) || `https://maps.google.com/?q=${encoded}`;
    Linking.openURL(url);
  }, []);

  const callPhone = useCallback((phone: string) => {
    const cleaned = phone.replace(/[^0-9+]/g, "");
    Linking.openURL(`tel:${cleaned}`);
  }, []);

  const openWebsite = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  // Quick Action navigation
  const navigateTo = useCallback(
    (screen: string) => {
      navigation.navigate(screen);
    },
    [navigation],
  );

  // ----- Public API -----
  return {
    // Auth & Settings
    firstName,
    language,
    setLanguage,

    // State
    newsItems,
    newsLoading,
    refreshing,
    activeTab,
    featuredPlayer,
    featuredBar,

    // Actions
    setActiveTab,
    handleRefresh,
    openArticle,
    openAddress,
    callPhone,
    openWebsite,
    navigateTo,
  };
}
