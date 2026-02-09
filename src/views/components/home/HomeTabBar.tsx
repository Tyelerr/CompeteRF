import { Text, TouchableOpacity, View } from "react-native";
import { HomeTabType } from "../../../models/types/home.types";
import { styles } from "../../screens/home/home.styles";

interface HomeTabBarProps {
  activeTab: HomeTabType;
  onTabChange: (tab: HomeTabType) => void;
}

const TABS: { key: HomeTabType; icon: string; label: string }[] = [
  { key: "latest", icon: "📰", label: "Latest News" },
  { key: "featured", icon: "🏆", label: "Featured Player" },
  { key: "bars", icon: "📊", label: "Featured Bar" },
];

export function HomeTabBar({ activeTab, onTabChange }: HomeTabBarProps) {
  return (
    <View style={styles.tabContainer}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.activeTab]}
            onPress={() => onTabChange(tab.key)}
          >
            <Text style={[styles.tabIcon, isActive && styles.activeTabIcon]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabText, isActive && styles.activeTabText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
