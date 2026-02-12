import { Text } from "react-native";

interface TabBarIconProps {
  emoji: string;
  color: string;
  focused: boolean;
}

const TabBarIcon = ({ emoji, color, focused }: TabBarIconProps) => {
  return <Text style={{ color, fontSize: 24 }}>{emoji}</Text>;
};

export default TabBarIcon;
