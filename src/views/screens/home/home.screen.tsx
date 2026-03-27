import { Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useScrollToTopOnFocus } from "../../../viewmodels/hooks/use.scroll.to.top";
import { useHome } from "../../../viewmodels/useHome";
import { COLORS } from "../../../theme/colors";
import { FONT_SIZES, SPACING } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
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
    if (newsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <Loading message="Loading news..." />
        </View>
      );
    }

    if (newsError) {
      return (
        <View style={styles.loadingContainer}>
          <Text allowFontScaling={false} style={[styles.emptyText, { color: COLORS.error, marginBottom: scale(SPACING.md) }]}>
            {"Couldn't load news. Check your connection and try again."}
          </Text>
          <TouchableOpacity
            onPress={retryNews}
            style={{
              backgroundColor: COLORS.primary,
              paddingHorizontal: scale(SPACING.lg),
              paddingVertical: scale(SPACING.sm),
              borderRadius: 8,
            }}
          >
            <Text allowFontScaling={false} style={{ color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (newsItems.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <Text allowFontScaling={false} style={styles.emptyText}>No news available.</Text>
        </View>
      );
    }

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
              paddingTop: scale(56),
              paddingBottom: scale(16),
            }}
          >
            <Text
              allowFontScaling={false}
              style={{
                fontSize: moderateScale(20),
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
