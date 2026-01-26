import { useEffect, useState } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { Loading } from "../../src/views/components/common/loading";

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
}

type TabType = "latest" | "featured" | "bars";

export default function HomeScreen() {
  const [newsItems, setNewsItems] = useState<RSSItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("latest");
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    fetchRSSFeed();
  }, []);

  const fetchRSSFeed = async () => {
    try {
      setNewsLoading(true);
      const response = await fetch("https://www.azbilliards.com/feed/");
      const text = await response.text();

      // Parse RSS XML
      const items = parseRSSFeed(text);
      setNewsItems(items);
    } catch (error) {
      console.error("Failed to fetch RSS feed:", error);
    } finally {
      setNewsLoading(false);
    }
  };

  const parseRSSFeed = (xmlText: string): RSSItem[] => {
    const items: RSSItem[] = [];

    // Simple XML parsing - in production you might want to use a proper XML parser
    const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/g);

    if (itemMatches) {
      itemMatches.slice(0, 10).forEach((itemXml) => {
        const title = extractXMLContent(itemXml, "title");
        const description = extractXMLContent(itemXml, "description");
        const link = extractXMLContent(itemXml, "link");
        const pubDate = extractXMLContent(itemXml, "pubDate");
        const author =
          extractXMLContent(itemXml, "dc:creator") || "azbilliards";

        if (title && description) {
          items.push({
            title: cleanText(title),
            description: cleanText(description).substring(0, 200) + "...",
            link,
            pubDate: formatDate(pubDate),
            author,
          });
        }
      });
    }

    return items;
  };

  const extractXMLContent = (xml: string, tag: string): string => {
    const match = xml.match(
      new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"),
    );
    if (!match) return "";

    let content = match[1].trim();

    // Remove CDATA wrapper if present
    if (content.startsWith("<![CDATA[") && content.endsWith("]]>")) {
      content = content.slice(9, -3).trim();
    }

    return content;
  };

  const cleanText = (text: string): string => {
    return text
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#038;/g, "&") // Decode &#038; to &
      .replace(/&#8220;/g, '"') // Decode &#8220; to opening quote
      .replace(/&#8221;/g, '"') // Decode &#8221; to closing quote
      .replace(/&#8217;/g, "'") // Decode &#8217; to apostrophe
      .replace(/&#8216;/g, "'") // Decode &#8216; to opening single quote
      .replace(/&#8230;/g, "...") // Decode &#8230; to ellipsis
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec)) // Generic numeric entities
      .trim();
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);

      // Format like "Wed, 21 Jan" or "Tue, 15 Jan"
      const options: Intl.DateTimeFormatOptions = {
        weekday: "short",
        day: "numeric",
        month: "short",
      };

      return date.toLocaleDateString("en-US", options);
    } catch {
      return "Recent";
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRSSFeed();
    setRefreshing(false);
  };

  const openArticle = (url: string) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>BILLIARDS HUB</Text>
        <Text style={styles.subtitle}>
          Your source for the latest pool news and updates
        </Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "latest" && styles.activeTab]}
          onPress={() => setActiveTab("latest")}
        >
          <Text
            style={[
              styles.tabIcon,
              activeTab === "latest" && styles.activeTabIcon,
            ]}
          >
            📰
          </Text>
          <Text
            style={[
              styles.tabText,
              activeTab === "latest" && styles.activeTabText,
            ]}
          >
            Latest News
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "featured" && styles.activeTab]}
          onPress={() => setActiveTab("featured")}
        >
          <Text
            style={[
              styles.tabIcon,
              activeTab === "featured" && styles.activeTabIcon,
            ]}
          >
            🏆
          </Text>
          <Text
            style={[
              styles.tabText,
              activeTab === "featured" && styles.activeTabText,
            ]}
          >
            Featured Player
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "bars" && styles.activeTab]}
          onPress={() => setActiveTab("bars")}
        >
          <Text
            style={[
              styles.tabIcon,
              activeTab === "bars" && styles.activeTabIcon,
            ]}
          >
            📊
          </Text>
          <Text
            style={[
              styles.tabText,
              activeTab === "bars" && styles.activeTabText,
            ]}
          >
            Featured Bar
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
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
                <TouchableOpacity
                  key={index}
                  style={styles.newsCard}
                  onPress={() => openArticle(item.link)}
                >
                  <View style={styles.newsHeader}>
                    <Text style={styles.starIcon}>⭐</Text>
                    <Text style={styles.newsTitle}>{item.title}</Text>
                  </View>

                  <Text style={styles.newsDescription}>{item.description}</Text>

                  <View style={styles.newsFooter}>
                    <View style={styles.newsInfo}>
                      <Text style={styles.newsAuthor}>{item.author}</Text>
                      <Text style={styles.newsDate}>📅 {item.pubDate}</Text>
                    </View>
                    <Text style={styles.externalIcon}>🔗</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {activeTab === "featured" && (
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonEmoji}>🏆</Text>
            <Text style={styles.comingSoonTitle}>Featured Player</Text>
            <Text style={styles.comingSoonText}>Coming Soon!</Text>
          </View>
        )}

        {activeTab === "bars" && (
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonEmoji}>🍻</Text>
            <Text style={styles.comingSoonTitle}>Featured Bar</Text>
            <Text style={styles.comingSoonText}>Coming Soon!</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.backgroundCard,
    marginHorizontal: SPACING.xs,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  activeTab: {
    backgroundColor: COLORS.primary,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: SPACING.xs,
  },
  activeTabIcon: {
    // Keep same color for active tab icon
  },
  tabText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    textAlign: "center",
  },
  activeTabText: {
    color: COLORS.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  loadingContainer: {
    padding: SPACING.xl,
    alignItems: "center",
  },
  newsCard: {
    backgroundColor: "#000000", // Pure black background
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: "#333333", // Thin gray border
  },
  newsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  starIcon: {
    fontSize: 18,
    marginRight: SPACING.sm,
    color: COLORS.warning,
    marginTop: 2,
  },
  newsTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    lineHeight: 24,
    flex: 1,
  },
  newsDescription: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
    marginLeft: 30, // Align with title (star + margin)
  },
  newsFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginLeft: 30, // Align with title (star + margin)
  },
  newsInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  newsAuthor: {
    fontSize: FONT_SIZES.sm,
    color: "#ff8c00", // Orange color for author
    fontWeight: "500",
  },
  newsDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  externalIcon: {
    fontSize: 16,
    color: COLORS.success,
  },
  comingSoon: {
    alignItems: "center",
    paddingVertical: SPACING.xxl,
  },
  comingSoonEmoji: {
    fontSize: 48,
    marginBottom: SPACING.lg,
  },
  comingSoonTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  comingSoonText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
});
