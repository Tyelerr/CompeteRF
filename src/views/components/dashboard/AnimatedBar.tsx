// src/views/components/dashboard/AnimatedBar.tsx
import { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";

interface AnimatedBarProps {
  widthPercent: number;
  color: string;
  delay?: number;
}

export function AnimatedBar({ widthPercent, color, delay = 0 }: AnimatedBarProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: widthPercent,
      duration: 900,
      delay,
      useNativeDriver: false,
    }).start();
  }, [widthPercent]);

  const width = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    height: 8,
    backgroundColor: "#2C2C2E",
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
});