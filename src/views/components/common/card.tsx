import { ReactNode } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";

interface CardProps {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  onPress?: () => void;
  padding?: "none" | "sm" | "md" | "lg";
}

export const Card = ({ children, onPress, padding = "md", style }: CardProps) => {
  const cardStyles = [styles.card, styles[padding], style];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyles}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyles}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  none: {
    padding: 0,
  },
  sm: {
    padding: SPACING.sm,
  },
  md: {
    padding: SPACING.md,
  },
  lg: {
    padding: SPACING.lg,
  },
});

