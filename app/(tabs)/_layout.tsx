import { Tabs, usePathname, useRouter } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import AnimatedTabBarButton from "../../src/views/components/common/AnimatedTabBarButton";
import TabBarIcon from "../../src/views/components/common/tabbaricon";

function WebNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { canSubmitTournaments, profile } = useAuthContext();
  const hasAdminAccess = profile?.role && profile.role !== "basic_user";
  const { width } = useWindowDimensions();
  const isMobileWeb = width < 768;
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs = [
    { name: "index", label: "\uD83C\uDFE0 Home", path: "/" },
    { name: "billiards", label: "\uD83C\uDFB1 Tournaments", path: "/billiards" },
    ...(canSubmitTournaments ? [{ name: "submit", label: "\u2795 Submit", path: "/submit" }] : []),
    ...(hasAdminAccess ? [{ name: "admin", label: "\u2699\uFE0F Admin", path: "/admin" }] : []),
    { name: "shop", label: "\uD83C\uDF81 Giveaways", path: "/shop" },
    { name: "profile", label: "\uD83D\uDC64 Profile", path: "/profile" },
    { name: "faq", label: "\u2753 FAQ", path: "/faq" },
  ];

  const navigate = (path: string) => {
    router.push(path as any);
    setMenuOpen(false);
  };

  return (
    <View>
      <View style={styles.navbar}>
        <View style={styles.navInner}>
          <TouchableOpacity onPress={() => router.push("/")}>
            <Text style={styles.logo}>{"\u26AB"} Compete</Text>
          </TouchableOpacity>

          {isMobileWeb ? (
            <TouchableOpacity style={styles.hamburger} onPress={() => setMenuOpen(!menuOpen)}>
              <Text style={styles.hamburgerText}>{menuOpen ? "\u2715" : "\u2630"}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navLinks}>
              {tabs.map((tab) => {
                const isActive = pathname === tab.path || (tab.path !== "/" && pathname.startsWith(tab.path));
                return (
                  <TouchableOpacity
                    key={tab.name}
                    onPress={() => navigate(tab.path)}
                    style={[styles.navLink, isActive && styles.navLinkActive]}
                  >
                    <Text style={[styles.navLinkText, isActive && styles.navLinkTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {isMobileWeb && menuOpen && (
        <View style={styles.mobileMenu}>
          {tabs.map((tab) => {
            const isActive = pathname === tab.path || (tab.path !== "/" && pathname.startsWith(tab.path));
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => navigate(tab.path)}
                style={[styles.mobileMenuItem, isActive && styles.mobileMenuItemActive]}
              >
                <Text style={[styles.mobileMenuItemText, isActive && styles.mobileMenuItemTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    height: 60,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  navInner: {
    maxWidth: 1400,
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  navLinks: {
    flexDirection: "row",
    gap: 4,
  },
  navLink: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  navLinkActive: {
    backgroundColor: COLORS.primary,
  },
  navLinkText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
  navLinkTextActive: {
    color: COLORS.text,
    fontWeight: "600",
  },
  hamburger: {
    padding: SPACING.sm,
  },
  hamburgerText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "700",
  },
  mobileMenu: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.sm,
  },
  mobileMenuItem: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  mobileMenuItemActive: {
    backgroundColor: COLORS.primary + "20",
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  mobileMenuItemText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: "500",
  },
  mobileMenuItemTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
});

export default function TabLayout() {
  const { canSubmitTournaments, profile } = useAuthContext();
  const hasAdminAccess = profile?.role && profile.role !== "basic_user";
  const insets = useSafeAreaInsets();

  if (Platform.OS === "web") {
    return (
      <Tabs
        tabBar={() => <WebNavBar />}
        screenOptions={{ headerShown: false, tabBarPosition: "top" }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="billiards" />
        <Tabs.Screen name="submit" options={{ href: canSubmitTournaments ? undefined : null }} />
        <Tabs.Screen name="admin" options={{ href: hasAdminAccess ? undefined : null }} />
        <Tabs.Screen name="shop" />
        <Tabs.Screen name="profile" />
        <Tabs.Screen name="faq" />
        <Tabs.Screen name="privacy" options={{ href: null }} />
        <Tabs.Screen name="terms" options={{ href: null }} />
        <Tabs.Screen name="community-guidelines" options={{ href: null }} />
        <Tabs.Screen name="support" options={{ href: null }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
        <Tabs.Screen name="tournament-detail" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="compose-message" options={{ href: null }} />
        <Tabs.Screen name="conversation-detail" options={{ href: null }} />
        <Tabs.Screen name="search-alerts" options={{ href: null }} />
        <Tabs.Screen name="notification-preferences" options={{ href: null }} />
      </Tabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          height: Platform.select({ android: 85, default: 98 }),
          paddingBottom: Platform.select({ android: 32, default: 10 }),
          paddingTop: Platform.select({ android: 4, default: 10 }),
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 12, marginTop: 2 },
        tabBarIconStyle: { marginBottom: 0 },
        tabBarButton: (props) => <AnimatedTabBarButton {...props} />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, focused }) => <TabBarIcon emoji={"\uD83C\uDFE0"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="billiards" options={{ title: "Billiards", tabBarIcon: ({ color, focused }) => <TabBarIcon emoji={"\uD83C\uDFB1"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="submit" options={{ title: "Submit", tabBarIcon: ({ color, focused }) => <TabBarIcon emoji={"\u2795"} color={color} focused={focused} />, href: canSubmitTournaments ? undefined : null }} />
      <Tabs.Screen name="admin" options={{ title: "Admin", tabBarIcon: ({ color, focused }) => <TabBarIcon emoji={"\u2699\uFE0F"} color={color} focused={focused} />, href: hasAdminAccess ? undefined : null }} />
      <Tabs.Screen name="shop" options={{ title: "Giveaways", tabBarIcon: ({ color, focused }) => <TabBarIcon emoji={"\uD83C\uDF81"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, focused }) => <TabBarIcon emoji={"\uD83D\uDC64"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="faq" options={{ title: "FAQ", tabBarIcon: ({ color, focused }) => <TabBarIcon emoji={"\u2753"} color={color} focused={focused} /> }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null }} />
      <Tabs.Screen name="community-guidelines" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="tournament-detail" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="compose-message" options={{ href: null }} />
      <Tabs.Screen name="conversation-detail" options={{ href: null }} />
      <Tabs.Screen name="search-alerts" options={{ href: null }} />
      <Tabs.Screen name="notification-preferences" options={{ href: null }} />
    </Tabs>
  );
}