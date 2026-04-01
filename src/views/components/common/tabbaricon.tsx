import { Platform, Text } from "react-native";
import { moderateScale } from "../../../utils/scaling";

interface TabBarIconProps { emoji: string; color: string; focused: boolean; }

const TabBarIcon = ({ emoji, color, focused }: TabBarIconProps) => {
  return (
    <Text
      allowFontScaling={false}
      style={{
        color,
        fontSize: moderateScale(24),
        // Android: remove default font padding that clips emoji glyphs,
        // and lock lineHeight to fontSize so vertical space is exact.
        ...Platform.select({
          android: {
            includeFontPadding: false,
            lineHeight: moderateScale(28),
            textAlign: "center",
            textAlignVertical: "center",
          },
        }),
      }}
    >
      {emoji}
    </Text>
  );
};

export default TabBarIcon;
