import { Tabs, usePathname, useRouter } from "expo-router";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import AnimatedTabBarButton from "../../src/views/components/common/AnimatedTabBarButton";
import TabBarIcon from "../../src/views/components/common/tabbaricon";

function WebNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { canSubmitTournaments, profile } = useAuthContext();
  const hasAdminAccess = profile?.role && profile.role !== "basic_user";

  const tabs = [
    { name: "index", label: "🏠 Home", path: "/" },
    { name: "billiards", label: "🎱 Tournaments", path: "/billiards" },
    ...(canSubmitTournaments
      ? [{ name: "submit", label: "➕ Submit", path: "/submit" }]
      : []),
    ...(hasAdminAccess
      ? [{ name: "admin", label: "⚙️ Admin", path: "/admin" }]
      : []),
    { name: "shop", label: "🎁 Giveaways", path: "/shop" },
    { name: "profile", label: "👤 Profile", path: "/profile" },
    { name: "faq", label: "❓ FAQ", path: "/faq" },
  ];

  return (
    <View style={styles.navbar}>
      <View style={styles.navInner}>
        <TouchableOpacity onPress={() => router.push("/")}>
          <Text style={styles.logo}>⚫ Compete</Text>
        </TouchableOpacity>

        <View style={styles.navLinks}>
          {tabs.map((tab) => {
            const isActive =
              pathname === tab.path ||
              (tab.path !== "/" && pathname.startsWith(tab.path));
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => router.push(tab.path as any)}
                style={[styles.navLink, isActive && styles.navLinkActive]}
              >
                <Text
                  style={[
                    styles.navLinkText,
                    isActive && styles.navLinkTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
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
    color: "#ffffff",
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
    borderRadius: 8,
  },
  navLinkActive: {
    backgroundColor: COLORS.primary,
  },
  navLinkText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "500",
  },
  navLinkTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
});

export default function TabLayout() {
  const { canSubmitTournaments, profile } = useAuthContext();
  const hasAdminAccess = profile?.role && profile.role !== "basic_user";

  // ─── Web: top navbar ───────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <Tabs
        tabBar={() => <WebNavBar />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: "top",
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="billiards" />
        <Tabs.Screen
          name="submit"
          options={{ href: canSubmitTournaments ? undefined : null }}
        />
        <Tabs.Screen
          name="admin"
          options={{ href: hasAdminAccess ? undefined : null }}
        />
        <Tabs.Screen name="shop" />
        <Tabs.Screen name="profile" />
        <Tabs.Screen name="faq" />
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

  // ─── Mobile: original bottom tab bar ───────────────────────────────
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          height: 98,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarButton: (props) => <AnimatedTabBarButton {...props} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              emoji={"\uD83C\uDFE0"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="billiards"
        options={{
          title: "Billiards",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              emoji={"\uD83C\uDFB1"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="submit"
        options={{
          title: "Submit",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji={"\u2795"} color={color} focused={focused} />
          ),
          href: canSubmitTournaments ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              emoji={"\u2699\uFE0F"}
              color={color}
              focused={focused}
            />
          ),
          href: hasAdminAccess ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: "Giveaways",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              emoji={"\uD83C\uDF81"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              emoji={"\uD83D\uDC64"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="faq"
        options={{
          title: "FAQ",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji={"\u2753"} color={color} focused={focused} />
          ),
        }}
      />
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
