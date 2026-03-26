import React, { useCallback, useImperativeHandle } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const { width: SW, height: SH } = Dimensions.get("window");

const PARTICLE_COUNT = 60;
const COLORS_LIST = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
];

interface Particle {
  x: number;
  y: number;
  color: string;
  size: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
}

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function buildParticles(originX: number, originY: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(180, 520);
    return {
      x: originX,
      y: originY,
      color: COLORS_LIST[Math.floor(Math.random() * COLORS_LIST.length)],
      size: randomBetween(6, 12),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - randomBetween(100, 200),
      rotation: randomBetween(0, 360),
      vr: randomBetween(-360, 360),
    };
  });
}

function ParticleView({ particle, trigger }: { particle: Particle; trigger: number }) {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    if (trigger === 0) return;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: randomBetween(900, 1400),
      easing: Easing.out(Easing.quad),
    });
  }, [trigger]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const gravity = 400;
    const x = particle.x + particle.vx * p;
    const y = particle.y + particle.vy * p + 0.5 * gravity * p * p;
    const rotate = particle.rotation + particle.vr * p;
    const opacity = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
    const scale = 1 - p * 0.3;

    return {
      position: "absolute",
      left: x - particle.size / 2,
      top: y - particle.size / 2,
      width: particle.size,
      height: particle.size,
      borderRadius: Math.random() > 0.5 ? particle.size / 2 : 2,
      backgroundColor: particle.color,
      opacity,
      transform: [{ rotate: `${rotate}deg` }, { scale }],
    };
  });

  return <Animated.View style={style} />;
}

export interface ConfettiBurstRef {
  fire: (originX?: number, originY?: number) => void;
}

export const ConfettiBurst = React.forwardRef<ConfettiBurstRef>((_, ref) => {
  const [particles, setParticles] = React.useState<Particle[]>([]);
  const [trigger, setTrigger] = React.useState(0);

  const fire = useCallback((
    originX: number = SW / 2,
    originY: number = SH / 2,
  ) => {
    setParticles(buildParticles(originX, originY));
    setTrigger((t) => t + 1);
  }, []);

  useImperativeHandle(ref, () => ({ fire }), [fire]);

  if (particles.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <ParticleView key={`${trigger}-${i}`} particle={p} trigger={trigger} />
      ))}
    </View>
  );
});
