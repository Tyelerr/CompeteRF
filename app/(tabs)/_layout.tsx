import { Tabs } from "expo-router";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import AnimatedTabBarButton from "../../src/views/components/common/AnimatedTabBarButton";
import TabBarIcon from "../../src/views/components/common/tabbaricon";
export default function TabLayout() {
  const { canSubmitTournaments, profile } = useAuthContext();
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
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="compose-message"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="conversation-detail"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="search-alerts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notification-preferences"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
