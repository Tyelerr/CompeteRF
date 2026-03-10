import { Platform, View, StyleSheet } from "react-native";

interface WebContainerProps {
  children: React.ReactNode;
  maxWidth?: number;
}

/**
 * On web: centers content and caps the max width so pages don't stretch
 * On mobile: renders children as-is with no changes
 */
export function WebContainer({ children, maxWidth = 1200 }: WebContainerProps) {
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
  },
  inner: {
    flex: 1,
    width: "100%",
  },
});
