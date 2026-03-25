import { Stack } from "expo-router";
import { useNavigationContainerRef } from "@react-navigation/native";

export default function SearchAlertsLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false }}
      initialRouteName="index"
    />
  );
}