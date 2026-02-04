import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { Giveaway } from "../../src/models/types/giveaway.types";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { useGiveaways } from "../../src/viewmodels/useGiveaways";
import { useShop } from "../../src/viewmodels/useShop";
import { Button } from "../../src/views/components/common/button";
import { Loading } from "../../src/views/components/common/loading";
import {
  GiveawayCard,
  GiveawayDetailModal,
  GiveawayEntryModal,
  GiveawayStatsCard,
} from "../../src/views/components/shop";

export default function ShopScreen() {
  const router = useRouter();
  const shopVm = useShop();
  const giveawaysVm = useGiveaways();

  // Direct auth state like FAQ page
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Modal state
  const [selectedGiveaway, setSelectedGiveaway] = useState<Giveaway | null>(
    null,
  );
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);

  // Check user and profile directly like FAQ page
  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user || null);

      if (session?.user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        setProfile(profileData);
      }
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleViewGiveaway = (giveaway: Giveaway) => {
    setSelectedGiveaway(giveaway);
    setShowDetailModal(true);
  };

  const handleEnterGiveaway = (giveaway: Giveaway) => {
    if (!profile) {
      // Redirect to login
      router.push("/auth/login");
      return;
    }
    setSelectedGiveaway(giveaway);
    setShowEntryModal(true);
  };

  const handleEntrySuccess = () => {
    if (selectedGiveaway) {
      giveawaysVm.markAsEntered(selectedGiveaway.id);
    }
  };

  const handleEnterFromDetail = () => {
    setShowDetailModal(false);
    if (selectedGiveaway && !giveawaysVm.isEntered(selectedGiveaway.id)) {
      setTimeout(() => {
        setShowEntryModal(true);
      }, 300);
    }
  };

  // Loading state
  if (giveawaysVm.loading) {
    return <Loading fullScreen message="Loading..." />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SHOP</Text>
        <Text style={styles.headerSubtitle}>
          Discover unique finds & giveaways
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, shopVm.activeTab === "shop" && styles.tabActive]}
          onPress={() => shopVm.setActiveTab("shop")}
        >
          <Text
            style={[
              styles.tabText,
              shopVm.activeTab === "shop" && styles.tabTextActive,
            ]}
          >
            Shop
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            shopVm.activeTab === "giveaways" && styles.tabActive,
          ]}
          onPress={() => shopVm.setActiveTab("giveaways")}
        >
          <Text
            style={[
              styles.tabText,
              shopVm.activeTab === "giveaways" && styles.tabTextActive,
            ]}
          >
            Giveaways
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {shopVm.activeTab === "shop" ? (
        // Shop Tab - Coming Soon
        <View style={styles.comingSoonContainer}>
          <Text style={styles.comingSoonIcon}>🛒</Text>
          <Text style={styles.comingSoonTitle}>Coming Soon!</Text>
          <Text style={styles.comingSoonSubtitle}>
            Shop features are on the way.{"\n"}
            Check back later for gear, apparel, and accessories.
          </Text>
        </View>
      ) : (
        // Giveaways Tab
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={giveawaysVm.refreshing}
              onRefresh={giveawaysVm.refresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Stats Card */}
          <GiveawayStatsCard stats={giveawaysVm.stats} />

          {/* Not logged in banner - NOW USES DIRECT AUTH CHECK */}
          {!authLoading && !profile && (
            <View style={styles.loginBanner}>
              <Text style={styles.loginBannerText}>
                Log in to enter giveaways!
              </Text>
              <View style={styles.loginBannerButtons}>
                <Button
                  title="Log In"
                  onPress={() => router.push("/auth/login")}
                  size="sm"
                />
                <Button
                  title="Sign Up"
                  onPress={() => router.push("/auth/register")}
                  variant="outline"
                  size="sm"
                />
              </View>
            </View>
          )}

          {/* Error state */}
          {giveawaysVm.error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{giveawaysVm.error}</Text>
              <Button
                title="Try Again"
                onPress={giveawaysVm.refresh}
                size="sm"
              />
            </View>
          )}

          {/* Empty state */}
          {!giveawaysVm.error && giveawaysVm.giveaways.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎁</Text>
              <Text style={styles.emptyTitle}>No Active Giveaways</Text>
              <Text style={styles.emptySubtitle}>
                Check back soon for new giveaways!
              </Text>
            </View>
          )}

          {/* Giveaway Cards */}
          {giveawaysVm.giveaways.map((giveaway) => (
            <GiveawayCard
              key={giveaway.id}
              giveaway={giveaway}
              isEntered={giveawaysVm.isEntered(giveaway.id)}
              daysRemaining={giveawaysVm.getDaysRemaining(giveaway.end_date)}
              onEnter={() => handleEnterGiveaway(giveaway)}
              onView={() => handleViewGiveaway(giveaway)}
            />
          ))}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <GiveawayDetailModal
        visible={showDetailModal}
        giveaway={selectedGiveaway}
        isEntered={
          selectedGiveaway ? giveawaysVm.isEntered(selectedGiveaway.id) : false
        }
        daysRemaining={
          selectedGiveaway
            ? giveawaysVm.getDaysRemaining(selectedGiveaway.end_date)
            : ""
        }
        onClose={() => setShowDetailModal(false)}
        onEnter={handleEnterFromDetail}
      />

      {/* Entry Modal */}
      <GiveawayEntryModal
        visible={showEntryModal}
        giveaway={selectedGiveaway}
        onClose={() => setShowEntryModal(false)}
        onSuccess={handleEntrySuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  // Coming Soon (Shop tab)
  comingSoonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  comingSoonIcon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  comingSoonTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  comingSoonSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 24,
  },
  // Login Banner
  loginBanner: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  loginBannerText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    textAlign: "center",
    marginBottom: SPACING.sm,
    fontWeight: "500",
  },
  loginBannerButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  // Error state
  errorContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.error || "#ef4444",
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  // Empty state
  emptyContainer: {
    alignItems: "center",
    padding: SPACING.xl,
    marginTop: SPACING.xl,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    textAlign: "center",
  },
});
