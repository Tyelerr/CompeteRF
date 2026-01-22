import { Tabs } from "expo-router";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import TabBarIcon from "../../src/views/components/common/tabbaricon";

export default function TabLayout() {
  const { canSubmitTournaments, profile } = useAuthContext();

  // Check if user has admin access (not basic_user)
  const hasAdminAccess = profile?.role && profile.role !== "basic_user";

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
          marginTop: 5,
        },
        tabBarIconStyle: {
          marginTop: 5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji="🏠" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="billiards"
        options={{
          title: "Billiards",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji="🎱" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="submit"
        options={{
          title: "Submit",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji="➕" color={color} focused={focused} />
          ),
          href: canSubmitTournaments ? "/submit" : null,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji="⚙️" color={color} focused={focused} />
          ),
          href: hasAdminAccess ? "/(tabs)/admin" : null,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: "Shop",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji="🛒" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji="👤" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="faq"
        options={{
          title: "FAQ",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon emoji="❓" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="tournament-detail"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
