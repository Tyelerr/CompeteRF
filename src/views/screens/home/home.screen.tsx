import { Platform, RefreshControl, ScrollView, Text, View } from "react-native";
import { useScrollToTopOnFocus } from "../../../viewmodels/hooks/use.scroll.to.top";
import { useHome } from "../../../viewmodels/useHome";
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
    refreshing,
    activeTab,
    featuredPlayer,
    featuredBar,
    setActiveTab,
    handleRefresh,
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
    if (newsItems.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>No news available.</Text>
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
              paddingTop: 56,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#222222",
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
