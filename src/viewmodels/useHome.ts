import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
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
  // null  = no error (either loading or loaded successfully)
  // true  = fetch failed after all retries — show error + retry button
  const [newsError, setNewsError] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeTabType>("latest");
  const [featuredPlayer, setFeaturedPlayer] = useState<FeaturedPlayer | null>(null);
  const [featuredBar, setFeaturedBar] = useState<FeaturedBar | null>(null);

  // ----- Derived -----
  const firstName = profile?.name?.split(" ")[0] || "Player";

  // Track whether the initial load has already run so useFocusEffect
  // doesn't re-fetch on the very first mount (useEffect handles that).
  const initialLoadDone = useRef(false);

  // ----- Data Fetching -----

  const fetchNews = useCallback(async () => {
    try {
      setNewsLoading(true);
      setNewsError(false);
      const items = await rssService.getLatestNews();
      // items is [] only when the feed genuinely has no articles after retries
      setNewsItems(items);
    } catch (error) {
      // rssService throws only after exhausting all retries — this is a real
      // network/parse failure, not an empty feed.
      console.error("[useHome] News fetch failed after retries:", error);
      setNewsError(true);
      // Leave newsItems as-is so a previously successful load stays visible
      // during a background re-fetch if we ever add that pattern.
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
      console.error("[useHome] Failed to fetch featured content:", error);
    }
  }, []);

  // ----- Initial Load -----
  useEffect(() => {
    initialLoadDone.current = true;
    fetchNews();
    fetchFeaturedContent();
  }, [fetchNews, fetchFeaturedContent]);

  // ----- Focus Refresh ─────────────────────────────────────────────────────
  // Re-fetch news when the user navigates back to the Home tab.
  // Matches the pattern used in useGiveaways.ts.
  // Skips the very first focus event since useEffect already handles that.
  useFocusEffect(
    useCallback(() => {
      if (!initialLoadDone.current) return;
      // Only re-fetch if the last attempt failed — avoids unnecessary
      // network calls every time the user switches tabs.
      if (newsError) {
        fetchNews();
      }
    }, [newsError, fetchNews]),
  );

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
    newsError,
    refreshing,
    activeTab,
    featuredPlayer,
    featuredBar,

    // Actions
    setActiveTab,
    handleRefresh,
    retryNews: fetchNews,
    openArticle,
    openAddress,
    callPhone,
    openWebsite,
    navigateTo,
  };
}
