// app/(tabs)/live-tournament/[id].tsx
// Thin route wrapper for the public, read-only "View Tournament" spectator screen.
// Lives under (tabs) so the bottom dock stays visible (hidden from the bar itself
// via href: null in the tab layout).
import { useLocalSearchParams } from "expo-router";
import { LiveTournamentScreen } from "../../../src/views/screens/tournament/live-tournament.screen";

export default function LiveTournamentRoute() {
  const { id, tab, view, focus, fk, me } = useLocalSearchParams<{
    id: string;
    tab?: string;
    view?: string;
    focus?: string;
    fk?: string;
    me?: string;
  }>();
  return (
    <LiveTournamentScreen
      id={id ?? ""}
      initialTab={tab}
      initialView={view}
      focusMatchId={focus}
      focusKey={fk}
      highlightRegId={me ? Number(me) : null}
    />
  );
}
