import { Platform, StyleSheet, View } from "react-native";
import { COLORS } from "../../../theme/colors";

interface WebContainerProps {
  children: React.ReactNode;
}

// WEB shell wrapper. It is FULL-WIDTH on purpose: the page scroller (the screen's own
// ScrollView/FlatList) must span the whole viewport so the mouse wheel scrolls from anywhere
// — including the empty left/right margins — not just over a centered column. Content width
// is capped/centered INSIDE each screen's scroller via its contentContainerStyle
// (maxWidth + alignSelf:center), NOT by a narrow wrapper here (which would leave the outer
// margins outside the scroller as wheel dead-zones). Native is a passthrough.
export function WebContainer({ children }: WebContainerProps) {
  if (Platform.OS !== "web") return <>{children}</>;
  return <View style={styles.outer}>{children}</View>;
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: "100%",
    // default alignItems: stretch → children fill full width (the scroller spans the viewport)
    backgroundColor: COLORS.background, // fills the sides behind centered content
  },
});
