import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";

interface PoolBallProps {
  gameType: string;
  size?: number;
}

// Map game types to ball numbers and colors
const BALL_CONFIG: Record<
  string,
  { number: string; ballColor: string; stripeColor?: string; textColor: string }
> = {
  "8-Ball": {
    number: "8",
    ballColor: "#1a1a1a",
    textColor: "#FFFFFF",
  },
  "9-Ball": {
    number: "9",
    ballColor: "#FFFFFF",
    stripeColor: "#FFD700",
    textColor: "#000000",
  },
  "10-Ball": {
    number: "10",
    ballColor: "#FFFFFF",
    stripeColor: "#3B82F6",
    textColor: "#000000",
  },
  "One-Pocket": {
    number: "1",
    ballColor: "#FFD700",
    textColor: "#000000",
  },
  "Bank Pool": {
    number: "BP",
    ballColor: "#10B981",
    textColor: "#FFFFFF",
  },
  "Straight Pool": {
    number: "14",
    ballColor: "#22C55E",
    stripeColor: "#FFFFFF",
    textColor: "#000000",
  },
};

const DEFAULT_CONFIG = {
  number: "🎱",
  ballColor: COLORS.primary,
  textColor: "#FFFFFF",
};

export const PoolBall = ({ gameType, size = 80 }: PoolBallProps) => {
  const config = BALL_CONFIG[gameType] || DEFAULT_CONFIG;
  const innerSize = size * 0.5;
  const fontSize = config.number.length > 2 ? size * 0.18 : size * 0.25;

  return (
    <View style={styles.container}>
      {/* Outer ring */}
      <View
        style={[
          styles.outerRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: config.stripeColor || config.ballColor,
          },
        ]}
      >
        {/* Ball body */}
        <View
          style={[
            styles.ball,
            {
              width: size - 8,
              height: size - 8,
              borderRadius: (size - 8) / 2,
              backgroundColor: config.ballColor,
            },
          ]}
        >
          {/* Stripe (for striped balls like 9, 10, 14) */}
          {config.stripeColor && (
            <View
              style={[
                styles.stripe,
                {
                  backgroundColor: config.stripeColor,
                  height: size * 0.3,
                },
              ]}
            />
          )}

          {/* Number circle */}
          <View
            style={[
              styles.numberCircle,
              {
                width: innerSize,
                height: innerSize,
                borderRadius: innerSize / 2,
              },
            ]}
          >
            <Text
              style={[
                styles.number,
                {
                  fontSize: fontSize,
                  color: "#000000",
                },
              ]}
            >
              {config.number}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  outerRing: {
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  ball: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  stripe: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    transform: [{ translateY: -15 }],
  },
  numberCircle: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  number: {
    fontWeight: "700",
  },
});
