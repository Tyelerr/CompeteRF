import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const { width, height } = Dimensions.get("window");

interface BreakLoadingScreenProps {
  message?: string;
}

export const BreakLoadingScreen: React.FC<BreakLoadingScreenProps> = ({
  message = "Setting up your profile...",
}) => {
  const cueballX = useRef(new Animated.Value(-100)).current;
  const ballsOpacity = useRef(new Animated.Value(1)).current;
  const ballsScale = useRef(new Animated.Value(1)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  // Individual ball animations for scatter effect
  const ball1X = useRef(new Animated.Value(0)).current;
  const ball1Y = useRef(new Animated.Value(0)).current;
  const ball2X = useRef(new Animated.Value(0)).current;
  const ball2Y = useRef(new Animated.Value(0)).current;
  const ball3X = useRef(new Animated.Value(0)).current;
  const ball3Y = useRef(new Animated.Value(0)).current;
  const ball4X = useRef(new Animated.Value(0)).current;
  const ball4Y = useRef(new Animated.Value(0)).current;
  const ball5X = useRef(new Animated.Value(0)).current;
  const ball5Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      // Reset all positions
      cueballX.setValue(-100);
      ballsOpacity.setValue(1);
      ballsScale.setValue(1);
      textOpacity.setValue(0);
      [
        ball1X,
        ball1Y,
        ball2X,
        ball2Y,
        ball3X,
        ball3Y,
        ball4X,
        ball4Y,
        ball5X,
        ball5Y,
      ].forEach((anim) => anim.setValue(0));

      // Fade in text first
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      // Cue ball approaches
      setTimeout(() => {
        Animated.timing(cueballX, {
          toValue: width * 0.35,
          duration: 1500,
          useNativeDriver: true,
        }).start(() => {
          // Impact and scatter
          Animated.parallel([
            // Balls scatter
            Animated.timing(ball1X, {
              toValue: 50,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(ball1Y, {
              toValue: -30,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(ball2X, {
              toValue: -40,
              duration: 700,
              useNativeDriver: true,
            }),
            Animated.timing(ball2Y, {
              toValue: 40,
              duration: 700,
              useNativeDriver: true,
            }),
            Animated.timing(ball3X, {
              toValue: 60,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(ball3Y, {
              toValue: 20,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(ball4X, {
              toValue: -20,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(ball4Y, {
              toValue: -50,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(ball5X, {
              toValue: 30,
              duration: 750,
              useNativeDriver: true,
            }),
            Animated.timing(ball5Y, {
              toValue: 60,
              duration: 750,
              useNativeDriver: true,
            }),

            // Fade out effect
            Animated.timing(ballsOpacity, {
              toValue: 0.3,
              duration: 800,
              useNativeDriver: true,
            }),
          ]).start();
        });
      }, 500);
    };

    animate();
    const interval = setInterval(animate, 4000); // Repeat every 4 seconds

    return () => clearInterval(interval);
  }, []);

  const Ball = ({
    color,
    number,
    animatedX,
    animatedY,
    size = 24,
  }: {
    color: string;
    number?: string;
    animatedX?: Animated.Value;
    animatedY?: Animated.Value;
    size?: number;
  }) => (
    <Animated.View
      style={[
        styles.ball,
        {
          backgroundColor: color,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: ballsOpacity,
          transform: [
            { translateX: animatedX || 0 },
            { translateY: animatedY || 0 },
            { scale: ballsScale },
          ],
        },
      ]}
    >
      {number && (
        <Text style={[styles.ballNumber, { fontSize: size * 0.4 }]}>
          {number}
        </Text>
      )}
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <Animated.Text style={[styles.message, { opacity: textOpacity }]}>
        {message}
      </Animated.Text>

      <View style={styles.tableContainer}>
        {/* Pool table felt background */}
        <View style={styles.table}>
          {/* Cue ball */}
          <Animated.View
            style={[
              styles.cueBall,
              {
                transform: [{ translateX: cueballX }],
              },
            ]}
          />

          {/* Ball rack formation */}
          <View style={styles.rackContainer}>
            {/* Back row */}
            <View style={styles.ballRow}>
              <Ball
                color="#FFD700"
                number="1"
                animatedX={ball1X}
                animatedY={ball1Y}
              />
            </View>

            {/* Second row */}
            <View style={styles.ballRow}>
              <Ball
                color="#0066CC"
                number="2"
                animatedX={ball2X}
                animatedY={ball2Y}
              />
              <Ball
                color="#FF4444"
                number="3"
                animatedX={ball3X}
                animatedY={ball3Y}
              />
            </View>

            {/* Third row */}
            <View style={styles.ballRow}>
              <Ball
                color="#800080"
                number="4"
                animatedX={ball4X}
                animatedY={ball4Y}
              />
              <Ball color="#000000" number="8" />
              <Ball
                color="#228B22"
                number="6"
                animatedX={ball5X}
                animatedY={ball5Y}
              />
            </View>
          </View>
        </View>
      </View>

      <Animated.Text style={[styles.subText, { opacity: textOpacity }]}>
        Getting things ready...
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  message: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: SPACING.xl * 2,
  },
  subText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xl * 2,
  },
  tableContainer: {
    width: width * 0.8,
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  table: {
    width: "100%",
    height: "100%",
    backgroundColor: "#0F5132", // Pool table green
    borderRadius: 16,
    borderWidth: 8,
    borderColor: "#8B4513", // Wood brown
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cueBall: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    left: 20,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  rackContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  ballRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 1,
  },
  ball: {
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 1,
    shadowColor: "#000",
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.2)",
  },
  ballNumber: {
    color: "#FFFFFF",
    fontWeight: "bold",
    textShadowColor: "#000",
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
});
