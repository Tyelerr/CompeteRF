import { Stack } from "expo-router";
import { useNavigationContainerRef } from "expo-router/react-navigation";

export default function SearchAlertsLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false }}
      initialRouteName="index"
    />
  );
}