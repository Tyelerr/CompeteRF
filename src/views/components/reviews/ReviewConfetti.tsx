// src/views/components/reviews/ReviewConfetti.tsx
// A screen-level, dependency-free confetti burst. Rendered by the PARENT (not inside the review
// modal) so it can keep falling briefly AFTER the modal has closed on a successful submit.
// Self-contained: it animates once on mount and calls onDone shortly after, so the parent can
// unmount it. pointerEvents="none" so it never blocks touches.

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { webMs } from "../../../utils/scaling";

const FALL_MS = 800; // fall duration
const DONE_MS = 1000; // total on-screen time (~0.5s of visible fall after the modal closes)

export const ReviewConfetti = ({ onDone }: { onDone: () => void }) => {
  const pieces = useRef(
    Array.from({ length: 16 }, (_, i) => ({
      key: i,
      x: (i / 16) * 100,
      emoji: ["🎉", "🎊", "⭐", "🎱"][i % 4],
      delay: (i % 5) * 60,
      fall: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    Animated.stagger(
      40,
      pieces.map((p) =>
        Animated.timing(p.fall, {
          toValue: 1,
          duration: FALL_MS,
          delay: p.delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).start();
    const t = setTimeout(onDone, DONE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View pointerEvents="none" style={styles.layer}>
      {pieces.map((p) => (
        <Animated.Text
          key={p.key}
          allowFontScaling={false}
          style={[
            styles.piece,
            {
              left: `${p.x}%`,
              opacity: p.fall.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: p.fall.interpolate({ inputRange: [0, 1], outputRange: [-20, 320] }) },
                { rotate: p.fall.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "260deg"] }) },
              ],
            },
          ]}
        >
          {p.emoji}
        </Animated.Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 1000 },
  piece: { position: "absolute", top: 0, fontSize: webMs(24) },
});
