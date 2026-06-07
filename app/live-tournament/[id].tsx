// app/live-tournament/[id].tsx
// Thin route wrapper for the public, read-only "View Tournament" spectator screen.
import { Stack, useLocalSearchParams } from "expo-router";
import { LiveTournamentScreen } from "../../src/views/screens/tournament/live-tournament.screen";

export default function LiveTournamentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LiveTournamentScreen id={id ?? ""} />
    </>
  );
}
