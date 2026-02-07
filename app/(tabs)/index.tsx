import { useEffect, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { featuredContentService } from "../../src/models/services/featured-content.service";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { Loading } from "../../src/views/components/common/loading";

// Types/Models
interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
}

interface FeaturedPlayer {
  id: number;
  name?: string;
  user_name?: string;
  label_about_the_person?: string;
  description?: string;
  home_city?: string;
  home_state?: string;
  profile_image_url?: string;
  avatar_url?: string;
  preferred_game?: string;
  fargo_rating?: number;
  favorite_player?: string;
  achievements?: string[];
}

interface FeaturedBar {
  id: number;
  name?: string;
  description?: string;
  city?: string;
  state?: string;
  address?: string;
  phone?: string;
  website?: string;
  hours_of_operation?: string;
  photo_url?: string;
  highlights?: string[];
}

type TabType = "latest" | "featured" | "bars";

// =============================================================
// Circular Overlapping Image Component
// Reusable for both Featured Player and Featured Bar
// =============================================================
interface CircularFeaturedImageProps {
  imageUrl?: string | null;
  fallbackEmoji: string;
  size?: number;
  overlapAmount?: number;
}

function CircularFeaturedImage({
  imageUrl,
  fallbackEmoji,
  size = 140,
  overlapAmount = 20,
}: CircularFeaturedImageProps) {
  const [imageError, setImageError] = useState(false);
  const hasValidImage = !!imageUrl && !imageError;
  const ringThickness = 4;
  const glowPadding = 8;

  return (
    <View
      style={[
        styles.circularImageWrapper,
        {
          marginTop: -overlapAmount,
          width: size + glowPadding * 2,
          height: size + glowPadding * 2,
        },
      ]}
    >
      {/* Outer glow layer */}
      <View
        style={[
          styles.circularImageGlow,
          {
            width: size + glowPadding * 2,
            height: size + glowPadding * 2,
            borderRadius: (size + glowPadding * 2) / 2,
          },
        ]}
      >
        {/* Blue border ring */}
        <View
          style={[
            styles.circularImageBorder,
            {
              width: size + ringThickness * 2,
              height: size + ringThickness * 2,
              borderRadius: (size + ringThickness * 2) / 2,
            },
          ]}
        >
          {/* Inner image container */}
          <View
            style={[
              styles.circularImageInner,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          >
            {hasValidImage ? (
              <Image
                source={{ uri: imageUrl }}
                style={[
                  styles.circularImage,
                  { width: size, height: size, borderRadius: size / 2 },
                ]}
                onError={() => setImageError(true)}
                resizeMode="cover"
              />
            ) : (
              <Text
                style={[styles.circularImageFallback, { fontSize: size * 0.4 }]}
              >
                {fallbackEmoji}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  // State Management (View Model Layer)
  const [newsItems, setNewsItems] = useState<RSSItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("latest");
  const [newsLoading, setNewsLoading] = useState(true);
  const [featuredPlayer, setFeaturedPlayer] = useState<FeaturedPlayer | null>(
    null,
  );
  const [featuredBar, setFeaturedBar] = useState<FeaturedBar | null>(null);
  const [userState, setUserState] = useState<string>("Arizona");

  // Effects
  useEffect(() => {
    fetchRSSFeed();
    fetchFeaturedContent();
  }, []);

  // Data Layer Functions
  const fetchFeaturedContent = async () => {
    try {
      console.log("🔄 Fetching featured content from Supabase...");

      const [players, bars] = await Promise.all([
        featuredContentService.getFeaturedPlayers(),
        featuredContentService.getFeaturedBars(),
      ]);

      // Get the first active player
      const activePlayer = players.find((p) => p.is_active);
      if (activePlayer) {
        const mapped: FeaturedPlayer = {
          id: activePlayer.id,
          name: activePlayer.name || activePlayer.profiles?.name,
          user_name: activePlayer.profiles?.user_name,
          label_about_the_person: activePlayer.nickname,
          description: activePlayer.bio,
          home_city: activePlayer.location?.split(",")[0]?.trim(),
          home_state: activePlayer.location?.split(",")[1]?.trim(),
          profile_image_url: activePlayer.photo_url,
          fargo_rating: (activePlayer as any).fargo_rating,
          preferred_game: (activePlayer as any).preferred_game,
          achievements: activePlayer.achievements,
        };
        console.log("✅ Setting featured player:", mapped.name);
        setFeaturedPlayer(mapped);
      } else {
        console.log("ℹ️ No active featured player found");
        setFeaturedPlayer(null);
      }

      // Get the first active bar
      const activeBar = bars.find((b) => b.is_active);
      if (activeBar) {
        const barLocation =
          activeBar.location ||
          (activeBar.venues
            ? `${activeBar.venues.city}, ${activeBar.venues.state}`
            : "");
        const mapped: FeaturedBar = {
          id: activeBar.id,
          name: activeBar.name || activeBar.venues?.venue,
          description: activeBar.description,
          city: barLocation.split(",")[0]?.trim(),
          state: barLocation.split(",")[1]?.trim(),
          address: activeBar.venues?.address,
          phone: undefined,
          website: undefined,
          hours_of_operation: activeBar.hours_of_operation,
          photo_url: activeBar.photo_url,
          highlights: activeBar.highlights,
        };
        console.log("✅ Setting featured bar:", mapped.name);
        setFeaturedBar(mapped);
      } else {
        console.log("ℹ️ No active featured bar found");
        setFeaturedBar(null);
      }
    } catch (error) {
      console.error("Failed to fetch featured content:", error);
    }
  };

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

  // Business Logic Functions
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

  // Event Handlers
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRSSFeed();
    await fetchFeaturedContent();
    setRefreshing(false);
  };

  const openArticle = (url: string) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  // View Layer (UI Components)
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
        {/* Latest News Tab */}
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

        {/* Featured Player Tab */}
        {activeTab === "featured" && (
          <View style={styles.featuredContainer}>
            {featuredPlayer ? (
              <>
                {/* Spacer for the overlapping image */}
                <View style={styles.imageOverlapSpacer} />

                {/* Featured Player Header Card */}
                <View style={styles.featuredHeader}>
                  {/* Circular Overlapping Player Image */}
                  <CircularFeaturedImage
                    imageUrl={
                      featuredPlayer.profile_image_url ||
                      featuredPlayer.avatar_url
                    }
                    fallbackEmoji="👤"
                    size={180}
                    overlapAmount={0}
                  />

                  <Text style={styles.playerName}>
                    {featuredPlayer.name || featuredPlayer.user_name}
                  </Text>
                  <Text style={styles.playerTitle}>
                    {featuredPlayer.label_about_the_person || "Pool Enthusiast"}
                  </Text>
                  <Text style={styles.playerLocation}>
                    {featuredPlayer.home_city}, {featuredPlayer.home_state}
                  </Text>
                </View>

                {/* Player Description */}
                <View style={styles.descriptionContainer}>
                  <Text style={styles.sectionLabel}>PLAYER OF THE MONTH</Text>
                  <Text style={styles.description}>
                    {featuredPlayer.description || "No description available."}
                  </Text>
                </View>

                {/* Quick Stats */}
                <View style={styles.statsContainer}>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>8</Text>
                    <Text style={styles.statLabel}>Years Playing</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {featuredPlayer.preferred_game || "N/A"}
                    </Text>
                    <Text style={styles.statLabel}>Favorite Game</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {featuredPlayer.fargo_rating || "N/A"}
                    </Text>
                    <Text style={styles.statLabel}>Fargo Rating</Text>
                  </View>
                </View>

                {/* Recent Highlights */}
                {featuredPlayer.achievements &&
                  featuredPlayer.achievements.length > 0 && (
                    <View style={styles.highlightsContainer}>
                      <Text style={styles.highlightsTitle}>
                        Recent Highlights
                      </Text>
                      {featuredPlayer.achievements.map((achievement, index) => (
                        <View key={index} style={styles.highlightItem}>
                          <Text style={styles.highlightIcon}>🏆</Text>
                          <Text style={styles.highlightText}>
                            {achievement}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
              </>
            ) : (
              <View style={styles.loadingContainer}>
                <Loading message="Loading featured player..." />
              </View>
            )}
          </View>
        )}

        {/* Featured Bar Tab */}
        {activeTab === "bars" && (
          <View style={styles.featuredContainer}>
            {featuredBar ? (
              <>
                {/* Spacer for the overlapping image */}
                <View style={styles.imageOverlapSpacer} />

                {/* Featured Bar Header Card */}
                <View style={styles.featuredHeader}>
                  {/* Circular Overlapping Bar Image */}
                  <CircularFeaturedImage
                    imageUrl={featuredBar.photo_url}
                    fallbackEmoji="🍻"
                    size={180}
                    overlapAmount={0}
                  />

                  <Text style={styles.barName}>{featuredBar.name}</Text>
                  <Text style={styles.barLocation}>
                    {featuredBar.city}, {featuredBar.state}
                  </Text>
                </View>

                {/* Bar Description */}
                <View style={styles.descriptionContainer}>
                  <Text style={styles.sectionLabel}>FEATURED THIS MONTH</Text>
                  <Text style={styles.description}>
                    {featuredBar.description || "No description available."}
                  </Text>
                </View>

                {/* Bar Highlights */}
                {featuredBar.highlights &&
                  featuredBar.highlights.length > 0 && (
                    <View style={styles.highlightsContainer}>
                      <Text style={styles.highlightsTitle}>Why Visit Us</Text>
                      {featuredBar.highlights.map((highlight, index) => (
                        <View key={index} style={styles.highlightItem}>
                          <Text style={styles.highlightIcon}>⭐</Text>
                          <Text style={styles.highlightText}>{highlight}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                {/* Bar Info */}
                <View style={styles.barInfoContainer}>
                  {featuredBar.address && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>📍</Text>
                      <Text style={styles.infoText}>{featuredBar.address}</Text>
                    </View>
                  )}
                  {featuredBar.phone && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>📞</Text>
                      <Text style={styles.infoText}>{featuredBar.phone}</Text>
                    </View>
                  )}
                  {featuredBar.website && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>🌐</Text>
                      <Text style={styles.infoText}>{featuredBar.website}</Text>
                    </View>
                  )}
                  {featuredBar.hours_of_operation && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>🕒</Text>
                      <Text style={styles.infoText}>
                        {featuredBar.hours_of_operation}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.loadingContainer}>
                <Loading message="Loading featured bar..." />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const OVERLAP_AMOUNT = 24;
const PLAYER_IMAGE_SIZE = 180;
const BAR_IMAGE_SIZE = 180;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
    alignItems: "center",
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
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
    backgroundColor: "#000000",
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: "#333333",
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
    marginLeft: 30,
  },
  newsFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginLeft: 30,
  },
  newsInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  newsAuthor: {
    fontSize: FONT_SIZES.sm,
    color: "#ff8c00",
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

  // =========================================================
  // Featured Content Styles (Player & Bar)
  // =========================================================
  featuredContainer: {
    flex: 1,
  },

  // Spacer above the card to reserve room for the overlapping circle
  imageOverlapSpacer: {
    height: 10,
  },

  featuredHeader: {
    backgroundColor: COLORS.backgroundCard,
    alignItems: "center",
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: SPACING.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },

  // ---------------------------------------------------------
  // Circular Overlapping Image Styles
  // ---------------------------------------------------------
  circularImageWrapper: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  circularImageGlow: {
    alignItems: "center",
    justifyContent: "center",
    // Soft blue glow (works on iOS via shadow, Android via elevation)
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  circularImageBorder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    // The 3px blue ring is achieved by the size difference
    // between border (size+6) and inner (size) = 3px per side
  },
  circularImageInner: {
    backgroundColor: COLORS.backgroundCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  circularImage: {
    // Dimensions applied inline via props
  },
  circularImageFallback: {
    color: COLORS.textSecondary,
  },

  // ---------------------------------------------------------
  // Player-specific styles
  // ---------------------------------------------------------
  playerName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  playerTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  playerLocation: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // ---------------------------------------------------------
  // Bar-specific styles
  // ---------------------------------------------------------
  barName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  barLocation: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // ---------------------------------------------------------
  // Shared content styles
  // ---------------------------------------------------------
  descriptionContainer: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    letterSpacing: 1,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    lineHeight: 22,
    fontStyle: "italic",
  },
  statsContainer: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.backgroundCard,
    padding: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statNumber: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  highlightsContainer: {
    marginBottom: SPACING.lg,
  },
  highlightsTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  highlightItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  highlightIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
    width: 24,
  },
  highlightText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  barInfoContainer: {
    backgroundColor: COLORS.backgroundCard,
    padding: SPACING.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
    width: 24,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
});
