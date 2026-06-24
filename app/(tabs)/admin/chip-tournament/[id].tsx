// app/(tabs)/admin/chip-tournament/[id].tsx
// Thin route wrapper — the Chip Tournament manage flow (Setup / Live / Results).

import { useLocalSearchParams } from "expo-router";
import { ChipManageScreen } from "../../../../src/views/screens/admin/chip/chip-manage.screen";

export default function ChipTournamentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChipManageScreen id={Number(id)} />;
}
