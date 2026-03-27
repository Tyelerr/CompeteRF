import { Text } from "react-native";
import { moderateScale } from "../../../utils/scaling";

interface TabBarIconProps { emoji: string; color: string; focused: boolean; }

const TabBarIcon = ({ emoji, color, focused }: TabBarIconProps) => {
  return <Text allowFontScaling={false} style={{ color, fontSize: moderateScale(24) }}>{emoji}</Text>;
};

export default TabBarIcon;
