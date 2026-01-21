import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Button } from "../common/button";

interface EmptyStateProps {
  message: string;
  submessage?: string;
  buttonTitle?: string;
  onButtonPress?: () => void;
}

export const EmptyState = ({
  message,
  submessage,
  buttonTitle,
  onButtonPress,
}: EmptyStateProps) => {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {submessage && <Text style={styles.submessage}>{submessage}</Text>}
      {buttonTitle && onButtonPress && (
        <View style={styles.buttonContainer}>
          <Button title={buttonTitle} onPress={onButtonPress} size="sm" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  message: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  submessage: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  buttonContainer: {
    marginTop: SPACING.md,
  },
});
