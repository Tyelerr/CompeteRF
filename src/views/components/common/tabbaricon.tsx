import { useEffect, useRef } from "react";
import { Animated } from "react-native";

interface TabBarIconProps {
  emoji: string;
  color: string;
  focused: boolean;
}

const TabBarIcon = ({ emoji, color, focused }: TabBarIconProps) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.Text style={{ color, fontSize: 24, transform: [{ scale }] }}>
      {emoji}
    </Animated.Text>
  );
};

export default TabBarIcon;
