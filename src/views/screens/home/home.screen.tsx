import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useScrollToTopOnFocus } from "../../../viewmodels/hooks/use.scroll.to.top";
import { useHome } from "../../../viewmodels/useHome";
import { Loading } from "../../components/common/loading";
import {
  FeaturedBarTab,
  FeaturedPlayerTab,
  HomeTabBar,
  NewsCard,
} from "../../components/home";
import { styles } from "./home.styles";

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HOME</Text>
      </View>

      <HomeTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === "latest" && (
          <>
            {newsLoading ? (
              <View style={styles.loadingContainer}>
                <Loading message="Loading news..." />
              </View>
            ) : (
              newsItems.map((item, index) => (
                <NewsCard key={index} item={item} onPress={openArticle} />
              ))
            )}
          </>
        )}

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
  );
}
