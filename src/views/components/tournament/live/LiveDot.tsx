// src/views/components/tournament/live/LiveDot.tsx
// A small solid "live" dot. Static (no continuous animation) — a looping
// animation per live match dragged the whole bracket down, so this is just a dot.

import { View } from "react-native";
import { COLORS } from "../../../../theme/colors";

export const LiveDot = ({
  size = 9,
  color = COLORS.success,
}: {
  size?: number;
  color?: string;
}) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
    }}
  />
);
