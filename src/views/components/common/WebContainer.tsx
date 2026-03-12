import { Platform, StyleSheet, View } from "react-native";
import { COLORS } from "../../../theme/colors";

interface WebContainerProps {
  children: React.ReactNode;
  maxWidth?: number;
}

export function WebContainer({ children, maxWidth = 1400 }: WebContainerProps) {
  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View style={styles.outer}>
      <View style={[styles.inner, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: "center",
    width: "100%",
    backgroundColor: COLORS.background, // fixes white sides
  },
  inner: {
    flex: 1,
    width: "100%",
  },
});
