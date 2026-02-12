import { useEffect, useRef } from "react";
import { Animated, Text } from "react-native";

interface TabBarIconProps {
  emoji: string;
  color: string;
  focused: boolean;
}

const TabBarIcon = ({ emoji, color, focused }: TabBarIconProps) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      console.log(`[BOUNCE START] ${emoji}`);
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 2.0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        console.log(`[BOUNCE END] ${emoji} finished=${finished}`);
      });
    }
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Text style={{ color, fontSize: 24 }}>{emoji}</Text>
    </Animated.View>
  );
};

export default TabBarIcon;
