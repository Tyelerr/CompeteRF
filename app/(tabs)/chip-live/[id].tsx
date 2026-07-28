// app/(tabs)/chip-live/[id].tsx
// Thin route wrapper for the public, read-only Chip Tournament Live View (the
// spectator/player experience). Format-aware routing sends chip tournaments here
// instead of the bracket viewer. Lives under (tabs) so the bottom dock stays
// visible (hidden from the bar via href: null in the tab layout).
import { useLocalSearchParams } from "expo-router";
import { ChipLiveScreen } from "../../../src/views/screens/tournament/chip-live.screen";

export default function ChipLiveRoute() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  return <ChipLiveScreen id={id ?? ""} from={from} />;
}
