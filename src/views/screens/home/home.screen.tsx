import { Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useScrollToTopOnFocus } from "../../../viewmodels/hooks/use.scroll.to.top";
import { useHome } from "../../../viewmodels/useHome";
import { COLORS } from "../../../theme/colors";
import { FONT_SIZES, SPACING } from "../../../theme/typography";
import { Loading } from "../../components/common/loading";
import { WebContainer } from "../../components/common/WebContainer";
import {
  FeaturedBarTab,
  FeaturedPlayerTab,
  HomeTabBar,
  NewsCard,
} from "../../components/home";
import { styles } from "./home.styles";

const isWeb = Platform.OS === "web";

export default function HomeScreen() {
  const scrollRef = useScrollToTopOnFocus();
  const {
    newsItems,
    newsLoading,
    newsError,
    refreshing,
    activeTab,
    featuredPlayer,
    featuredBar,
    setActiveTab,
    handleRefresh,
    retryNews,
    openArticle,
    openAddress,
    callPhone,
    openWebsite,
  } = useHome();

  const renderNews = () => {
    // ── Loading ──────────────────────────────────────────────────────────────
    if (newsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <Loading message="Loading news..." />
        </View>
      );
    }

    // ── Fetch failure — network error or timeout after all retries ───────────
    // Distinct from an empty feed: show an actionable error with a Retry button.
    if (newsError) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={[styles.emptyText, { color: COLORS.error, marginBottom: SPACING.md }]}>
            {"Couldn't load news. Check your connection and try again."}
          </Text>
          <TouchableOpacity
            onPress={retryNews}
            style={{
              backgroundColor: COLORS.primary,
              paddingHorizontal: SPACING.lg,
              paddingVertical: SPACING.sm,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: COLORS.white, fontSize: FONT_SIZES.sm, fontWeight: "600" }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── Genuinely empty — fetch succeeded but feed has no articles ───────────
    if (newsItems.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>No news available.</Text>
        </View>
      );
    }

    // ── Success ──────────────────────────────────────────────────────────────
    if (isWeb) {
      const rows: (typeof newsItems)[] = [];
      for (let i = 0; i < newsItems.length; i += 2) {
        rows.push(newsItems.slice(i, i + 2));
      }
      return (
        <View style={styles.newsGrid}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.newsGridRow}>
              {row.map((item, colIndex) => (
                <View key={colIndex} style={styles.newsGridItem}>
                  <NewsCard item={item} onPress={openArticle} />
                </View>
              ))}
              {row.length === 1 && <View style={styles.newsGridItem} />}
            </View>
          ))}
        </View>
      );
    }
    return newsItems.map((item, index) => (
      <NewsCard key={index} item={item} onPress={openArticle} />
    ));
  };

  return (
    <WebContainer>
      <View style={styles.container}>
        {!isWeb && (
          <View
            style={{
              alignItems: "center",
              paddingTop: 56,
              paddingBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: "#FFFFFF",
                letterSpacing: 1,
              }}
            >
              HOME
            </Text>
          </View>
        )}

        <HomeTabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <ScrollView
          ref={scrollRef}
          style={styles.content}
          contentContainerStyle={isWeb ? styles.contentContainerWeb : undefined}
          refreshControl={
            !isWeb ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            ) : undefined
          }
        >
          {activeTab === "latest" && renderNews()}
          {activeTab === "featured" && (
            <FeaturedPlayerTab player={featuredPlayer} />
          )}
          {activeTab === "bars" && (
            <FeaturedBarTab
              bar={featuredBar}
              onOpenAddress={openAddress}
              onCallPhone={callPhone}
              onOpenWebsite={openWebsite}
            />
          )}
        </ScrollView>
      </View>
    </WebContainer>
  );
}
