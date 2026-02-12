// app/legal/_layout.tsx
import { Stack } from "expo-router";

const DARK_BG = "#0F1117";
const BLUE_ACCENT = "#3B82F6";

export default function LegalLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: DARK_BG },
        headerTintColor: BLUE_ACCENT,
        headerTitleStyle: {
          color: "#FFFFFF",
          fontWeight: "600",
          fontSize: 17,
        },
        contentStyle: { backgroundColor: DARK_BG },
      }}
    />
  );
}
