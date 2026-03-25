// app/tournament/[id].tsx
// Deep link entry point: competerf://tournament/{id}
// Waits for the root layout to mount before redirecting to billiards.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { COLORS } from "../../src/theme/colors";

export default function TournamentDeepLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Let the root layout fully mount before navigating
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready && id) {
      router.replace(`/(tabs)/billiards?tournamentId=${id}` as any);
    }
  }, [ready, id]);

  return <View style={{ flex: 1, backgroundColor: COLORS.background }} />;
}