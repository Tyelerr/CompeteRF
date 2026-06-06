// src/views/components/tournament/live/LiveDot.tsx
// A small pulsing dot used to mark a live / in-progress match. A solid core with
// an expanding, fading halo. Uses RN Animated (native driver off on web).

import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { COLORS } from "../../../../theme/colors";

const isWeb = Platform.OS === "web";

export const LiveDot = ({
  size = 9,
  color = COLORS.success,
}: {
  size?: number;
  color?: string;
}) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: !isWeb,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.6],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.halo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          },
        ]}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute" },
});
