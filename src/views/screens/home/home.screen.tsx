import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { useAuth } from "../../../viewmodels/hooks/use.auth";
import { useUIStore } from "../../../viewmodels/stores/ui.store";

export const HomeScreen = () => {
  const { profile } = useAuth();
  const { language, setLanguage } = useUIStore();
  const [activeTab, setActiveTab] = useState<"home" | "news" | "featured">(
    "home",
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HOME</Text>
        <View style={styles.languageToggle}>
          <TouchableOpacity
            style={[
              styles.langButton,
              language === "en" && styles.langButtonActive,
            ]}
            onPress={() => setLanguage("en")}
          >
            <Text
              style={[
                styles.langText,
                language === "en" && styles.langTextActive,
              ]}
            >
              EN
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.langButton,
              language === "es" && styles.langButtonActive,
            ]}
            onPress={() => setLanguage("es")}
          >
            <Text
              style={[
                styles.langText,
                language === "es" && styles.langTextActive,
              ]}
            >
              ES
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.welcome}>
        Welcome back, {profile?.name?.split(" ")[0] || "Player"}! 👋
      </Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "home" && styles.tabActive]}
          onPress={() => setActiveTab("home")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "home" && styles.tabTextActive,
            ]}
          >
            Home
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "news" && styles.tabActive]}
          onPress={() => setActiveTab("news")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "news" && styles.tabTextActive,
            ]}
          >
            News
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "featured" && styles.tabActive]}
          onPress={() => setActiveTab("featured")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "featured" && styles.tabTextActive,
            ]}
          >
            Featured
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === "home" && <HomeTab />}
        {activeTab === "news" && <NewsTab />}
        {activeTab === "featured" && <FeaturedTab />}
      </ScrollView>
    </View>
  );
};

const HomeTab = () => {
  const navigation = useNavigation<any>();

  return (
    <View>
      <Text style={styles.sectionTitle}>⚡ QUICK ACTIONS</Text>
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("Billiards")}
        >
          <Text style={styles.actionIcon}>🎱</Text>
          <Text style={styles.actionText}>Browse Tourneys</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("Shop")}
        >
          <Text style={styles.actionIcon}>🎁</Text>
          <Text style={styles.actionText}>Shop</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.actionIcon}>❤️</Text>
          <Text style={styles.actionText}>My Favorites</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>🎁 ACTIVE GIVEAWAYS</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Giveaways coming soon!</Text>
      </View>

      <Text style={styles.sectionTitle}>📅 UPCOMING (Your Favorites)</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          No favorites yet. Browse tournaments to find some!
        </Text>
      </View>
    </View>
  );
};

const NewsTab = () => {
  return (
    <View>
      <Text style={styles.sectionTitle}>📰 BILLIARDS NEWS</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>News feed coming soon!</Text>
      </View>
    </View>
  );
};

const FeaturedTab = () => {
  return (
    <View>
      <Text style={styles.sectionTitle}>🏆 FEATURED BAR</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Featured bar coming soon!</Text>
      </View>

      <Text style={styles.sectionTitle}>🌟 FEATURED PLAYER</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Featured player coming soon!</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  languageToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  langButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  langButtonActive: {
    backgroundColor: COLORS.primary,
  },
  langText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
  },
  langTextActive: {
    color: COLORS.white,
  },
  welcome: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButton: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    width: "30%",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  actionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    textAlign: "center",
  },
  placeholder: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
  },
});
